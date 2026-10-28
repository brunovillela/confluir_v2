import "server-only"

import { cpfConfiavel } from "@/lib/cpf"
import { hojeSP, lerEmLotes, texto } from "@/lib/db/comum"
import {
  aplicarFiltrosOpositores,
  diaSP,
  problemaDaAssinatura,
  type FiltrosOpositores,
} from "@/lib/db/oposicao"
import type { ValidacaoAssinatura } from "@/lib/assinatura-pdf"
import { formatarData } from "@/lib/formato"
import {
  exigeDocumento,
  MEIOS_ENVIO,
  type MeioEnvio,
  type ModoFormalizacao,
  type SituacaoOpositor,
} from "@/lib/oposicao-constantes"
import { createAdminClient } from "@/lib/supabase/admin"
import { tenantAtual } from "@/lib/tenant"

/**
 * OPOSIÇÃO — TRABALHO DA ENTIDADE EM ESCALA (onda 2 da avaliação de
 * 27/10/2026, docs/avaliacao-oposicao-2026-10.md).
 *
 *  - Avaliação em lote (C6): as selecionadas ou todas as filtradas. Só as
 *    "não avaliadas" — re-decisão é uma a uma. Para APROVAR, cada oposição
 *    passa pela mesma conferência do checklist da página; a que tem
 *    pendência fica de fora e volta na lista, com o motivo. A decisão é
 *    gravada na hora (com a guarda da situação) e o aviso ao trabalhador vai
 *    para a fila (`aviso_avaliacao_pendente_em`), que a rota
 *    /api/oposicao/tick esvazia aos poucos.
 *  - Encerrar quem não mandou a carta (A12): depois do prazo, as "aguardando
 *    documento" viram "reprovada" com o motivo, também com aviso na fila.
 *  - Exportação, relação por empregador com registro de envio e dossiê (C7).
 */

/** Teto de oposições por pedido de lote (o resto fica para o próximo clique). */
export const MAX_LOTE = 3000
const PEDACO = 200

export type AlvoLote = { ids: string[] } | { filtros: Omit<FiltrosOpositores, "pagina" | "campanhaId"> }

export type PuladaLote = { id: string; nome: string | null; motivo: string }

export type ResultadoLote = {
  avaliadas: number
  /** Não estavam "não avaliadas" quando o lote rodou (já decididas, desistentes…). */
  foraDaSituacao: number
  /** Com pendência no checklist — avaliar uma a uma. */
  puladas: PuladaLote[]
  /** Alvo maior que o teto: estas ficaram para o próximo lote. */
  restantes: number
  erro?: string
}

type LinhaLote = {
  id: string
  nome_completo: string | null
  cpf: string | null
  cpf_digitos: string | null
  situacao: string | null
  empregador_id: string | null
  filiacao_id: string | null
  confirmado_em: string | null
  prazo_fim_ato: string | null
  documento_enviado_em: string | null
  documento_assinado_url: string | null
  /** Carta do legado do Bubble (URL da CDN dele). */
  carta: string | null
  assinatura_validacao: unknown
  modo_formalizacao_ato: string | null
}

const COLUNAS_LOTE =
  "id, nome_completo, cpf, cpf_digitos, situacao, empregador_id, filiacao_id, confirmado_em, prazo_fim_ato, documento_enviado_em, documento_assinado_url, carta, assinatura_validacao, modo_formalizacao_ato"

type ContextoCampanha = {
  prazoFim: string | null
  modo: ModoFormalizacao
  fontes: Set<string>
  /** Quantas oposições cada CPF (dígitos) tem na campanha. */
  porCpf: Map<string, number>
}

async function contextoDaCampanha(campanhaId: string): Promise<ContextoCampanha | null> {
  const admin = await createAdminClient()
  const emp = await tenantAtual()
  const [{ data: c }, { data: fontes }, cpfs] = await Promise.all([
    admin
      .from("oposicao_campanha")
      .select("prazo_fim, modo_formalizacao")
      .eq("id", campanhaId)
      .eq("emp_proprietaria_id", emp)
      .maybeSingle(),
    admin.from("oposicao_campanha_fontes").select("empresa_id").eq("campanha_id", campanhaId).eq("emp_proprietaria_id", emp),
    lerEmLotes<{ cpf_digitos: string | null }>((de, ate) =>
      admin
        .from("oposicao_opositor")
        .select("cpf_digitos")
        .eq("emp_proprietaria_id", emp)
        .eq("campanha_id", campanhaId)
        .order("id")
        .range(de, ate)
    ),
  ])
  if (!c) return null
  const porCpf = new Map<string, number>()
  for (const r of cpfs) {
    const d = texto(r.cpf_digitos)
    if (d) porCpf.set(d, (porCpf.get(d) ?? 0) + 1)
  }
  return {
    prazoFim: texto(c.prazo_fim)?.slice(0, 10) ?? null,
    modo: (texto(c.modo_formalizacao) ?? "tela") as ModoFormalizacao,
    fontes: new Set((fontes ?? []).map((f) => String(f.empresa_id))),
    porCpf,
  }
}

/**
 * As pendências que impedem aprovar sem olhar (o mesmo checklist da página
 * da oposição). Vazio = pode aprovar em lote.
 */
export function pendenciasParaAprovar(o: LinhaLote, ctx: ContextoCampanha): string[] {
  const p: string[] = []
  const prazo = texto(o.prazo_fim_ato)?.slice(0, 10) ?? ctx.prazoFim
  const dia = diaSP(texto(o.confirmado_em))
  if (!dia) p.push("sem a data de registro")
  else if (prazo && dia > prazo) p.push(`registrada fora do prazo (${formatarData(dia)})`)
  const diaCarta = diaSP(texto(o.documento_enviado_em))
  if (diaCarta && prazo && diaCarta > prazo) p.push(`carta enviada depois do prazo (${formatarData(diaCarta)})`)
  const d = texto(o.cpf_digitos)
  if (!cpfConfiavel(texto(o.cpf)) || !texto(o.nome_completo)) p.push("CPF inválido ou nome em branco")
  else if (d && (ctx.porCpf.get(d) ?? 0) > 1) p.push("CPF com outra oposição na campanha")
  if (ctx.fontes.size > 0) {
    if (!o.empregador_id) p.push("sem fonte pagadora")
    else if (!ctx.fontes.has(String(o.empregador_id))) p.push("fonte fora da campanha")
  }
  const modo = (texto(o.modo_formalizacao_ato) ?? ctx.modo) as ModoFormalizacao
  const temCarta = Boolean(texto(o.documento_assinado_url) ?? texto(o.carta))
  if (!temCarta && exigeDocumento(modo, Boolean(o.filiacao_id))) p.push("sem a carta assinada")
  if (temCarta) {
    const problema = problemaDaAssinatura(o.assinatura_validacao as ValidacaoAssinatura | null)
    if (problema) p.push(problema.replace(/\.$/, "").toLowerCase())
  }
  return p
}

/** As linhas do alvo: os ids escolhidos ou tudo o que o filtro da tela mostra. */
async function linhasDoAlvo(campanhaId: string, alvo: AlvoLote): Promise<LinhaLote[]> {
  const admin = await createAdminClient()
  const emp = await tenantAtual()
  if ("ids" in alvo) {
    const ids = [...new Set(alvo.ids)].slice(0, MAX_LOTE + 1)
    const linhas: LinhaLote[] = []
    for (let i = 0; i < ids.length; i += PEDACO) {
      const { data, error } = await admin
        .from("oposicao_opositor")
        .select(COLUNAS_LOTE)
        .eq("emp_proprietaria_id", emp)
        .eq("campanha_id", campanhaId)
        .in("id", ids.slice(i, i + PEDACO))
      if (error) throw new Error(error.message)
      linhas.push(...((data ?? []) as LinhaLote[]))
    }
    return linhas
  }
  return lerEmLotes<LinhaLote>((de, ate) =>
    aplicarFiltrosOpositores(
      admin.from("oposicao_opositor").select(COLUNAS_LOTE).eq("emp_proprietaria_id", emp),
      { ...alvo.filtros, campanhaId }
    )
      .order("confirmado_em", { ascending: true, nullsFirst: false })
      .order("id")
      .range(de, ate)
  )
}

/** Grava a decisão em pedaços, só onde a situação ainda é a esperada, e a trilha de cada uma. */
async function gravarDecisoes(dados: {
  campanhaId: string
  ids: string[]
  situacaoEsperada: SituacaoOpositor
  aprovar: boolean
  motivo: string | null
  usuarioId: string
  detalheEvento: string
}): Promise<{ gravadas: number; erro?: string }> {
  const admin = await createAdminClient()
  const emp = await tenantAtual()
  const agora = new Date().toISOString()
  let gravadas = 0
  for (let i = 0; i < dados.ids.length; i += PEDACO) {
    const pedaco = dados.ids.slice(i, i + PEDACO)
    const { data, error } = await admin
      .from("oposicao_opositor")
      .update({
        situacao: dados.aprovar ? "aprovada" : "reprovada",
        avaliacao: dados.aprovar,
        avaliacao_data: hojeSP(),
        avaliacao_avaliador_id: dados.usuarioId,
        reprovacao_motivo: dados.aprovar ? null : dados.motivo,
        aviso_avaliacao_pendente_em: agora,
      })
      .eq("emp_proprietaria_id", emp)
      .eq("campanha_id", dados.campanhaId)
      .eq("situacao", dados.situacaoEsperada)
      .in("id", pedaco)
      .select("id")
    if (error) return { gravadas, erro: `Falha ao gravar: ${error.message}` }
    const feitos = (data ?? []).map((r) => String(r.id))
    gravadas += feitos.length
    if (feitos.length) {
      const { error: erroTrilha } = await admin.from("oposicao_eventos").insert(
        feitos.map((id) => ({
          opositor_id: id,
          campanha_id: dados.campanhaId,
          evento: dados.aprovar ? "aprovada" : "reprovada",
          detalhe: dados.detalheEvento,
          usuario_id: dados.usuarioId,
          emp_proprietaria_id: emp,
        }))
      )
      if (erroTrilha) console.error("[oposicao] trilha do lote não gravada:", erroTrilha.message)
    }
  }
  return { gravadas }
}

/**
 * Avaliação em lote. Aprovar: só as sem pendência no checklist (as outras
 * voltam em `puladas`). Reprovar: exige o motivo, o mesmo para todas.
 */
export async function avaliarEmLote(dados: {
  campanhaId: string
  alvo: AlvoLote
  aprovar: boolean
  motivo: string | null
  usuarioId: string
}): Promise<ResultadoLote> {
  const vazio: ResultadoLote = { avaliadas: 0, foraDaSituacao: 0, puladas: [], restantes: 0 }
  const motivo = dados.motivo?.trim() || null
  if (!dados.aprovar && !motivo) return { ...vazio, erro: "Informe o motivo da reprovação." }
  const ctx = await contextoDaCampanha(dados.campanhaId)
  if (!ctx) return { ...vazio, erro: "Campanha não encontrada." }
  let linhas: LinhaLote[]
  try {
    linhas = await linhasDoAlvo(dados.campanhaId, dados.alvo)
  } catch (e) {
    return { ...vazio, erro: `Falha ao ler as oposições: ${(e as Error).message}` }
  }
  const avaliaveis = linhas.filter((l) => l.situacao === "nao_avaliada")
  const foraDaSituacao = linhas.length - avaliaveis.length
  const lote = avaliaveis.slice(0, MAX_LOTE)
  const restantes = avaliaveis.length - lote.length

  const puladas: PuladaLote[] = []
  const ids: string[] = []
  for (const l of lote) {
    const pendencias = dados.aprovar ? pendenciasParaAprovar(l, ctx) : []
    if (pendencias.length) puladas.push({ id: l.id, nome: texto(l.nome_completo), motivo: pendencias.join("; ") })
    else ids.push(l.id)
  }
  const r = await gravarDecisoes({
    campanhaId: dados.campanhaId,
    ids,
    situacaoEsperada: "nao_avaliada",
    aprovar: dados.aprovar,
    motivo,
    usuarioId: dados.usuarioId,
    detalheEvento: ["em lote", motivo].filter(Boolean).join("; "),
  })
  return {
    avaliadas: r.gravadas,
    // Quem foi decidido por outra pessoa entre a leitura e a gravação.
    foraDaSituacao: foraDaSituacao + (ids.length - r.gravadas),
    puladas,
    restantes,
    erro: r.erro,
  }
}

export type PrevisaoEncerramento = { quantidade: number; prazoFim: string | null; prazoAberto: boolean }

/** Quantas "aguardando documento" já passaram do prazo (para o botão dizer o número). */
export async function previsaoEncerramentoSemCarta(campanhaId: string): Promise<PrevisaoEncerramento> {
  const ctx = await contextoDaCampanha(campanhaId)
  const linhas = await aguardandoForaDoPrazo(campanhaId, ctx)
  return {
    quantidade: linhas.length,
    prazoFim: ctx?.prazoFim ?? null,
    prazoAberto: Boolean(ctx?.prazoFim && hojeSP() <= ctx.prazoFim),
  }
}

async function aguardandoForaDoPrazo(campanhaId: string, ctx: ContextoCampanha | null): Promise<LinhaLote[]> {
  if (!ctx) return []
  const admin = await createAdminClient()
  const emp = await tenantAtual()
  const linhas = await lerEmLotes<LinhaLote>((de, ate) =>
    admin
      .from("oposicao_opositor")
      .select(COLUNAS_LOTE)
      .eq("emp_proprietaria_id", emp)
      .eq("campanha_id", campanhaId)
      .eq("situacao", "aguardando_documento")
      .order("id")
      .range(de, ate)
  )
  const hoje = hojeSP()
  // O prazo de cada uma é o do ato (onda 0); o da campanha, para o legado.
  return linhas.filter((l) => {
    const prazo = texto(l.prazo_fim_ato)?.slice(0, 10) ?? ctx.prazoFim
    return Boolean(prazo && hoje > prazo)
  })
}

/**
 * Encerra, depois do prazo, as oposições que nunca receberam a carta
 * assinada (A12): viram "reprovada" com o motivo, e o aviso vai para a fila.
 * Antes do fim do prazo de cada uma, nada muda.
 */
export async function encerrarSemCarta(dados: {
  campanhaId: string
  usuarioId: string
}): Promise<{ encerradas: number; erro?: string }> {
  const ctx = await contextoDaCampanha(dados.campanhaId)
  if (!ctx) return { encerradas: 0, erro: "Campanha não encontrada." }
  const linhas = await aguardandoForaDoPrazo(dados.campanhaId, ctx)
  if (linhas.length === 0) return { encerradas: 0 }
  // Um motivo por prazo (o do ato pode variar com prorrogação).
  const porPrazo = new Map<string, string[]>()
  for (const l of linhas) {
    const prazo = texto(l.prazo_fim_ato)?.slice(0, 10) ?? ctx.prazoFim ?? ""
    porPrazo.set(prazo, [...(porPrazo.get(prazo) ?? []), l.id])
  }
  let encerradas = 0
  for (const [prazo, ids] of porPrazo) {
    const motivo = `Carta assinada não enviada até o fim do prazo (${formatarData(prazo)}).`
    const r = await gravarDecisoes({
      campanhaId: dados.campanhaId,
      ids,
      situacaoEsperada: "aguardando_documento",
      aprovar: false,
      motivo,
      usuarioId: dados.usuarioId,
      detalheEvento: `encerrada sem a carta; ${motivo}`,
    })
    encerradas += r.gravadas
    if (r.erro) return { encerradas, erro: r.erro }
  }
  return { encerradas }
}

/**
 * A próxima "não avaliada" da campanha, pela ordem de chegada — para o
 * "Aprovar e ir para a próxima". Null = não há mais.
 */
export async function proximaParaAvaliar(campanhaId: string, excetoId: string): Promise<string | null> {
  const admin = await createAdminClient()
  const { data } = await admin
    .from("oposicao_opositor")
    .select("id")
    .eq("emp_proprietaria_id", await tenantAtual())
    .eq("campanha_id", campanhaId)
    .eq("situacao", "nao_avaliada")
    .neq("id", excetoId)
    .order("confirmado_em", { ascending: true, nullsFirst: false })
    .order("id")
    .limit(1)
    .maybeSingle()
  return data ? String(data.id) : null
}

// ── Exportação e relação por empregador (C7) ─────────────────────────────────

export type LinhaExportacao = {
  id: string
  protocolo: number | null
  nome: string | null
  cpf: string | null
  matricula: string | null
  email: string | null
  telefone: string | null
  lotacao: string | null
  empregadorId: string | null
  empregadorNome: string | null
  empregadorCnpj: string | null
  perfil: "Filiado" | "Não filiado"
  situacao: SituacaoOpositor
  confirmadoEm: string | null
  documentoEnviadoEm: string | null
  assinatura: string | null
  avaliacaoData: string | null
  avaliador: string | null
  motivo: string | null
  modoAto: string | null
  prazoFimAto: string | null
  ip: string | null
}

type Empresa = { nome: string | null; cnpj: string | null }

async function empresasPorId(ids: string[]): Promise<Map<string, Empresa>> {
  const admin = await createAdminClient()
  const mapa = new Map<string, Empresa>()
  for (let i = 0; i < ids.length; i += PEDACO) {
    const { data } = await admin
      .from("empresa")
      .select("id, nome_fantasia, nome_razao, cnpj_cpf")
      .in("id", ids.slice(i, i + PEDACO))
    for (const e of data ?? []) {
      mapa.set(String(e.id), { nome: texto(e.nome_fantasia) ?? texto(e.nome_razao), cnpj: texto(e.cnpj_cpf) })
    }
  }
  return mapa
}

const ROTULO_ASSINATURA: Record<string, string> = {
  valida: "Válida",
  ressalva: "Íntegra, com ressalva",
  invalida: "Inválida",
  sem_assinatura: "Sem assinatura digital",
  erro: "Não verificada (erro)",
}

/** Todas as oposições do filtro, com as colunas da planilha (sem teto de 1.000). */
export async function exportarOpositores(filtros: Omit<FiltrosOpositores, "pagina">): Promise<LinhaExportacao[]> {
  const admin = await createAdminClient()
  const emp = await tenantAtual()
  const linhas = await lerEmLotes<Record<string, unknown>>((de, ate) =>
    aplicarFiltrosOpositores(
      admin
        .from("oposicao_opositor")
        .select(
          "id, protocolo, nome_completo, cpf, matricula, email, telefone, lotacao, empregador_id, filiacao_id, situacao, confirmado_em, documento_enviado_em, assinatura_validacao, avaliacao_data, avaliacao_avaliador_id, reprovacao_motivo, modo_formalizacao_ato, prazo_fim_ato, ip"
        )
        .eq("emp_proprietaria_id", emp),
      filtros
    )
      .order("protocolo", { ascending: true, nullsFirst: false })
      .order("id")
      .range(de, ate)
  )
  const empresas = await empresasPorId([
    ...new Set(linhas.map((l) => texto(l.empregador_id)).filter((v): v is string => Boolean(v))),
  ])
  const avaliadorIds = [
    ...new Set(linhas.map((l) => texto(l.avaliacao_avaliador_id)).filter((v): v is string => Boolean(v))),
  ]
  const avaliadores = new Map<string, string>()
  for (let i = 0; i < avaliadorIds.length; i += PEDACO) {
    const { data } = await admin.from("usuarios").select("id, nome_completo, nome_guerra").in("id", avaliadorIds.slice(i, i + PEDACO))
    for (const u of data ?? []) avaliadores.set(String(u.id), texto(u.nome_completo) ?? texto(u.nome_guerra) ?? "—")
  }
  return linhas.map((l) => {
    const empId = texto(l.empregador_id)
    const v = l.assinatura_validacao as { situacao?: string; cpfConfere?: boolean | null } | null
    const assinatura = v?.situacao
      ? `${ROTULO_ASSINATURA[v.situacao] ?? v.situacao}${v.cpfConfere === false ? " · CPF não confere" : ""}`
      : null
    return {
      id: String(l.id),
      protocolo: l.protocolo == null ? null : Number(l.protocolo),
      nome: texto(l.nome_completo),
      cpf: texto(l.cpf),
      matricula: texto(l.matricula),
      email: texto(l.email),
      telefone: texto(l.telefone),
      lotacao: texto(l.lotacao),
      empregadorId: empId,
      empregadorNome: empId ? (empresas.get(empId)?.nome ?? null) : null,
      empregadorCnpj: empId ? (empresas.get(empId)?.cnpj ?? null) : null,
      perfil: l.filiacao_id ? "Filiado" : "Não filiado",
      situacao: (texto(l.situacao) ?? "nao_avaliada") as SituacaoOpositor,
      confirmadoEm: texto(l.confirmado_em),
      documentoEnviadoEm: texto(l.documento_enviado_em),
      assinatura,
      avaliacaoData: texto(l.avaliacao_data),
      avaliador: texto(l.avaliacao_avaliador_id) ? (avaliadores.get(String(l.avaliacao_avaliador_id)) ?? null) : null,
      motivo: texto(l.reprovacao_motivo),
      modoAto: texto(l.modo_formalizacao_ato),
      prazoFimAto: texto(l.prazo_fim_ato),
      ip: texto(l.ip),
    }
  })
}

export type EnvioEmpregador = {
  id: string
  enviadoEm: string
  usuarioNome: string | null
  meio: MeioEnvio
  referencia: string | null
  observacao: string | null
  quantidade: number
}

export type RelacaoEmpregador = {
  /** null = oposições aprovadas sem fonte informada. */
  empresaId: string | null
  nome: string
  cnpj: string | null
  aprovadas: number
  /** Aprovadas que ainda não constaram de nenhum envio registrado. */
  novas: number
  /** Constaram de um envio e depois deixaram de estar aprovadas (re-decisão). */
  saidas: number
  envios: EnvioEmpregador[]
}

/** As aprovadas da campanha agrupadas por fonte pagadora, com o histórico de envios. */
export async function relacaoPorEmpregador(campanhaId: string): Promise<RelacaoEmpregador[]> {
  const admin = await createAdminClient()
  const emp = await tenantAtual()
  const [aprovadas, enviosRes] = await Promise.all([
    lerEmLotes<{ id: string; empregador_id: string | null }>((de, ate) =>
      admin
        .from("oposicao_opositor")
        .select("id, empregador_id")
        .eq("emp_proprietaria_id", emp)
        .eq("campanha_id", campanhaId)
        .eq("situacao", "aprovada")
        .order("id")
        .range(de, ate)
    ),
    admin
      .from("oposicao_envios_empregador")
      .select("id, empresa_id, enviado_em, usuario_nome, meio, referencia, observacao, quantidade, opositor_ids")
      .eq("emp_proprietaria_id", emp)
      .eq("campanha_id", campanhaId)
      .order("enviado_em", { ascending: false }),
  ])
  const chave = (v: string | null) => v ?? "sem"
  const aprovadasPor = new Map<string, Set<string>>()
  for (const a of aprovadas) {
    const k = chave(texto(a.empregador_id))
    if (!aprovadasPor.has(k)) aprovadasPor.set(k, new Set())
    aprovadasPor.get(k)!.add(String(a.id))
  }
  const enviosPor = new Map<string, { envios: EnvioEmpregador[]; ids: Set<string> }>()
  for (const e of enviosRes.data ?? []) {
    const k = chave(texto(e.empresa_id))
    if (!enviosPor.has(k)) enviosPor.set(k, { envios: [], ids: new Set() })
    const g = enviosPor.get(k)!
    g.envios.push({
      id: String(e.id),
      enviadoEm: String(e.enviado_em),
      usuarioNome: texto(e.usuario_nome),
      meio: e.meio as MeioEnvio,
      referencia: texto(e.referencia),
      observacao: texto(e.observacao),
      quantidade: Number(e.quantidade ?? 0),
    })
    for (const id of (e.opositor_ids as string[] | null) ?? []) g.ids.add(String(id))
  }
  const chaves = [...new Set([...aprovadasPor.keys(), ...enviosPor.keys()])]
  const empresas = await empresasPorId(chaves.filter((k) => k !== "sem"))
  return chaves
    .map((k) => {
      const atuais = aprovadasPor.get(k) ?? new Set<string>()
      const enviados = enviosPor.get(k)?.ids ?? new Set<string>()
      return {
        empresaId: k === "sem" ? null : k,
        nome: k === "sem" ? "Sem fonte informada" : (empresas.get(k)?.nome ?? "(empresa sem nome)"),
        cnpj: k === "sem" ? null : (empresas.get(k)?.cnpj ?? null),
        aprovadas: atuais.size,
        novas: [...atuais].filter((id) => !enviados.has(id)).length,
        saidas: [...enviados].filter((id) => !atuais.has(id)).length,
        envios: enviosPor.get(k)?.envios ?? [],
      }
    })
    .sort((a, b) => (a.empresaId === null ? 1 : b.empresaId === null ? -1 : a.nome.localeCompare(b.nome, "pt-BR")))
}

/** As aprovadas de uma fonte (ou sem fonte), para a relação em PDF/planilha. */
export async function aprovadasDoEmpregador(campanhaId: string, empresaId: string | null): Promise<LinhaExportacao[]> {
  return exportarOpositores({ campanhaId, situacao: "aprovada", fonteId: empresaId ?? "sem" })
}

/**
 * Registra o envio da relação a um empregador: guarda QUAIS oposições
 * aprovadas constavam naquele momento (o servidor lê; o formulário não
 * escolhe). Não se altera nem se apaga depois (trigger no banco).
 */
export async function registrarEnvioEmpregador(dados: {
  campanhaId: string
  empresaId: string | null
  meio: MeioEnvio
  referencia: string | null
  observacao: string | null
  usuario: { id: string; nome: string | null }
}): Promise<{ erro?: string; quantidade?: number }> {
  if (!MEIOS_ENVIO.some((m) => m.chave === dados.meio)) return { erro: "Escolha o meio do envio." }
  const linhas = await aprovadasDoEmpregador(dados.campanhaId, dados.empresaId)
  if (linhas.length === 0) return { erro: "Não há oposição aprovada para esta fonte." }
  const admin = await createAdminClient()
  const { error } = await admin.from("oposicao_envios_empregador").insert({
    emp_proprietaria_id: await tenantAtual(),
    campanha_id: dados.campanhaId,
    empresa_id: dados.empresaId,
    meio: dados.meio,
    referencia: dados.referencia?.trim() || null,
    observacao: dados.observacao?.trim() || null,
    usuario_id: dados.usuario.id,
    usuario_nome: dados.usuario.nome,
    opositor_ids: linhas.map((l) => l.id),
    quantidade: linhas.length,
  })
  if (error) return { erro: `Falha ao registrar o envio: ${error.message}` }
  return { quantidade: linhas.length }
}
