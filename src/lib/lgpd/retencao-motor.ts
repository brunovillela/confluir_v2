import "server-only"

import type { SupabaseClient } from "@supabase/supabase-js"

import { REGRAS_RETENCAO, definicaoRegra, type DefinicaoRegra } from "@/lib/lgpd/retencao-regras"

/**
 * MOTOR DE RETENÇÃO (seção 4 de docs/lgpd/retencao.md).
 *
 * Uma rodada por regra: calcula a data de corte (hoje − prazo), junta os
 * registros cuja âncora é anterior a ela, tira os que têm bloqueio por litígio
 * vigente (lgpd_bloqueios_litigio) e então
 *   - em SIMULAÇÃO (regra desligada, ou pedido da tela): só conta;
 *   - em REAL (regra ligada pela entidade, só no cron): elimina ou anonimiza,
 *     apagando antes os arquivos do Storage.
 * Toda rodada vira uma linha em lgpd_retencao_execucoes, só com contagens.
 *
 * O client vem de fora: o cron passa o service client (todas as entidades,
 * com o tenant explícito em cada filtro) e a tela passa o createAdminClient
 * da entidade. Nenhuma consulta depende do RLS para isolar o tenant.
 */

/** Teto por regra e rodada; o resto sai na rodada seguinte. */
const LIMITE_POR_RODADA = 20_000
const PAGINA = 1000
const LOTE = 200
const DIA_MS = 86_400_000

export type ModoRetencao = "simulacao" | "real"

export type RegraGravada = {
  id: string
  codigo: string
  prazoPadraoDias: number
  prazoMinimoDias: number
  prazoDias: number | null
  ativa: boolean
}

export type ResultadoRegra = {
  codigo: string
  modo: ModoRetencao
  prazoDias: number
  corte: string
  linhas: number
  arquivos: number
  bloqueadas: number
  detalhe: Record<string, unknown>
  erro?: string
}

type Contexto = { client: SupabaseClient; tenantId: string }

type Candidato = {
  id: string
  cpf?: string | null
  email?: string | null
  arquivos?: string[]
  extra?: Record<string, unknown>
}

type Grupo = { tabela: string; candidatos: Candidato[] }

type Executor = {
  /** Prazo efetivo quando ele mora em outro módulo (RT30). */
  prazo?: (ctx: Contexto) => Promise<number | null>
  coletar: (ctx: Contexto, corte: string) => Promise<{ grupos: Grupo[]; limiteAtingido: boolean }>
  aplicar: (ctx: Contexto, grupos: Grupo[]) => Promise<{ linhas: number; arquivos: number; falhas: string[] }>
}

function lotes<T>(lista: T[], tamanho = LOTE): T[][] {
  const r: T[][] = []
  for (let i = 0; i < lista.length; i += tamanho) r.push(lista.slice(i, i + tamanho))
  return r
}

function texto(v: unknown): string | null {
  return typeof v === "string" && v.trim() ? v.trim() : null
}

/**
 * Lê todas as linhas de uma consulta em páginas de 1.000 (teto do PostgREST),
 * até o limite da rodada. `montar` recebe o intervalo e devolve a consulta.
 */
async function lerPaginado(
  montar: (de: number, ate: number) => PromiseLike<{ data: unknown[] | null; error: { message: string } | null }>
): Promise<{ linhas: Record<string, unknown>[]; limiteAtingido: boolean }> {
  const linhas: Record<string, unknown>[] = []
  for (let de = 0; de < LIMITE_POR_RODADA; de += PAGINA) {
    const { data, error } = await montar(de, de + PAGINA - 1)
    if (error) throw new Error(error.message)
    const pagina = (data ?? []) as Record<string, unknown>[]
    linhas.push(...pagina)
    if (pagina.length < PAGINA) return { linhas, limiteAtingido: false }
  }
  return { linhas, limiteAtingido: true }
}

async function eliminarPorIds(ctx: Contexto, tabela: string, ids: string[]): Promise<number> {
  let n = 0
  for (const lote of lotes(ids)) {
    const { error, count } = await ctx.client
      .from(tabela)
      .delete({ count: "exact" })
      .eq("emp_proprietaria_id", ctx.tenantId)
      .in("id", lote)
    if (error) throw new Error(`${tabela}: ${error.message}`)
    n += count ?? 0
  }
  return n
}

/** Apaga arquivos de um bucket; devolve os caminhos que saíram e as falhas. */
async function removerArquivos(
  ctx: Contexto,
  bucket: string,
  caminhos: string[]
): Promise<{ ok: Set<string>; falhas: string[] }> {
  const ok = new Set<string>()
  const falhas: string[] = []
  for (const lote of lotes(caminhos, 100)) {
    const { error } = await ctx.client.storage.from(bucket).remove(lote)
    // remove() não falha por arquivo inexistente: o que não existe já saiu.
    if (error) falhas.push(`${bucket}: ${error.message}`)
    else lote.forEach((c) => ok.add(c))
  }
  return { ok, falhas }
}

// ── Identificação da pessoa por trás de uma chave de login_tentativas ──────

/** "senha:<id>", "codigo_votacao:cpf:<cpf>", "codigo_votacao:email:<e-mail>". */
function pessoaDaChave(chave: string): { cpf: string | null; email: string | null } {
  const ultimo = chave.slice(chave.lastIndexOf(":") + 1).trim().toLowerCase()
  if (ultimo.includes("@")) return { cpf: null, email: ultimo }
  const digitos = ultimo.replace(/\D/g, "")
  return { cpf: digitos.length === 11 ? digitos : null, email: null }
}

// ── Executores ──────────────────────────────────────────────────────────────

const EXECUTORES: Record<string, Executor> = {
  /** RT30: foto do inscrito em evento após eventos_config.retencao_foto_dias. */
  RT30: {
    async prazo(ctx) {
      const { data } = await ctx.client
        .from("eventos_config")
        .select("retencao_foto_dias")
        .eq("emp_proprietaria_id", ctx.tenantId)
        .maybeSingle()
      const dias = Number(data?.retencao_foto_dias)
      return Number.isFinite(dias) && dias > 0 ? dias : null
    },
    async coletar(ctx, corte) {
      const { linhas, limiteAtingido } = await lerPaginado((de, ate) =>
        ctx.client
          .from("eventos_inscricoes")
          .select("id, cpf, email, foto_url, acesso_situacao")
          .eq("emp_proprietaria_id", ctx.tenantId)
          .not("foto_url", "is", null)
          .is("foto_expurgada_em", null)
          // Inscrição antiga sem carimbo de captura: vale a data da inscrição.
          .or(`foto_capturada_em.lt.${corte},and(foto_capturada_em.is.null,created_at.lt.${corte})`)
          .order("id")
          .range(de, ate)
      )
      return {
        limiteAtingido,
        grupos: [
          {
            tabela: "eventos_inscricoes",
            candidatos: linhas.map((l) => ({
              id: String(l.id),
              cpf: texto(l.cpf),
              email: texto(l.email),
              arquivos: [String(l.foto_url)],
              extra: { acesso: l.acesso_situacao },
            })),
          },
        ],
      }
    },
    async aplicar(ctx, grupos) {
      const candidatos = grupos[0]?.candidatos ?? []
      const { ok, falhas } = await removerArquivos(
        ctx,
        "eventos",
        candidatos.flatMap((c) => c.arquivos ?? [])
      )
      // Só marca como expurgada a foto que saiu do bucket; o resto fica para a próxima.
      const feitos = candidatos.filter((c) => (c.arquivos ?? []).every((a) => ok.has(a)))
      const agora = new Date().toISOString()
      // Como na exclusão a pedido do titular (eventos-titular.ts): quem chegou
      // ao controle de acesso fica "removido", para a remoção lá.
      const foiParaAcesso = (c: Candidato) => c.extra?.acesso === "enviado" || c.extra?.acesso === "pendente"
      let linhas = 0
      for (const [ids, acesso] of [
        [feitos.filter(foiParaAcesso).map((c) => c.id), true],
        [feitos.filter((c) => !foiParaAcesso(c)).map((c) => c.id), false],
      ] as const) {
        for (const lote of lotes(ids)) {
          const { error, count } = await ctx.client
            .from("eventos_inscricoes")
            .update(
              {
                foto_url: null,
                foto_expurgada_em: agora,
                updated_at: agora,
                ...(acesso ? { acesso_situacao: "removido", acesso_removido_em: agora } : {}),
              },
              { count: "exact" }
            )
            .eq("emp_proprietaria_id", ctx.tenantId)
            .in("id", lote)
          if (error) throw new Error(`eventos_inscricoes: ${error.message}`)
          linhas += count ?? 0
        }
      }
      return { linhas, arquivos: ok.size, falhas }
    },
  },

  /** RT31: tentativas de acesso e códigos enviados com mais de 6 meses. */
  RT31: {
    async coletar(ctx, corte) {
      const tentativas = await lerPaginado((de, ate) =>
        ctx.client
          .from("login_tentativas")
          .select("id, chave")
          .eq("emp_proprietaria_id", ctx.tenantId)
          .or(`ultima_falha_em.lt.${corte},ultima_falha_em.is.null`)
          .order("id")
          .range(de, ate)
      )
      const envios = await lerPaginado((de, ate) =>
        ctx.client
          .from("auth_codigos_envios")
          .select("id, email")
          .eq("emp_proprietaria_id", ctx.tenantId)
          .lt("enviado_em", corte)
          .order("id")
          .range(de, ate)
      )
      return {
        limiteAtingido: tentativas.limiteAtingido || envios.limiteAtingido,
        grupos: [
          {
            tabela: "login_tentativas",
            candidatos: tentativas.linhas.map((l) => ({ id: String(l.id), ...pessoaDaChave(String(l.chave ?? "")) })),
          },
          {
            tabela: "auth_codigos_envios",
            candidatos: envios.linhas.map((l) => ({ id: String(l.id), email: texto(l.email)?.toLowerCase() ?? null })),
          },
        ],
      }
    },
    async aplicar(ctx, grupos) {
      let linhas = 0
      for (const g of grupos) linhas += await eliminarPorIds(ctx, g.tabela, g.candidatos.map((c) => c.id))
      return { linhas, arquivos: 0, falhas: [] }
    },
  },

  /** RT02: ficha pública parada antes da avaliação há mais de 1 ano. */
  RT02: {
    async coletar(ctx, corte) {
      const { linhas, limiteAtingido } = await lerPaginado((de, ate) =>
        ctx.client
          .from("filiacao_solicitacoes")
          .select("id, cpf, email, documento_assinado_url")
          .eq("emp_proprietaria_id", ctx.tenantId)
          .in("situacao", ["aguardando_verificacao", "aguardando_assinatura", "desistente"])
          .or(`updated_at.lt.${corte},and(updated_at.is.null,created_at.lt.${corte})`)
          .order("id")
          .range(de, ate)
      )
      // "Última interação" inclui o histórico de etapas: quem mexeu na ficha
      // depois do corte (reenvio de código, nova tentativa) fica.
      const recentes = new Set<string>()
      for (const lote of lotes(linhas.map((l) => String(l.id)))) {
        const { data, error } = await ctx.client
          .from("filiacao_solicitacao_eventos")
          .select("solicitacao_id")
          .eq("emp_proprietaria_id", ctx.tenantId)
          .in("solicitacao_id", lote)
          .gte("created_at", corte)
        if (error) throw new Error(`filiacao_solicitacao_eventos: ${error.message}`)
        for (const e of data ?? []) recentes.add(String(e.solicitacao_id))
      }
      return {
        limiteAtingido,
        grupos: [
          {
            tabela: "filiacao_solicitacoes",
            candidatos: linhas
              .filter((l) => !recentes.has(String(l.id)))
              .map((l) => {
                const doc = texto(l.documento_assinado_url)
                return {
                  id: String(l.id),
                  cpf: texto(l.cpf)?.replace(/\D/g, "") ?? null,
                  email: texto(l.email)?.toLowerCase() ?? null,
                  arquivos: doc ? [doc] : [],
                }
              }),
          },
        ],
      }
    },
    async aplicar(ctx, grupos) {
      const candidatos = grupos[0]?.candidatos ?? []
      const { ok, falhas } = await removerArquivos(
        ctx,
        "filiacao",
        candidatos.flatMap((c) => c.arquivos ?? [])
      )
      const feitos = candidatos.filter((c) => (c.arquivos ?? []).every((a) => ok.has(a)))
      // O histórico de etapas (filiacao_solicitacao_eventos) sai em cascata.
      const linhas = await eliminarPorIds(ctx, "filiacao_solicitacoes", feitos.map((c) => c.id))
      return { linhas, arquivos: ok.size, falhas }
    },
  },
}

export function regraTemExecutor(codigo: string): boolean {
  return codigo in EXECUTORES
}

// ── Bloqueio por litígio ────────────────────────────────────────────────────

type Bloqueios = { cpfs: Set<string>; emails: Set<string>; registros: Set<string> }

async function carregarBloqueios(ctx: Contexto): Promise<Bloqueios> {
  const { data, error } = await ctx.client
    .from("lgpd_bloqueios_litigio")
    .select("cpf, email, tabela, registro_id")
    .eq("emp_proprietaria_id", ctx.tenantId)
    .is("encerrado_em", null)
  // Sem a tabela de bloqueios não há como saber quem está em processo:
  // melhor não apagar nada.
  if (error) throw new Error(`lgpd_bloqueios_litigio: ${error.message}`)
  const b: Bloqueios = { cpfs: new Set(), emails: new Set(), registros: new Set() }
  for (const l of data ?? []) {
    if (l.cpf) b.cpfs.add(String(l.cpf))
    if (l.email) b.emails.add(String(l.email).toLowerCase())
    if (l.tabela && l.registro_id) b.registros.add(`${l.tabela}:${l.registro_id}`)
  }
  return b
}

function bloqueado(b: Bloqueios, tabela: string, c: Candidato): boolean {
  if (b.registros.has(`${tabela}:${c.id}`)) return true
  const cpf = c.cpf?.replace(/\D/g, "")
  if (cpf && b.cpfs.has(cpf)) return true
  if (c.email && b.emails.has(c.email.toLowerCase())) return true
  return false
}

// ── Rodada ──────────────────────────────────────────────────────────────────

export function prazoEfetivo(regra: RegraGravada): number {
  return Math.max(regra.prazoMinimoDias, regra.prazoDias ?? regra.prazoPadraoDias)
}

function regraDaLinha(l: Record<string, unknown>): RegraGravada {
  return {
    id: String(l.id),
    codigo: String(l.codigo),
    prazoPadraoDias: Number(l.prazo_padrao_dias),
    prazoMinimoDias: Number(l.prazo_minimo_dias ?? 0),
    prazoDias: l.prazo_dias == null ? null : Number(l.prazo_dias),
    ativa: l.ativa === true,
  }
}

/** Garante as linhas do catálogo para a entidade (desligadas) e devolve as regras. */
export async function regrasDoTenant(ctx: Contexto): Promise<RegraGravada[]> {
  const { error: erroUpsert } = await ctx.client.from("lgpd_regras_retencao").upsert(
    REGRAS_RETENCAO.map((d) => ({
      emp_proprietaria_id: ctx.tenantId,
      codigo: d.codigo,
      tabela: d.tabela,
      coluna_ancora: d.colunaAncora,
      prazo_padrao_dias: d.prazoPadraoDias,
      prazo_minimo_dias: d.prazoMinimoDias,
      acao: d.acao,
    })),
    { onConflict: "emp_proprietaria_id,codigo", ignoreDuplicates: true }
  )
  if (erroUpsert) throw new Error(`lgpd_regras_retencao: ${erroUpsert.message}`)
  const { data, error } = await ctx.client
    .from("lgpd_regras_retencao")
    .select("id, codigo, prazo_padrao_dias, prazo_minimo_dias, prazo_dias, ativa")
    .eq("emp_proprietaria_id", ctx.tenantId)
    .order("codigo")
  if (error) throw new Error(`lgpd_regras_retencao: ${error.message}`)
  return (data ?? []).map(regraDaLinha)
}

async function executarRegra(
  ctx: Contexto,
  regra: RegraGravada,
  definicao: DefinicaoRegra,
  modo: ModoRetencao,
  bloqueios: Bloqueios,
  quem: { origem: "cron" | "painel"; usuarioId: string | null }
): Promise<ResultadoRegra> {
  const executor = EXECUTORES[regra.codigo]
  const prazoModulo = definicao.prazoNoModulo && executor.prazo ? await executor.prazo(ctx) : null
  const prazoDias = Math.max(regra.prazoMinimoDias, prazoModulo ?? prazoEfetivo(regra))
  const corte = new Date(Date.now() - prazoDias * DIA_MS).toISOString()
  const resultado: ResultadoRegra = { codigo: regra.codigo, modo, prazoDias, corte, linhas: 0, arquivos: 0, bloqueadas: 0, detalhe: {} }

  const livro = {
    emp_proprietaria_id: ctx.tenantId,
    regra_id: regra.id,
    codigo: regra.codigo,
    modo,
    origem: quem.origem,
    prazo_dias: prazoDias,
    corte,
    usuario_id: quem.usuarioId,
  }
  // Na execução real a linha nasce antes de apagar: se a rodada cair no meio,
  // o livro mostra que ela começou (concluida_em nulo).
  let execucaoId: string | null = null
  if (modo === "real") {
    const { data, error } = await ctx.client.from("lgpd_retencao_execucoes").insert(livro).select("id").single()
    if (error) return { ...resultado, erro: `livro: ${error.message}` }
    execucaoId = String(data.id)
  }

  try {
    const { grupos, limiteAtingido } = await executor.coletar(ctx, corte)
    const porTabela: Record<string, number> = {}
    const livres: Grupo[] = grupos.map((g) => {
      const candidatos = g.candidatos.filter((c) => !bloqueado(bloqueios, g.tabela, c))
      resultado.bloqueadas += g.candidatos.length - candidatos.length
      porTabela[g.tabela] = candidatos.length
      return { tabela: g.tabela, candidatos }
    })
    resultado.detalhe = { porTabela, ...(limiteAtingido ? { limiteAtingido: LIMITE_POR_RODADA } : {}) }
    if (modo === "simulacao") {
      resultado.linhas = livres.reduce((s, g) => s + g.candidatos.length, 0)
      resultado.arquivos = livres.reduce((s, g) => s + g.candidatos.reduce((n, c) => n + (c.arquivos?.length ?? 0), 0), 0)
    } else {
      const feito = await executor.aplicar(ctx, livres)
      resultado.linhas = feito.linhas
      resultado.arquivos = feito.arquivos
      if (feito.falhas.length) resultado.detalhe.falhasStorage = feito.falhas.slice(0, 10)
    }
  } catch (e) {
    resultado.erro = (e as Error).message
  }

  const fim = {
    linhas_afetadas: resultado.linhas,
    arquivos_removidos: resultado.arquivos,
    bloqueadas: resultado.bloqueadas,
    detalhe: resultado.detalhe,
    erro: resultado.erro ?? null,
    concluida_em: new Date().toISOString(),
  }
  const { error } = execucaoId
    ? await ctx.client.from("lgpd_retencao_execucoes").update(fim).eq("id", execucaoId)
    : await ctx.client.from("lgpd_retencao_execucoes").insert({ ...livro, ...fim })
  if (error && !resultado.erro) resultado.erro = `livro: ${error.message}`
  return resultado
}

/**
 * Roda as regras do catálogo para uma entidade. Regra ligada roda em REAL só
 * quando `permitirReal` (o cron); a tela sempre simula.
 */
export async function rodarRetencao(opcoes: {
  client: SupabaseClient
  tenantId: string
  origem: "cron" | "painel"
  usuarioId?: string | null
  permitirReal: boolean
  codigos?: string[]
}): Promise<ResultadoRegra[]> {
  const ctx: Contexto = { client: opcoes.client, tenantId: opcoes.tenantId }
  const regras = (await regrasDoTenant(ctx)).filter(
    (r) => regraTemExecutor(r.codigo) && (!opcoes.codigos || opcoes.codigos.includes(r.codigo))
  )
  const bloqueios = await carregarBloqueios(ctx)
  const resultados: ResultadoRegra[] = []
  for (const regra of regras) {
    const definicao = definicaoRegra(regra.codigo)
    if (!definicao) continue
    const modo: ModoRetencao = opcoes.permitirReal && regra.ativa ? "real" : "simulacao"
    resultados.push(
      await executarRegra(ctx, regra, definicao, modo, bloqueios, {
        origem: opcoes.origem,
        usuarioId: opcoes.usuarioId ?? null,
      })
    )
  }
  return resultados
}
