import "server-only"

import { cpfConfiavel } from "@/lib/cpf"
import { esquemaAusente, texto } from "@/lib/db/comum"
import { invalidarCacheCadastrosPendentes } from "@/lib/db/filiacao-cadastros-pendentes"
import { ehArquivo, urlDocumentoDoVinculo } from "@/lib/db/filiacao-documentos"
import { normalizarMatricula } from "@/lib/db/filiacao-matricula"
import { lerLotes, nomesDeEmpresas } from "@/lib/db/fontes"
import { COLUNAS_ESCOLHA, montarEnvio, type Decisao, type FichaMesclagem } from "@/lib/mesclagem-cadastros"
import { createAdminClient } from "@/lib/supabase/admin"
import { tenantAtual } from "@/lib/tenant"
import { semAcento } from "@/lib/texto"

/**
 * Possíveis duplicidades de cadastro e a mesclagem — ver
 * supabase/filiacao-duplicidades.sql e filiacao-identidade.ts.
 *
 * Três formas de achar a mesma pessoa em mais de um cadastro:
 *  - CPF válido repetido (a mais forte);
 *  - matrícula sindical repetida (a numeração é da entidade: repetida é erro,
 *    seja a mesma pessoa, seja outra);
 *  - mesmo nome sem CPF válido que os diferencie — mais forte quando a data de
 *    nascimento também bate.
 *
 * CPF impossível ("0", máscara vazia) NÃO forma grupo: é lixo de digitação, não
 * a mesma pessoa. Esses cadastros são limpos pelo scripts/limpar-identidade-filiados.mjs.
 */

export type TipoDuplicidade = "cpf" | "matricula" | "nome"

export const ROTULO_DUPLICIDADE: Record<TipoDuplicidade, string> = {
  cpf: "Mesmo CPF",
  matricula: "Mesma matrícula sindical",
  nome: "Mesmo nome",
}

export type CadastroDuplicado = {
  id: string
  nome: string | null
  cpf: string | null
  matricula: string | null
  nascimento: string | null
  condicao: string | null
  criadoEm: string | null
  vinculos: number
}

export type GrupoDuplicidade = {
  tipo: TipoDuplicidade
  chave: string
  /** Só em "nome": todos com a mesma data de nascimento? */
  mesmoNascimento: boolean
  /** Nomes diferentes no grupo: provável CPF ou matrícula trocados, não duplicata. */
  pessoasDiferentes: boolean
  cadastros: CadastroDuplicado[]
}

export type Duplicidades = {
  disponivel: boolean
  grupos: GrupoDuplicidade[]
  totais: Record<TipoDuplicidade, number>
  geradoEm: string
}

const VALIDADE_CACHE_MS = 10 * 60 * 1000
let cache: { dados: Duplicidades; expira: number; emp: string } | null = null

export function invalidarCacheDuplicidades() {
  cache = null
}

const nomeNormalizado = (v: string | null) => semAcento(v ?? "").replace(/\s+/g, " ")

type Linha = {
  id: string
  nome_completo: string | null
  cpf: string | null
  matricula_sindical: string | null
  nascimento_data: string | null
  filiacao_condicao: string | null
  created_at: string | null
}

export async function listarDuplicidades(): Promise<Duplicidades> {
  const emp = await tenantAtual()
  if (cache && cache.emp === emp && cache.expira > Date.now()) return cache.dados

  const admin = await createAdminClient()
  const [cadastros, vinculos, ignoradas] = await Promise.all([
    lerLotes<Linha>((de, ate) =>
      admin
        .from("filiacoes")
        .select("id, nome_completo, cpf, matricula_sindical, nascimento_data, filiacao_condicao, created_at")
        .eq("emp_proprietaria_id", emp)
        .not("filiacao_excluida", "is", true)
        .order("id", { ascending: true })
        .range(de, ate)
    ),
    lerLotes<{ filiado_id: string }>((de, ate) =>
      admin
        .from("filiacao_vinculos")
        .select("filiado_id")
        .eq("emp_proprietaria_id", emp)
        .not("filiado_id", "is", null)
        .order("id", { ascending: true })
        .range(de, ate)
    ),
    admin.from("filiacao_duplicidades_ignoradas").select("tipo, chave, cadastros").eq("emp_proprietaria_id", emp),
  ])
  const disponivel = !(ignoradas.error && esquemaAusente(ignoradas.error))

  const vinculosDe = new Map<string, number>()
  for (const v of vinculos) vinculosDe.set(v.filiado_id, (vinculosDe.get(v.filiado_id) ?? 0) + 1)
  const paraCadastro = (l: Linha): CadastroDuplicado => ({
    id: l.id,
    nome: l.nome_completo,
    cpf: l.cpf,
    matricula: l.matricula_sindical,
    nascimento: l.nascimento_data,
    condicao: l.filiacao_condicao,
    criadoEm: l.created_at,
    vinculos: vinculosDe.get(l.id) ?? 0,
  })

  const ignorado = (tipo: string, chave: string, ids: string[]) =>
    (ignoradas.data ?? []).some(
      (i) =>
        i.tipo === tipo &&
        i.chave === chave &&
        // Um cadastro novo entrando no grupo faz ele voltar à lista.
        ids.every((id) => ((i.cadastros as string[]) ?? []).includes(id))
    )

  const agrupar = (chave: (l: Linha) => string | null) => {
    const m = new Map<string, Linha[]>()
    for (const l of cadastros) {
      const k = chave(l)
      if (k) m.set(k, [...(m.get(k) ?? []), l])
    }
    return [...m.entries()].filter(([, lista]) => lista.length > 1)
  }

  const grupos: GrupoDuplicidade[] = []
  const conjuntosVistos = new Set<string>()
  const registrar = (tipo: TipoDuplicidade, chave: string, lista: Linha[], mesmoNascimento = false) => {
    const ids = lista.map((l) => l.id).sort()
    const conjunto = ids.join(",")
    // O mesmo conjunto achado por CPF e por matrícula aparece uma vez só.
    if (conjuntosVistos.has(conjunto) || ignorado(tipo, chave, ids)) return
    conjuntosVistos.add(conjunto)
    grupos.push({
      tipo,
      chave,
      mesmoNascimento,
      pessoasDiferentes: new Set(lista.map((l) => nomeNormalizado(l.nome_completo))).size > 1,
      cadastros: lista
        .map(paraCadastro)
        .sort((a, b) => (a.criadoEm ?? "").localeCompare(b.criadoEm ?? "")),
    })
  }

  for (const [cpf, lista] of agrupar((l) => cpfConfiavel(l.cpf))) registrar("cpf", cpf, lista)
  for (const [mat, lista] of agrupar((l) => normalizarMatricula(l.matricula_sindical))) {
    registrar("matricula", mat, lista)
  }
  for (const [nome, lista] of agrupar((l) => nomeNormalizado(l.nome_completo) || null)) {
    const cpfs = new Set(lista.map((l) => cpfConfiavel(l.cpf)).filter(Boolean))
    if (cpfs.size > 1) continue // homônimos com CPFs válidos diferentes
    const nascimentos = new Set(lista.map((l) => l.nascimento_data).filter(Boolean))
    registrar("nome", nome, lista, nascimentos.size === 1 && lista.every((l) => l.nascimento_data))
  }

  // Ordem de trabalho: mais de um ativo primeiro, depois evidência mais forte.
  const ativos = (g: GrupoDuplicidade) => g.cadastros.filter((c) => c.condicao === "Ativo").length
  const forca = (g: GrupoDuplicidade) => (g.tipo === "cpf" ? 3 : g.tipo === "matricula" ? 2 : g.mesmoNascimento ? 1 : 0)
  grupos.sort((a, b) => ativos(b) - ativos(a) || forca(b) - forca(a))

  const totais: Record<TipoDuplicidade, number> = { cpf: 0, matricula: 0, nome: 0 }
  for (const g of grupos) totais[g.tipo]++

  const dados: Duplicidades = { disponivel, grupos, totais, geradoEm: new Date().toISOString() }
  cache = { dados, expira: Date.now() + VALIDADE_CACHE_MS, emp }
  return dados
}

// ── Mesclagem ───────────────────────────────────────────────────────────────

const textoOuNulo = (v: unknown): string | null => (v === null || v === undefined || v === "" ? null : String(v))

/**
 * Os cadastros escolhidos, INTEIROS, cada um só com o que é dele (o perfil junta
 * tudo o que tem o mesmo CPF; aqui é justamente o que não se quer). A tela mostra
 * lado a lado, e a gravação recalcula daqui o que vai para o banco: o navegador
 * só manda a decisão, nunca os valores.
 */
export async function fichasParaMesclar(ids: string[], comLinks = true): Promise<FichaMesclagem[]> {
  const unicos = [...new Set(ids)].slice(0, 10)
  if (unicos.length < 2) return []
  const admin = await createAdminClient()
  const emp = await tenantAtual()
  const { data } = await admin
    .from("filiacoes")
    .select("*")
    .eq("emp_proprietaria_id", emp)
    .in("id", unicos)
    .not("filiacao_excluida", "is", true)
  const linhas = ((data ?? []) as Record<string, unknown>[]).sort(
    (a, b) => unicos.indexOf(String(a.id)) - unicos.indexOf(String(b.id))
  )
  const achados = linhas.map((l) => String(l.id))
  if (achados.length < 2) return []

  const [emails, telefones, enderecos, emergencia, contas, vinculos, contribuicoes] = await Promise.all([
    admin.from("emails").select("filiado_id, email, tipo_email").eq("emp_proprietaria_id", emp).in("filiado_id", achados),
    admin.from("telefones").select("filiado_id, numero, tipo, whatsapp").eq("emp_proprietaria_id", emp).in("filiado_id", achados),
    admin
      .from("enderecos")
      .select("id, filiado_id, cep, logradouro, numero, complemento, bairro, cidade, estado")
      .eq("emp_proprietaria_id", emp)
      .in("filiado_id", achados),
    admin
      .from("filiacao_contatos_emergencia")
      .select("id, filiado_id, nome, telefone, vinculo")
      .eq("emp_proprietaria_id", emp)
      .in("filiado_id", achados),
    admin
      .from("dados_bancarios")
      .select("id, filiado_id, banco, agencia, conta, pix, favorecido, favorito, created_at")
      .in("filiado_id", achados)
      .order("created_at", { ascending: true }),
    admin
      .from("filiacao_vinculos")
      .select(
        "id, filiado_id, fonte_pagadora_id, matricula, cargo, lotacao, data_entrada_admissao, data_saida_demissao, data_filiacao, filiacao_data_adesao, data_desfiliacao, filiacao_data_saida, ficha_filiacao, carta_desfiliacao, fonte_pg_cargo, fonte_pg_admissao"
      )
      .eq("emp_proprietaria_id", emp)
      .in("filiado_id", achados)
      .order("data_filiacao", { ascending: true }),
    lerLotes<{ filiado_id: string; valor: number | null }>((de, ate) =>
      admin
        .from("filiacao_recebe")
        .select("filiado_id, valor")
        .eq("emp_proprietaria_id", emp)
        .in("filiado_id", achados)
        .order("id", { ascending: true })
        .range(de, ate)
    ),
  ])
  if (vinculos.error) throw new Error(`Falha ao carregar os vínculos: ${vinculos.error.message}`)

  const fontes = await nomesDeEmpresas([
    ...new Set((vinculos.data ?? []).map((v) => v.fonte_pagadora_id).filter((v): v is string => Boolean(v))),
  ])
  const contar = async (tabela: string, coluna: string, id: string) => {
    const { count } = await admin.from(tabela).select("id", { count: "exact", head: true }).eq(coluna, id)
    return count ?? 0
  }
  const documento = async (v: unknown) => {
    const caminho = typeof v === "string" ? v : null
    if (!ehArquivo(caminho)) return null
    return comLinks ? urlDocumentoDoVinculo(caminho) : caminho
  }

  return Promise.all(
    linhas.map(async (l): Promise<FichaMesclagem> => {
      const id = String(l.id)
      const [prontuario, reembolsos, eventos] = await Promise.all([
        contar("filiacao_prontuario", "filiacao_id", id),
        contar("filiacao_reembolsos", "filiado_id", id),
        contar("eventos_inscricoes", "filiacao_id", id),
      ])
      const valores: Record<string, string | null> = {}
      for (const coluna of COLUNAS_ESCOLHA) valores[coluna] = textoOuNulo(l[coluna])
      const recebidos = contribuicoes.filter((c) => c.filiado_id === id)
      return {
        id,
        valores,
        whatsapp1: l.telefone_1_whatsapp === true,
        whatsapp2: l.telefone_2_whatsapp === true,
        criadoEm: textoOuNulo(l.created_at),
        atualizadoEm: textoOuNulo(l.updated_at),
        optoutEm: textoOuNulo(l.comunicados_optout_em),
        emails: (emails.data ?? [])
          .filter((e) => e.filiado_id === id && e.email)
          .map((e) => ({ email: String(e.email), tipo: texto(e.tipo_email) })),
        telefones: (telefones.data ?? [])
          .filter((t) => t.filiado_id === id && t.numero)
          .map((t) => ({ numero: String(t.numero), whatsapp: t.whatsapp === true, tipo: texto(t.tipo) })),
        enderecos: (enderecos.data ?? [])
          .filter((e) => e.filiado_id === id)
          .map((e) => ({
            id: String(e.id),
            cep: texto(e.cep),
            logradouro: texto(e.logradouro),
            numero: texto(e.numero),
            complemento: texto(e.complemento),
            bairro: texto(e.bairro),
            cidade: texto(e.cidade),
            estado: texto(e.estado),
          })),
        emergencia: (emergencia.data ?? [])
          .filter((c) => c.filiado_id === id)
          .map((c) => ({ id: String(c.id), nome: texto(c.nome) ?? "", telefone: texto(c.telefone) ?? "", vinculo: texto(c.vinculo) })),
        contas: (contas.data ?? [])
          .filter((c) => c.filiado_id === id)
          .map((c) => ({
            id: String(c.id),
            banco: texto(c.banco),
            agencia: texto(c.agencia),
            conta: texto(c.conta),
            pix: texto(c.pix),
            favorecido: texto(c.favorecido),
            favorito: c.favorito === true,
          })),
        vinculos: await Promise.all(
          (vinculos.data ?? [])
            .filter((v) => v.filiado_id === id)
            .map(async (v) => ({
              id: String(v.id),
              fonteId: texto(v.fonte_pagadora_id),
              fonte: v.fonte_pagadora_id ? (fontes.get(v.fonte_pagadora_id) ?? null) : null,
              matricula: texto(v.matricula),
              cargo: texto(v.cargo) ?? texto(v.fonte_pg_cargo),
              lotacao: texto(v.lotacao),
              admissao: texto(v.data_entrada_admissao) ?? texto(v.fonte_pg_admissao),
              demissao: texto(v.data_saida_demissao),
              filiacao: texto(v.data_filiacao) ?? texto(v.filiacao_data_adesao),
              desfiliacao: texto(v.data_desfiliacao) ?? texto(v.filiacao_data_saida),
              fichaUrl: await documento(v.ficha_filiacao),
              cartaUrl: await documento(v.carta_desfiliacao),
            }))
        ),
        contagens: {
          contribuicoes: recebidos.length,
          valorContribuicoes: recebidos.reduce((s, c) => s + (Number(c.valor) || 0), 0),
          prontuario,
          reembolsos,
          eventos,
        },
      }
    })
  )
}

export type ResultadoMesclagem = {
  erro?: string
  movidos?: Record<string, number>
  pendentes?: string[]
  /** Vínculos que viraram um só. */
  vinculosUnificados?: number
  /** Pares que a pessoa pediu para unir e o banco não deixou. */
  vinculosNaoUnificados?: number
}

/**
 * Grava a mesclagem. Lê os cadastros de novo e calcula o envio a partir da
 * decisão: o que entra no banco é sempre o que está nos cadastros.
 */
export async function mesclarCadastros(dados: {
  decisao: Decisao
  ids: string[]
  usuarioId: string | null
}): Promise<ResultadoMesclagem> {
  const fichas = await fichasParaMesclar(dados.ids, false)
  if (fichas.length !== dados.ids.length || !fichas.some((f) => f.id === dados.decisao.principal)) {
    return { erro: "Algum destes cadastros já foi excluído ou mesclado. Volte à lista e abra de novo." }
  }
  const envio = montarEnvio(fichas, dados.decisao)
  const campos = envio.campos

  // CPF e matrícula escolhidos precisam ser válidos — a mesclagem não pode
  // perpetuar o "0" nem uma matrícula que é CPF.
  if (typeof campos.cpf === "string") {
    const cpf = cpfConfiavel(campos.cpf)
    if (!cpf) return { erro: "O CPF escolhido não é válido. Escolha outro ou deixe em branco." }
    campos.cpf = cpf
  }
  if (typeof campos.matricula_sindical === "string") {
    const m = normalizarMatricula(campos.matricula_sindical)
    if (!m || m.length > 7) return { erro: "A matrícula sindical escolhida não é válida." }
    campos.matricula_sindical = m
  }

  // Chamada com service role: a função é revogada para `authenticated` e
  // valida sozinha que principal e incorporados são do tenant passado.
  const service = await createAdminClient()
  const { data, error } = await service.rpc("mesclar_filiacoes", {
    p_emp: await tenantAtual(),
    p_principal: dados.decisao.principal,
    p_secundarios: fichas.map((f) => f.id).filter((id) => id !== dados.decisao.principal),
    p_campos: campos,
    p_usuario: dados.usuarioId,
    p_vinculos: envio.vinculos,
    p_contatos: envio.contatos,
  })
  if (error) {
    if (/could not find the function/i.test(error.message)) {
      return { erro: "Mesclagem ainda não configurada — falta aplicar a migração." }
    }
    return { erro: error.message }
  }
  invalidarCacheDuplicidades()
  invalidarCacheCadastrosPendentes()
  const resultado = (data ?? {}) as {
    movidos?: Record<string, number>
    pendentes?: string[]
    vinculos_unificados?: number
    vinculos_nao_unificados?: number
  }
  return {
    movidos: resultado.movidos ?? {},
    pendentes: resultado.pendentes ?? [],
    vinculosUnificados: resultado.vinculos_unificados ?? 0,
    vinculosNaoUnificados: resultado.vinculos_nao_unificados ?? 0,
  }
}

/** "Não é duplicidade": o grupo some da lista até entrar outro cadastro nele. */
export async function ignorarDuplicidade(dados: {
  tipo: TipoDuplicidade
  chave: string
  cadastros: string[]
  motivo: string | null
  usuarioId: string | null
}): Promise<{ erro?: string }> {
  const admin = await createAdminClient()
  const { error } = await admin.from("filiacao_duplicidades_ignoradas").upsert(
    {
      emp_proprietaria_id: await tenantAtual(),
      tipo: dados.tipo,
      chave: dados.chave,
      cadastros: dados.cadastros,
      motivo: dados.motivo,
      criado_por: dados.usuarioId,
    },
    { onConflict: "emp_proprietaria_id,tipo,chave" }
  )
  if (error) {
    return {
      erro: esquemaAusente(error)
        ? "Rode supabase/filiacao-duplicidades.sql antes de marcar grupos."
        : error.message,
    }
  }
  invalidarCacheDuplicidades()
  return {}
}
