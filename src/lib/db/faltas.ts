import "server-only"

import { esquemaAusente, hojeSP, lerEmLotes, nomesDosUsuarios, texto } from "@/lib/db/comum"
import { criarNotificacao } from "@/lib/db/notificacoes"
import {
  comprovacaoNoPedido,
  CONFIG_FALTAS_PADRAO,
  excedeLimite,
  podeCancelar,
  MESES,
  situacaoDaFalta,
  usoNaData,
  type ConfigFaltas,
  type SituacaoFalta,
  type UsoFaltas,
} from "@/lib/faltas-constantes"
import { formatarData } from "@/lib/formato"
import { createAdminClient } from "@/lib/supabase/admin"
import { tenantAtual } from "@/lib/tenant"

/**
 * Faltas justificadas — `pessoal_faltas_justificadas` (480 do Bubble) e
 * `pessoal_faltas_justificadas_periodo` (a vigência do ACT, uma por ano).
 * Regras puras em lib/faltas-constantes.ts; SQL em
 * supabase/faltas-justificadas.sql (entidade das migradas, recusa,
 * configuração dos limites e o vínculo com a ausência).
 *
 * Autorizada, a falta vira uma AUSÊNCIA do tipo "Falta justificada" (aparece
 * em "ausentes hoje" e na ficha); recusada ou excluída, a ausência sai.
 */

export const AVISO_SQL_FALTAS = "Rode supabase/faltas-justificadas.sql no Supabase para ativar as faltas justificadas."

// ── Configuração ─────────────────────────────────────────────────────────────

export async function lerConfigFaltas(): Promise<{ disponivel: boolean; config: ConfigFaltas }> {
  const admin = await createAdminClient()
  const { data, error } = await admin
    .from("pessoal_faltas_config")
    // "*": as colunas de comprovação (faltas-comprovacao.sql) podem faltar.
    .select("*")
    .eq("emp_proprietaria_id", await tenantAtual())
    .maybeSingle()
  if (error) return { disponivel: !esquemaAusente(error), config: CONFIG_FALTAS_PADRAO }
  if (!data) return { disponivel: true, config: CONFIG_FALTAS_PADRAO }
  const num = (v: unknown) => (v === null || v === undefined ? null : Number(v))
  const tipos = Array.isArray(data.tipos) ? (data.tipos as string[]).filter((t) => t.trim()) : []
  return {
    disponivel: true,
    config: {
      limiteAno: num(data.limite_ano),
      limiteMes: num(data.limite_mes),
      limiteSemana: num(data.limite_semana),
      tipos: tipos.length ? tipos : CONFIG_FALTAS_PADRAO.tipos,
      exigeComprovacao: data.exige_comprovacao === true,
      travaSemComprovacao: data.trava_sem_comprovacao === true,
    },
  }
}

export async function salvarConfigFaltas(
  config: ConfigFaltas,
  usuarioId: string
): Promise<{ erro?: string }> {
  const admin = await createAdminClient()
  const emp = await tenantAtual()
  const linha = {
    limite_ano: config.limiteAno,
    limite_mes: config.limiteMes,
    limite_semana: config.limiteSemana,
    tipos: config.tipos,
    exige_comprovacao: config.exigeComprovacao,
    trava_sem_comprovacao: config.travaSemComprovacao,
    updated_at: new Date().toISOString(),
    atualizado_por_id: usuarioId,
  }
  const { data: atual, error: erroLer } = await admin
    .from("pessoal_faltas_config")
    .select("id")
    .eq("emp_proprietaria_id", emp)
    .maybeSingle()
  if (erroLer) return { erro: esquemaAusente(erroLer) ? AVISO_SQL_FALTAS : erroLer.message }
  const { error } = atual
    ? await admin.from("pessoal_faltas_config").update(linha).eq("id", atual.id)
    : await admin.from("pessoal_faltas_config").insert({ ...linha, emp_proprietaria_id: emp })
  if (error) {
    return {
      erro: esquemaAusente(error)
        ? "Rode supabase/faltas-comprovacao.sql no Supabase para salvar as regras de comprovação."
        : `Não foi possível salvar a configuração: ${error.message}`,
    }
  }
  return {}
}

// ── Períodos ─────────────────────────────────────────────────────────────────

type Periodo = { id: string; inicio: string; termino: string; rotulo: string }

/**
 * Período (vigência do ACT) que contém a data. Sem nenhum cadastrado para
 * ela, cria o do ano civil — como o Bubble fazia, um período por ano.
 */
async function periodoDaData(dataISO: string): Promise<Periodo | { erro: string }> {
  const admin = await createAdminClient()
  const emp = await tenantAtual()
  const { data } = await admin
    .from("pessoal_faltas_justificadas_periodo")
    .select("id, inicio_vigencia, termino_vigencia, act_inicio_fim")
    .eq("emp_proprietaria_id", emp)
    .lte("inicio_vigencia", dataISO)
    .gte("termino_vigencia", dataISO)
    .order("inicio_vigencia", { ascending: false })
    .limit(1)
  const p = data?.[0]
  if (p) {
    return {
      id: String(p.id),
      inicio: String(p.inicio_vigencia).slice(0, 10),
      termino: String(p.termino_vigencia).slice(0, 10),
      rotulo: texto(p.act_inicio_fim) ?? String(p.inicio_vigencia).slice(0, 4),
    }
  }
  const ano = dataISO.slice(0, 4)
  const novo = { act_inicio_fim: ano, inicio_vigencia: `${ano}-01-01`, termino_vigencia: `${ano}-12-31`, finalizado: false }
  const { data: criado, error } = await admin
    .from("pessoal_faltas_justificadas_periodo")
    .insert({ ...novo, emp_proprietaria_id: emp })
    .select("id")
    .single()
  if (error || !criado) return { erro: `Não foi possível abrir o período de ${ano}: ${error?.message ?? "?"}` }
  return { id: String(criado.id), inicio: novo.inicio_vigencia, termino: novo.termino_vigencia, rotulo: ano }
}

/** Datas das faltas que CONTAM (não recusadas) do funcionário no período. */
async function datasQueContam(
  funcionarioId: string,
  periodo: { inicio: string; termino: string },
  excetoId?: string
): Promise<string[]> {
  const admin = await createAdminClient()
  const { data } = await admin
    .from("pessoal_faltas_justificadas")
    .select("id, data_falta, recusado")
    .eq("emp_proprietaria_id", await tenantAtual())
    .eq("funcionario_id", funcionarioId)
    .gte("data_falta", periodo.inicio)
    .lte("data_falta", periodo.termino)
  return (data ?? [])
    .filter((f) => f.recusado !== true && f.id !== excetoId && f.data_falta)
    .map((f) => String(f.data_falta).slice(0, 10))
}

// ── Leitura ──────────────────────────────────────────────────────────────────

export type FaltaJustificada = {
  id: string
  funcionarioId: string | null
  funcionarioNome: string | null
  data: string | null
  tipo: string | null
  observacao: string | null
  comprovacao: string | null
  situacao: SituacaoFalta
  motivoRecusa: string | null
  dataAutorizacao: string | null
  autorizadorNome: string | null
  periodo: string | null
  numero: number | null
  createdAt: string | null
  /** Veio do Bubble (não entra na trava de comprovação). */
  doSistemaAnterior: boolean
}

const SELECT_FALTA_BASE =
  "id, funcionario_id, data_falta, justificativa_tipo, comprovacao, autorizado, data_autorizacao, autorizador_id, periodo_id, falta_numero, created_at, bubble_id"
const SELECT_FALTA_NOVO = `${SELECT_FALTA_BASE}, recusado, motivo_recusa, observacao`

/** Lê com as colunas novas; sem o SQL, cai no select antigo. */
async function lerFaltas(filtro: {
  funcionarioId?: string
  ano?: string
}): Promise<{ disponivel: boolean; linhas: Record<string, unknown>[] }> {
  const admin = await createAdminClient()
  const emp = await tenantAtual()
  const consulta = (sel: string) => (de: number, ate: number) => {
    let q = admin.from("pessoal_faltas_justificadas").select(sel).eq("emp_proprietaria_id", emp)
    if (filtro.funcionarioId) q = q.eq("funcionario_id", filtro.funcionarioId)
    if (filtro.ano) q = q.gte("data_falta", `${filtro.ano}-01-01`).lte("data_falta", `${filtro.ano}-12-31`)
    return q.order("data_falta", { ascending: false, nullsFirst: false }).order("id").range(de, ate)
  }
  try {
    return { disponivel: true, linhas: await lerEmLotes(consulta(SELECT_FALTA_NOVO)) }
  } catch (e) {
    if (!esquemaAusente(e as { code?: string })) throw e
    return { disponivel: false, linhas: await lerEmLotes(consulta(SELECT_FALTA_BASE)) }
  }
}

async function montar(linhas: Record<string, unknown>[]): Promise<FaltaJustificada[]> {
  const admin = await createAdminClient()
  const [nomes, periodos] = await Promise.all([
    nomesDosUsuarios(
      linhas.flatMap((l) => [texto(l.funcionario_id), texto(l.autorizador_id)]).filter((v): v is string => !!v)
    ),
    admin
      .from("pessoal_faltas_justificadas_periodo")
      .select("id, act_inicio_fim, inicio_vigencia")
      .eq("emp_proprietaria_id", await tenantAtual()),
  ])
  const rotuloPeriodo = new Map(
    (periodos.data ?? []).map((p) => [String(p.id), texto(p.act_inicio_fim) ?? String(p.inicio_vigencia ?? "").slice(0, 4)])
  )
  return linhas.map((l) => {
    const funcionarioId = texto(l.funcionario_id)
    const autorizadorId = texto(l.autorizador_id)
    return {
      id: String(l.id),
      funcionarioId,
      funcionarioNome: funcionarioId ? (nomes.get(funcionarioId) ?? null) : null,
      data: texto(l.data_falta)?.slice(0, 10) ?? null,
      tipo: texto(l.justificativa_tipo),
      observacao: texto(l.observacao),
      comprovacao: texto(l.comprovacao),
      situacao: situacaoDaFalta({ autorizado: l.autorizado as boolean | null, recusado: l.recusado as boolean | null }),
      motivoRecusa: texto(l.motivo_recusa),
      dataAutorizacao: texto(l.data_autorizacao),
      autorizadorNome: autorizadorId ? (nomes.get(autorizadorId) ?? null) : null,
      periodo: l.periodo_id ? (rotuloPeriodo.get(String(l.periodo_id)) ?? null) : null,
      numero: l.falta_numero === null || l.falta_numero === undefined ? null : Number(l.falta_numero),
      createdAt: texto(l.created_at),
      doSistemaAnterior: Boolean(l.bubble_id),
    }
  })
}

export async function listarFaltas(filtro: { ano?: string; funcionarioId?: string } = {}): Promise<{
  disponivel: boolean
  faltas: FaltaJustificada[]
}> {
  const { disponivel, linhas } = await lerFaltas(filtro)
  return { disponivel, faltas: await montar(linhas) }
}

/** Faltas do próprio funcionário + o uso dos limites hoje. */
export async function minhasFaltas(usuarioId: string): Promise<{
  disponivel: boolean
  faltas: FaltaJustificada[]
  uso: UsoFaltas | null
  periodo: string | null
}> {
  const { disponivel, faltas } = await listarFaltas({ funcionarioId: usuarioId })
  const hoje = hojeSP()
  const admin = await createAdminClient()
  const { data } = await admin
    .from("pessoal_faltas_justificadas_periodo")
    .select("inicio_vigencia, termino_vigencia, act_inicio_fim")
    .eq("emp_proprietaria_id", await tenantAtual())
    .lte("inicio_vigencia", hoje)
    .gte("termino_vigencia", hoje)
    .limit(1)
  const p = data?.[0]
  const inicio = p ? String(p.inicio_vigencia).slice(0, 10) : `${hoje.slice(0, 4)}-01-01`
  const termino = p ? String(p.termino_vigencia).slice(0, 10) : `${hoje.slice(0, 4)}-12-31`
  const datas = faltas
    .filter((f) => f.situacao !== "recusada" && f.data && f.data >= inicio && f.data <= termino)
    .map((f) => f.data!)
  return {
    disponivel,
    faltas,
    uso: usoNaData(datas, hoje),
    periodo: p ? (texto(p.act_inicio_fim) ?? inicio.slice(0, 4)) : hoje.slice(0, 4),
  }
}

// ── Gravação ─────────────────────────────────────────────────────────────────

export type DadosFalta = {
  funcionarioId: string
  data: string
  tipo: string
  observacao: string | null
  /** Caminho no bucket 'pessoal' (já enviado) ou null. */
  comprovacao: string | null
}

/**
 * Registra uma falta. Pelo funcionário (autosserviço) nasce aguardando;
 * pela gestão pode já nascer autorizada e, com `ignorarLimite`, passar do
 * limite configurado (decisão registrada na observação).
 */
export async function registrarFalta(
  dados: DadosFalta,
  opcoes: { solicitanteId: string; autorizarJa?: boolean; ignorarLimite?: boolean }
): Promise<{ erro?: string; id?: string }> {
  const { disponivel, config } = await lerConfigFaltas()
  if (!disponivel) return { erro: AVISO_SQL_FALTAS }
  if (!config.tipos.includes(dados.tipo)) return { erro: "Escolha o tipo de justificativa." }

  // Regras de comprovação valem para o pedido do PRÓPRIO funcionário; o
  // departamento lança depois do fato e anexa quando tiver.
  if (opcoes.solicitanteId === dados.funcionarioId) {
    const hoje = hojeSP()
    if (comprovacaoNoPedido(config, dados.data, hoje) && !dados.comprovacao) {
      return { erro: "A comprovação é obrigatória: anexe o documento da falta (PDF ou foto)." }
    }
    if (config.travaSemComprovacao) {
      const pendente = await ultimaAutorizadaSemComprovacao(dados.funcionarioId, hoje)
      if (pendente) {
        return {
          erro: `Anexe a comprovação da falta de ${formatarData(pendente)} antes de pedir outra (Meu perfil → Faltas justificadas).`,
        }
      }
    }
  }

  const periodo = await periodoDaData(dados.data)
  if ("erro" in periodo) return periodo
  const datas = await datasQueContam(dados.funcionarioId, periodo)
  if (datas.includes(dados.data)) return { erro: `Já há falta justificada em ${formatarData(dados.data)}.` }
  const excesso = excedeLimite(usoNaData(datas, dados.data), config)
  if (excesso && !opcoes.ignorarLimite) return { erro: excesso }

  const admin = await createAdminClient()
  const emp = await tenantAtual()
  const autorizar = opcoes.autorizarJa === true
  const numero = datas.length + 1
  const { data: criada, error } = await admin
    .from("pessoal_faltas_justificadas")
    .insert({
      funcionario_id: dados.funcionarioId,
      data_falta: dados.data,
      justificativa_tipo: dados.tipo,
      observacao:
        excesso && opcoes.ignorarLimite
          ? [dados.observacao, `Registrada acima do limite pela gestão: ${excesso}`].filter(Boolean).join(" — ")
          : dados.observacao,
      comprovacao: dados.comprovacao,
      autorizado: autorizar,
      recusado: false,
      data_autorizacao: autorizar ? hojeSP() : null,
      autorizador_id: autorizar ? opcoes.solicitanteId : null,
      solicitado_por_id: opcoes.solicitanteId,
      falta_numero: numero,
      solicitacao_numero: numero,
      ano: dados.data.slice(0, 4),
      mes: MESES[Number(dados.data.slice(5, 7)) - 1],
      periodo_id: periodo.id,
      emp_proprietaria_id: emp,
    })
    .select("id")
    .single()
  if (error || !criada) {
    return { erro: esquemaAusente(error) ? AVISO_SQL_FALTAS : `Não foi possível registrar: ${error?.message ?? "?"}` }
  }
  const id = String(criada.id)
  if (autorizar) {
    await espelharAusencia(id, dados.funcionarioId, dados.data, dados.tipo)
  } else if (opcoes.solicitanteId === dados.funcionarioId) {
    const nomes = await nomesDosUsuarios([dados.funcionarioId])
    await notificarGestao(
      `${nomes.get(dados.funcionarioId) ?? "Um funcionário"} pediu falta justificada em ${formatarData(dados.data)} (${dados.tipo}).`
    )
  }
  return { id }
}

/** Autoriza ou recusa (com motivo) uma falta aguardando. */
export async function decidirFalta(
  id: string,
  autorizadorId: string,
  autorizar: boolean,
  motivo: string | null
): Promise<{ erro?: string }> {
  const admin = await createAdminClient()
  const { data: f } = await admin
    .from("pessoal_faltas_justificadas")
    .select("id, funcionario_id, data_falta, justificativa_tipo, autorizado, recusado")
    .eq("id", id)
    .eq("emp_proprietaria_id", await tenantAtual())
    .maybeSingle()
  if (!f) return { erro: "Falta não encontrada." }
  if (situacaoDaFalta(f) !== "aguardando") return { erro: "Esta falta já foi decidida." }
  if (!autorizar && (!motivo || motivo.trim().length < 5)) return { erro: "Diga o motivo da recusa." }

  const { error } = await admin
    .from("pessoal_faltas_justificadas")
    .update({
      autorizado: autorizar,
      recusado: !autorizar,
      motivo_recusa: autorizar ? null : motivo,
      data_autorizacao: hojeSP(),
      autorizador_id: autorizadorId,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id)
  if (error) return { erro: `Não foi possível salvar: ${error.message}` }

  const data = String(f.data_falta).slice(0, 10)
  if (autorizar) await espelharAusencia(id, String(f.funcionario_id), data, texto(f.justificativa_tipo))
  if (f.funcionario_id) {
    try {
      await criarNotificacao({
        usuarioId: String(f.funcionario_id),
        texto: autorizar
          ? `Sua falta justificada de ${formatarData(data)} foi autorizada.`
          : `Sua falta justificada de ${formatarData(data)} foi recusada: ${motivo}`,
        link: "/painel/perfil/faltas",
      })
    } catch (e) {
      console.error("Falha ao notificar a decisão da falta:", e)
    }
  }
  return {}
}

/** Funcionário cancela o PRÓPRIO pedido ainda aguardando. */
/**
 * A falta AUTORIZADA mais recente (já ocorrida) sem comprovação — a que trava
 * um novo pedido. Só as lançadas no Confluir: as do Bubble quase nunca têm
 * arquivo (41 de 480) e travariam todo mundo de saída.
 */
export async function ultimaAutorizadaSemComprovacao(
  funcionarioId: string,
  hojeISO: string
): Promise<string | null> {
  const admin = await createAdminClient()
  const { data } = await admin
    .from("pessoal_faltas_justificadas")
    .select("data_falta, comprovacao")
    .eq("emp_proprietaria_id", await tenantAtual())
    .eq("funcionario_id", funcionarioId)
    .eq("autorizado", true)
    .is("bubble_id", null)
    .lte("data_falta", hojeISO)
    .order("data_falta", { ascending: false })
    .limit(1)
  const ultima = data?.[0]
  return ultima && !texto(ultima.comprovacao) ? String(ultima.data_falta).slice(0, 10) : null
}

/**
 * Funcionário cancela a PRÓPRIA falta enquanto a data não chega — aguardando
 * ou já autorizada. Autorizada, a ausência sai e o departamento é avisado.
 */
export async function cancelarMinhaFalta(id: string, usuarioId: string): Promise<{ erro?: string }> {
  const admin = await createAdminClient()
  const { data: f } = await admin
    .from("pessoal_faltas_justificadas")
    .select("id, data_falta, autorizado, recusado, justificativa_tipo")
    .eq("id", id)
    .eq("funcionario_id", usuarioId)
    .eq("emp_proprietaria_id", await tenantAtual())
    .maybeSingle()
  if (!f) return { erro: "Pedido não encontrado." }
  const data = texto(f.data_falta)?.slice(0, 10) ?? null
  const situacao = situacaoDaFalta(f)
  if (!podeCancelar({ situacao, data }, hojeSP())) {
    return { erro: "Só dá para cancelar antes do dia da falta (e se não foi recusada)." }
  }
  await admin.from("pessoal_ausencias").delete().eq("falta_id", id)
  const { error, count } = await admin
    .from("pessoal_faltas_justificadas")
    .delete({ count: "exact" })
    .eq("id", id)
    .eq("funcionario_id", usuarioId)
  if (error) return { erro: `Não foi possível cancelar: ${error.message}` }
  if (count === 0) return { erro: "Pedido não encontrado." }
  if (situacao === "autorizada") {
    const nomes = await nomesDosUsuarios([usuarioId])
    await notificarGestao(
      `${nomes.get(usuarioId) ?? "Um funcionário"} cancelou a falta justificada já autorizada de ${formatarData(data)}.`
    )
  }
  return {}
}

/** Comprovação depois do pedido (falta futura, ou para destravar novos pedidos). */
export async function anexarComprovacaoMinhaFalta(
  id: string,
  usuarioId: string,
  caminho: string
): Promise<{ erro?: string }> {
  const admin = await createAdminClient()
  const { data, error } = await admin
    .from("pessoal_faltas_justificadas")
    .update({ comprovacao: caminho, updated_at: new Date().toISOString() })
    .eq("id", id)
    .eq("funcionario_id", usuarioId)
    .eq("emp_proprietaria_id", await tenantAtual())
    .neq("recusado", true)
    .is("comprovacao", null)
    .select("id")
  if (error) return { erro: `Não foi possível anexar: ${error.message}` }
  if (!(data ?? []).length) return { erro: "Esta falta já tem comprovação (ou foi recusada)." }
  return {}
}

/** Gestão exclui um registro (a ausência gerada sai junto). */
export async function excluirFalta(id: string): Promise<{ erro?: string }> {
  const admin = await createAdminClient()
  await admin.from("pessoal_ausencias").delete().eq("falta_id", id)
  const { error, count } = await admin
    .from("pessoal_faltas_justificadas")
    .delete({ count: "exact" })
    .eq("id", id)
    .eq("emp_proprietaria_id", await tenantAtual())
  if (error) return { erro: `Não foi possível excluir: ${error.message}` }
  if (count === 0) return { erro: "Falta não encontrada." }
  return {}
}

/** Falta autorizada aparece como ausência "Falta justificada" do dia. */
async function espelharAusencia(faltaId: string, funcionarioId: string, data: string, tipo: string | null) {
  const admin = await createAdminClient()
  const { data: existente } = await admin.from("pessoal_ausencias").select("id").eq("falta_id", faltaId).limit(1)
  if ((existente ?? []).length) return
  const { error } = await admin.from("pessoal_ausencias").insert({
    funcionario_id: funcionarioId,
    inicio: data,
    termino: data,
    motivo: "Falta justificada",
    observacao: tipo,
    falta_id: faltaId,
    emp_proprietaria_id: await tenantAtual(),
  })
  if (error) console.error("Falha ao espelhar a falta na ausência:", error.message)
}

/**
 * Avisa (sino) quem cuida das faltas no tenant. `permissoes` é deny-all para
 * o JWT do tenant: lê pelo service role e recorta pelos usuários do tenant.
 */
async function notificarGestao(textoAviso: string): Promise<void> {
  const service = await createAdminClient()
  const empId = await tenantAtual()
  const { data: perms } = await service
    .from("permissoes")
    .select("usuario_id, pessoal_gestao, pessoal_faltas_justificadas")
  const ids = [
    ...new Set(
      (perms ?? [])
        .filter((p) => p.pessoal_gestao === true || p.pessoal_faltas_justificadas === true)
        .map((p) => texto(p.usuario_id))
        .filter((v): v is string => !!v)
    ),
  ]
  if (!ids.length) return
  const { data: us } = await service.from("usuarios").select("id").in("id", ids).eq("emp_proprietaria_id", empId)
  for (const u of us ?? []) {
    try {
      await criarNotificacao({ usuarioId: String(u.id), texto: textoAviso, link: "/painel/pessoal/faltas" })
    } catch (e) {
      console.error("Falha ao notificar a gestão de faltas:", e)
    }
  }
}

const TIPOS_COMPROVACAO: Record<string, string> = {
  "application/pdf": "pdf",
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
}

/** Comprovação opcional (PDF ou foto, até 5 MB) no bucket privado 'pessoal'. */
export async function subirComprovacaoFalta(
  arquivo: FormDataEntryValue | null,
  funcionarioId: string
): Promise<{ caminho: string | null } | { erro: string }> {
  if (!(arquivo instanceof File) || arquivo.size === 0) return { caminho: null }
  const ext = TIPOS_COMPROVACAO[arquivo.type]
  if (!ext) return { erro: "A comprovação deve ser PDF ou imagem (JPG, PNG ou WebP)." }
  if (arquivo.size > 5 * 1024 * 1024) return { erro: "A comprovação deve ter no máximo 5 MB." }
  const caminho = `faltas/${funcionarioId}-${Date.now()}.${ext}`
  const admin = await createAdminClient()
  const { error } = await admin.storage.from("pessoal").upload(caminho, arquivo, { contentType: arquivo.type })
  if (error) return { erro: `Falha ao subir a comprovação: ${error.message}` }
  return { caminho }
}
