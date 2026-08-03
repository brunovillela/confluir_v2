import "server-only"
import { tenantAtual } from "@/lib/tenant"

import { criarNotificacao } from "@/lib/db/notificacoes"
import { enviarPushTelegram } from "@/lib/db/telegram"
import { enviarEmail } from "@/lib/email"
import { SITE_URL } from "@/lib/env"
import { formatarMoeda } from "@/lib/formato"
import { createAdminClient } from "@/lib/supabase/admin"

/**
 * Reembolsos do ACT — benefícios aprovados em acordo coletivo (ex.: auxílio
 * creche, ótica, educação) que o funcionário SOLICITA com comprovante e são
 * PAGOS NO CONTRACHEQUE (não geram ordem de pagamento, diferente das
 * diárias). Fluxo: solicitação → avaliação (aprova com valor + referência do
 * contracheque, ou reprova) → marcado como pago quando entra na folha.
 *
 * Tabelas NOVAS em supabase/reembolsos-act.sql (não existiam no Bubble
 * migrado) — as leituras degradam com `disponivel: false` até o SQL rodar.
 */

/** PGRST205/42P01 = tabela ausente; PGRST204/42703 = coluna ausente. */
function esquemaAusente(erro: { code?: string } | null): boolean {
  return ["PGRST205", "42P01", "PGRST204", "42703"].includes(erro?.code ?? "")
}

export const SITUACOES_REEMBOLSO = [
  "aguardando",
  "aprovado",
  "reprovado",
  "cancelado",
  "pago",
] as const

export type SituacaoReembolso = (typeof SITUACOES_REEMBOLSO)[number]

export type TipoReembolso = {
  id: string
  nome: string
  descricao: string | null
  valor_limite: number | null
  ativa: boolean
}

export async function listarTiposReembolso(): Promise<{
  disponivel: boolean
  tipos: TipoReembolso[]
}> {
  const admin = await createAdminClient()
  const { data, error } = await admin
    .from("pessoal_reembolsos_act_tipos")
    .select("id, nome, descricao, valor_limite, ativa")
    .order("nome", { ascending: true })
  if (error) {
    if (esquemaAusente(error)) return { disponivel: false, tipos: [] }
    throw new Error(`Falha ao listar tipos de reembolso: ${error.message}`)
  }
  return {
    disponivel: true,
    tipos: (data ?? []).map((t) => ({
      id: String(t.id),
      nome: String(t.nome ?? "(sem nome)"),
      descricao: (t.descricao as string | null) ?? null,
      valor_limite: (t.valor_limite as number | null) ?? null,
      ativa: t.ativa !== false,
    })),
  }
}

export type ReembolsoAct = {
  id: string
  funcionario_id: string | null
  funcionarioNome: string | null
  tipo_id: string | null
  tipoNome: string | null
  valor_solicitado: number | null
  valor_aprovado: number | null
  descricao: string | null
  comprovante_url: string | null
  situacao: SituacaoReembolso
  avaliador_id: string | null
  avaliadorNome: string | null
  avaliacao_data: string | null
  avaliacao_observacao: string | null
  pagamento_mes: string | null
  pagamento_ano: string | null
  pago_em: string | null
  created_at: string | null
}

async function nomesDosUsuarios(ids: string[]): Promise<Map<string, string>> {
  const nomes = new Map<string, string>()
  if (ids.length === 0) return nomes
  const admin = await createAdminClient()
  const { data } = await admin
    .from("usuarios")
    .select("id, nome_completo, nome_guerra")
    .in("id", ids)
  for (const u of data ?? []) {
    const nome = [u.nome_completo, u.nome_guerra].find(
      (v): v is string => typeof v === "string" && v.trim() !== ""
    )
    if (nome) nomes.set(u.id, nome)
  }
  return nomes
}

const SELECT_REEMBOLSO =
  "id, funcionario_id, tipo_id, valor_solicitado, valor_aprovado, descricao, comprovante_url, situacao, avaliador_id, avaliacao_data, avaliacao_observacao, pagamento_mes, pagamento_ano, pago_em, created_at"

async function normalizar(
  brutos: Record<string, unknown>[]
): Promise<ReembolsoAct[]> {
  const pessoas = [
    ...new Set(
      brutos
        .flatMap((r) => [r.funcionario_id, r.avaliador_id])
        .filter((v): v is string => Boolean(v))
        .map(String)
    ),
  ]
  const [nomes, { tipos }] = await Promise.all([
    nomesDosUsuarios(pessoas),
    listarTiposReembolso(),
  ])
  const nomeTipo = new Map(tipos.map((t) => [t.id, t.nome]))

  return brutos.map((r) => ({
    id: String(r.id),
    funcionario_id: (r.funcionario_id as string | null) ?? null,
    funcionarioNome: r.funcionario_id
      ? (nomes.get(String(r.funcionario_id)) ?? null)
      : null,
    tipo_id: (r.tipo_id as string | null) ?? null,
    tipoNome: r.tipo_id ? (nomeTipo.get(String(r.tipo_id)) ?? null) : null,
    valor_solicitado: (r.valor_solicitado as number | null) ?? null,
    valor_aprovado: (r.valor_aprovado as number | null) ?? null,
    descricao: (r.descricao as string | null) ?? null,
    comprovante_url: (r.comprovante_url as string | null) ?? null,
    situacao: (r.situacao as SituacaoReembolso) ?? "aguardando",
    avaliador_id: (r.avaliador_id as string | null) ?? null,
    avaliadorNome: r.avaliador_id
      ? (nomes.get(String(r.avaliador_id)) ?? null)
      : null,
    avaliacao_data: (r.avaliacao_data as string | null) ?? null,
    avaliacao_observacao: (r.avaliacao_observacao as string | null) ?? null,
    pagamento_mes: (r.pagamento_mes as string | null) ?? null,
    pagamento_ano: (r.pagamento_ano as string | null) ?? null,
    pago_em: (r.pago_em as string | null) ?? null,
    created_at: (r.created_at as string | null) ?? null,
  }))
}

export async function listarReembolsos(): Promise<{
  disponivel: boolean
  reembolsos: ReembolsoAct[]
}> {
  const admin = await createAdminClient()
  const { data, error } = await admin
    .from("pessoal_reembolsos_act")
    .select(SELECT_REEMBOLSO)
    .order("created_at", { ascending: false })
  if (error) {
    if (esquemaAusente(error)) return { disponivel: false, reembolsos: [] }
    throw new Error(`Falha ao listar reembolsos: ${error.message}`)
  }
  return {
    disponivel: true,
    reembolsos: await normalizar((data ?? []) as Record<string, unknown>[]),
  }
}

export async function meusReembolsos(usuarioId: string): Promise<{
  disponivel: boolean
  reembolsos: ReembolsoAct[]
}> {
  const admin = await createAdminClient()
  const { data, error } = await admin
    .from("pessoal_reembolsos_act")
    .select(SELECT_REEMBOLSO)
    .eq("funcionario_id", usuarioId)
    .order("created_at", { ascending: false })
  if (error) {
    if (esquemaAusente(error)) return { disponivel: false, reembolsos: [] }
    throw new Error(`Falha ao listar seus reembolsos: ${error.message}`)
  }
  return {
    disponivel: true,
    reembolsos: await normalizar((data ?? []) as Record<string, unknown>[]),
  }
}

export async function buscarReembolso(
  id: string
): Promise<ReembolsoAct | null> {
  const admin = await createAdminClient()
  const { data, error } = await admin
    .from("pessoal_reembolsos_act")
    .select(SELECT_REEMBOLSO)
    .eq("id", id)
    .maybeSingle()
  if (error) {
    if (esquemaAusente(error)) return null
    throw new Error(`Falha ao buscar reembolso: ${error.message}`)
  }
  if (!data) return null
  const [linha] = await normalizar([data as Record<string, unknown>])
  return linha ?? null
}

// ── Solicitação (funcionário) ──────────────────────────────────────────────

export type NovoReembolso = {
  funcionario_id: string
  tipo_id: string
  valor_solicitado: number
  descricao: string
  comprovante_url: string | null
}

export async function criarReembolso(
  novo: NovoReembolso
): Promise<{ erro?: string }> {
  const { disponivel, tipos } = await listarTiposReembolso()
  if (!disponivel) {
    return {
      erro: "Reembolsos ainda não configurados — rode supabase/reembolsos-act.sql.",
    }
  }
  const tipo = tipos.find((t) => t.id === novo.tipo_id)
  if (!tipo || !tipo.ativa) return { erro: "Escolha um tipo de reembolso válido." }
  if (tipo.valor_limite !== null && novo.valor_solicitado > tipo.valor_limite) {
    return {
      erro: `O valor passa do teto do ACT para ${tipo.nome} (${formatarMoeda(tipo.valor_limite)}).`,
    }
  }

  const admin = await createAdminClient()
  const { error } = await admin.from("pessoal_reembolsos_act").insert({
    funcionario_id: novo.funcionario_id,
    tipo_id: novo.tipo_id,
    valor_solicitado: novo.valor_solicitado,
    descricao: novo.descricao,
    comprovante_url: novo.comprovante_url,
    situacao: "aguardando",
    emp_proprietaria_id: await tenantAtual(),
  })
  if (error) {
    if (esquemaAusente(error)) {
      return {
        erro: "Reembolsos ainda não configurados — rode supabase/reembolsos-act.sql.",
      }
    }
    return { erro: `Não foi possível solicitar: ${error.message}` }
  }
  return {}
}

/** Cancela a PRÓPRIA solicitação, apenas enquanto aguardando avaliação. */
export async function cancelarReembolso(
  id: string,
  usuarioId: string
): Promise<{ erro?: string }> {
  const admin = await createAdminClient()
  const { data, error } = await admin
    .from("pessoal_reembolsos_act")
    .update({ situacao: "cancelado", updated_at: new Date().toISOString() })
    .eq("id", id)
    .eq("funcionario_id", usuarioId)
    .eq("situacao", "aguardando")
    .select("id")
  if (error) return { erro: `Não foi possível cancelar: ${error.message}` }
  if ((data ?? []).length === 0) {
    return { erro: "Solicitação não encontrada ou já avaliada." }
  }
  return {}
}

// ── Avaliação e pagamento (gestão) ─────────────────────────────────────────

async function notificarReembolso(
  funcionarioId: string,
  assunto: string,
  mensagem: string
): Promise<void> {
  try {
    await criarNotificacao({ usuarioId: funcionarioId, texto: mensagem })
  } catch (e) {
    console.error("Falha ao notificar reembolso:", e)
  }
  await enviarPushTelegram(funcionarioId, mensagem, "reembolso")
  const admin = await createAdminClient()
  const { data: usuario } = await admin
    .from("usuarios")
    .select("email, nome_completo, nome_guerra")
    .eq("id", funcionarioId)
    .maybeSingle()
  if (!usuario?.email) return
  const nome = usuario.nome_completo ?? usuario.nome_guerra ?? null
  await enviarEmail({
    email: usuario.email,
    nome,
    assunto: `${assunto} — Sindipetro-NF`,
    html: `<p>Olá${nome ? `, ${String(nome).split(" ")[0]}` : ""}!</p><p>${mensagem}</p><p>Acompanhe em <a href="${SITE_URL}/painel/perfil/reembolsos">${SITE_URL}/painel/perfil/reembolsos</a>.</p><p>Confluir — Sindipetro-NF</p>`,
  })
}

export type AvaliacaoReembolso = {
  aprovar: boolean
  valor_aprovado: number | null
  observacao: string | null
  pagamento_mes: string | null
  pagamento_ano: string | null
}

/** Aprova/reprova uma solicitação AGUARDANDO e avisa o funcionário. */
export async function avaliarReembolso(
  id: string,
  avaliadorId: string,
  avaliacao: AvaliacaoReembolso
): Promise<{ erro?: string }> {
  const reembolso = await buscarReembolso(id)
  if (!reembolso) return { erro: "Solicitação não encontrada." }
  if (reembolso.situacao !== "aguardando") {
    return { erro: "Esta solicitação já foi avaliada ou cancelada." }
  }

  if (avaliacao.aprovar) {
    if (!avaliacao.valor_aprovado || avaliacao.valor_aprovado <= 0) {
      return { erro: "Informe o valor aprovado." }
    }
    const { tipos } = await listarTiposReembolso()
    const tipo = tipos.find((t) => t.id === reembolso.tipo_id)
    if (
      tipo?.valor_limite != null &&
      avaliacao.valor_aprovado > tipo.valor_limite
    ) {
      return {
        erro: `O valor aprovado passa do teto do ACT para ${tipo.nome} (${formatarMoeda(tipo.valor_limite)}).`,
      }
    }
  } else if (!avaliacao.observacao) {
    return { erro: "Informe o motivo da reprovação." }
  }

  const admin = await createAdminClient()
  const { data, error } = await admin
    .from("pessoal_reembolsos_act")
    .update({
      situacao: avaliacao.aprovar ? "aprovado" : "reprovado",
      valor_aprovado: avaliacao.aprovar ? avaliacao.valor_aprovado : null,
      avaliador_id: avaliadorId,
      avaliacao_data: new Date().toISOString(),
      avaliacao_observacao: avaliacao.observacao,
      pagamento_mes: avaliacao.aprovar ? avaliacao.pagamento_mes : null,
      pagamento_ano: avaliacao.aprovar ? avaliacao.pagamento_ano : null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id)
    .eq("situacao", "aguardando")
    .select("id")
  if (error) return { erro: `Não foi possível salvar: ${error.message}` }
  if ((data ?? []).length === 0) {
    return { erro: "Esta solicitação já foi avaliada ou cancelada." }
  }

  if (reembolso.funcionario_id) {
    const resumo = reembolso.tipoNome ?? "reembolso do ACT"
    const referencia =
      avaliacao.pagamento_mes && avaliacao.pagamento_ano
        ? ` no contracheque de ${avaliacao.pagamento_mes}/${avaliacao.pagamento_ano}`
        : " em contracheque"
    await notificarReembolso(
      reembolso.funcionario_id,
      avaliacao.aprovar ? "Reembolso aprovado" : "Reembolso reprovado",
      avaliacao.aprovar
        ? `Seu reembolso (${resumo}) foi APROVADO no valor de ${formatarMoeda(avaliacao.valor_aprovado)} — será pago${referencia}.`
        : `Seu reembolso (${resumo}) foi reprovado.${avaliacao.observacao ? ` Motivo: ${avaliacao.observacao}` : ""}`
    )
  }
  return {}
}

/** Marca reembolso APROVADO como pago (entrou no contracheque) e avisa. */
export async function marcarReembolsoPago(
  id: string
): Promise<{ erro?: string }> {
  const admin = await createAdminClient()
  const hoje = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
  }).format(new Date())
  const { data, error } = await admin
    .from("pessoal_reembolsos_act")
    .update({
      situacao: "pago",
      pago_em: hoje,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id)
    .eq("situacao", "aprovado")
    .select("funcionario_id, valor_aprovado, pagamento_mes, pagamento_ano, tipo_id")
  if (error) return { erro: `Não foi possível salvar: ${error.message}` }
  if ((data ?? []).length === 0) {
    return { erro: "Só reembolsos aprovados podem ser marcados como pagos." }
  }

  const r = data![0]
  if (r.funcionario_id) {
    const { tipos } = await listarTiposReembolso()
    const tipo = tipos.find((t) => t.id === r.tipo_id)
    const referencia =
      r.pagamento_mes && r.pagamento_ano
        ? ` de ${r.pagamento_mes}/${r.pagamento_ano}`
        : ""
    await notificarReembolso(
      r.funcionario_id,
      "Reembolso pago",
      `Seu reembolso (${tipo?.nome ?? "ACT"}) de ${formatarMoeda(r.valor_aprovado)} foi pago no contracheque${referencia}.`
    )
  }
  return {}
}

export async function tipoReembolsoEmUso(tipoId: string): Promise<number> {
  const admin = await createAdminClient()
  const { count, error } = await admin
    .from("pessoal_reembolsos_act")
    .select("id", { count: "exact", head: true })
    .eq("tipo_id", tipoId)
  if (error) return 0
  return count ?? 0
}
