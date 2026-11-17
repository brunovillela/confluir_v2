import "server-only"

import type { SupabaseClient } from "@supabase/supabase-js"

import { avisar, depoisDaResposta, type Destinatario } from "@/lib/db/avisos"
import { esquemaAusente, hojeSP } from "@/lib/db/comum"
import type { ContextoEmail } from "@/lib/email"
import { formatarData } from "@/lib/formato"
import { createAdminClient } from "@/lib/supabase/admin"
import { tenantAtual } from "@/lib/tenant"

/**
 * ORDENS DE COMPRA DEVOLVIDAS (16/11/2026). O avaliador devolve a ordem
 * ("Aguardando informações") pedindo um ajuste, mas ninguém era avisado: a
 * medição do dia achou 10 ordens de compra paradas, a mais antiga havia 41
 * dias. Agora quem lançou é avisado na devolução, vê a pendência na caixa de
 * entrada e em Minhas solicitações, e recebe um lembrete por semana.
 *
 * "Quem lançou" não é coluna da ordem: é o usuário do primeiro evento da
 * trilha (a verificação na criação). Sem ele, o comprador do fornecimento e,
 * por último, o solicitante do processo.
 */

type Linha = Record<string, unknown>
const t = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : null)
/** O motivo vai no meio da frase: sem o ponto final dele. */
const semPonto = (v: string | null) => (v ? v.replace(/[.s]+$/, "") : null)

export const SITUACAO_DEVOLVIDA = "Aguardando informações"
/** Tipos de ordem das compras (a direta antiga do Bubble tinha tipo próprio). */
export const TIPOS_ORDEM_COMPRA = ["Compras", "Aquisição direta pelo Departamento"]

export type OrdemDevolvida = {
  id: string
  codigo: string | null
  descricao: string | null
  valor: number | null
  processoId: string | null
  processoCodigo: string | null
  motivo: string | null
  devolvidaEm: string | null
  devolvidaPorNome: string | null
  lancadaPor: string | null
}

/** Quem lançou cada ordem (primeiro evento com usuário; senão, comprador/solicitante). */
async function quemLancou(client: SupabaseClient, ordens: Linha[]): Promise<Map<string, string>> {
  const mapa = new Map<string, string>()
  const ids = ordens.map((o) => String(o.id))
  if (!ids.length) return mapa
  const { data: ev } = await client
    .from("ordens_pagamento_eventos")
    .select("ordem_id, usuario_id, created_at")
    .in("ordem_id", ids)
    .not("usuario_id", "is", null)
    .order("created_at", { ascending: true })
  for (const e of (ev ?? []) as Linha[]) {
    const o = String(e.ordem_id)
    if (!mapa.has(o) && t(e.usuario_id)) mapa.set(o, String(e.usuario_id))
  }
  const semDono = ordens.filter((o) => !mapa.has(String(o.id)))
  if (semDono.length) {
    const fornIds = semDono.map((o) => t(o.fornecimento_id)).filter((v): v is string => !!v)
    const procIds = semDono.map((o) => t(o.processo_compra_id)).filter((v): v is string => !!v)
    const [{ data: fs }, { data: ps }] = await Promise.all([
      fornIds.length ? client.from("compras_fornecimentos").select("id, comprador_id").in("id", fornIds) : Promise.resolve({ data: [] }),
      procIds.length ? client.from("compras_solicitacoes").select("id, solicitante_id, comprado_por_id").in("id", procIds) : Promise.resolve({ data: [] }),
    ])
    const comprador = new Map(((fs ?? []) as Linha[]).map((f) => [String(f.id), t(f.comprador_id)]))
    const proc = new Map(((ps ?? []) as Linha[]).map((p) => [String(p.id), p]))
    for (const o of semDono) {
      const p = t(o.processo_compra_id) ? proc.get(String(o.processo_compra_id)) : undefined
      const id =
        (t(o.fornecimento_id) ? comprador.get(String(o.fornecimento_id)) : null) ??
        t(p?.comprado_por_id) ??
        t(p?.solicitante_id)
      if (id) mapa.set(String(o.id), id)
    }
  }
  return mapa
}

async function ordensDevolvidasDoTenant(client: SupabaseClient, tenantId: string): Promise<Linha[]> {
  const { data, error } = await client
    .from("ordens_pagamento")
    .select("id, codigo, descricao, valor_inicial_cobranca, processo_compra_id, fornecimento_id, autorizacao_observacao, autorizacao_autorizador_id, autorizacao_data")
    .eq("emp_proprietaria_id", tenantId)
    .eq("situacao", SITUACAO_DEVOLVIDA)
    .in("tipo", TIPOS_ORDEM_COMPRA)
    .eq("excluido", false)
    .limit(500)
  if (error) {
    if (esquemaAusente(error)) return []
    throw new Error(error.message)
  }
  return (data ?? []) as Linha[]
}

/** As ordens de compra devolvidas que a pessoa lançou (Minhas solicitações e caixa de entrada). */
export async function ordensDevolvidasDe(
  usuarioId: string,
  amb: { client?: SupabaseClient; tenantId?: string } = {}
): Promise<OrdemDevolvida[]> {
  const client = amb.client ?? (await createAdminClient())
  const tenantId = amb.tenantId ?? (await tenantAtual())
  const todas = await ordensDevolvidasDoTenant(client, tenantId)
  if (!todas.length) return []
  const dono = await quemLancou(client, todas)
  const minhas = todas.filter((o) => dono.get(String(o.id)) === usuarioId)
  return detalhar(client, minhas, dono)
}

async function detalhar(client: SupabaseClient, ordens: Linha[], dono: Map<string, string>): Promise<OrdemDevolvida[]> {
  if (!ordens.length) return []
  const procIds = [...new Set(ordens.map((o) => t(o.processo_compra_id)).filter((v): v is string => !!v))]
  const avaliadores = [...new Set(ordens.map((o) => t(o.autorizacao_autorizador_id)).filter((v): v is string => !!v))]
  const [{ data: ps }, { data: us }] = await Promise.all([
    procIds.length ? client.from("compras_solicitacoes").select("id, codigo").in("id", procIds) : Promise.resolve({ data: [] }),
    avaliadores.length ? client.from("usuarios").select("id, nome_completo, nome_guerra").in("id", avaliadores) : Promise.resolve({ data: [] }),
  ])
  const codigoProc = new Map(((ps ?? []) as Linha[]).map((p) => [String(p.id), t(p.codigo)]))
  const nome = new Map(((us ?? []) as Linha[]).map((u) => [String(u.id), t(u.nome_guerra) ?? t(u.nome_completo)]))
  return ordens
    .map((o) => ({
      id: String(o.id),
      codigo: t(o.codigo),
      descricao: t(o.descricao),
      valor: (o.valor_inicial_cobranca as number | null) ?? null,
      processoId: t(o.processo_compra_id),
      processoCodigo: t(o.processo_compra_id) ? (codigoProc.get(String(o.processo_compra_id)) ?? null) : null,
      motivo: t(o.autorizacao_observacao),
      devolvidaEm: t(o.autorizacao_data),
      devolvidaPorNome: t(o.autorizacao_autorizador_id) ? (nome.get(String(o.autorizacao_autorizador_id)) ?? null) : null,
      lancadaPor: dono.get(String(o.id)) ?? null,
    }))
    .sort((a, b) => (a.devolvidaEm ?? "").localeCompare(b.devolvidaEm ?? ""))
}

async function destinatario(client: SupabaseClient, usuarioId: string): Promise<Destinatario | null> {
  const { data: u } = await client
    .from("usuarios")
    .select("id, nome_completo, nome_guerra, email")
    .eq("id", usuarioId)
    .not("inativo", "is", true)
    .not("deletado", "is", true)
    .maybeSingle()
  return u ? { id: String(u.id), nome: t(u.nome_completo) ?? t(u.nome_guerra), email: t(u.email), permissoes: {} } : null
}

function linkDa(o: { processoId: string | null; id: string }): string {
  return o.processoId ? `/painel/compras/${o.processoId}#ordem-devolvida` : `/painel/financeiro/ordens/${o.id}`
}

/**
 * Na devolução (chamado por avaliarOrdem): avisa quem lançou a ordem de
 * compra, com o motivo. Outras origens seguem os próprios fluxos.
 */
export function avisarOrdemDevolvida(ordemId: string, avaliadorId: string): void {
  depoisDaResposta(async () => {
    const client = await createAdminClient()
    const { data: o } = await client
      .from("ordens_pagamento")
      .select("id, codigo, descricao, tipo, processo_compra_id, fornecimento_id, autorizacao_observacao, autorizacao_autorizador_id, autorizacao_data, valor_inicial_cobranca")
      .eq("id", ordemId)
      .maybeSingle()
    if (!o || !TIPOS_ORDEM_COMPRA.includes(String(o.tipo))) return
    const dono = await quemLancou(client, [o as Linha])
    const usuarioId = dono.get(ordemId)
    if (!usuarioId || usuarioId === avaliadorId) return
    const quem = await destinatario(client, usuarioId)
    if (!quem) return
    const [d] = await detalhar(client, [o as Linha], dono)
    return avisar([quem], {
      texto: `Sua ordem foi devolvida: ${d.codigo ?? ""}${d.processoCodigo ? ` (compra ${d.processoCodigo})` : ""}${d.devolvidaPorNome ? ` por ${d.devolvidaPorNome}` : ""}. Motivo: ${semPonto(d.motivo) ?? "não informado"}. Corrija a compra ou responda e reenvie para autorização.`.slice(0, 450),
      link: linkDa(d),
      evento: "ordem_devolvida",
      assunto: `Ordem devolvida: ${d.codigo ?? ""}`,
    })
  })
}

/** Dias desde a devolução. */
function diasDesde(iso: string | null, hoje: string): number {
  if (!iso) return 0
  return Math.max(0, Math.round((Date.parse(`${hoje}T12:00:00Z`) - Date.parse(`${iso.slice(0, 10)}T12:00:00Z`)) / 86_400_000))
}

/**
 * Lembrete semanal (tick diário das pendências): ordem de compra devolvida há
 * 7 dias ou mais lembra quem lançou, uma vez por semana (avisos_entregas /
 * texto estável na semana).
 */
export async function lembrarOrdensDevolvidas(
  client: SupabaseClient,
  tenantId: string,
  contexto: ContextoEmail
): Promise<{ devolvidas: number; avisos: number; erros: string[] }> {
  const erros: string[] = []
  const amb = { client, tenantId, contexto }
  let todas: Linha[]
  try {
    todas = await ordensDevolvidasDoTenant(client, tenantId)
  } catch (e) {
    return { devolvidas: 0, avisos: 0, erros: [e instanceof Error ? e.message : String(e)] }
  }
  if (!todas.length) return { devolvidas: 0, avisos: 0, erros }
  const dono = await quemLancou(client, todas)
  const lista = await detalhar(client, todas, dono)
  const hoje = hojeSP()
  let avisos = 0
  for (const d of lista) {
    const dias = diasDesde(d.devolvidaEm, hoje)
    if (dias < 7 || !d.lancadaPor) continue
    const quem = await destinatario(client, d.lancadaPor)
    if (!quem) continue
    const semanas = Math.floor(dias / 7)
    try {
      avisos += await avisar(
        [quem],
        {
          texto: `Lembrete: a ordem ${d.codigo ?? ""}${d.processoCodigo ? ` (compra ${d.processoCodigo})` : ""} está devolvida há ${semanas} semana${semanas === 1 ? "" : "s"}${d.devolvidaEm ? `, desde ${formatarData(d.devolvidaEm)}` : ""}. Motivo: ${semPonto(d.motivo) ?? "não informado"}. Corrija a compra ou responda e reenvie para autorização.`.slice(0, 450),
          link: linkDa(d),
          evento: "ordem_devolvida",
          assunto: `Ordem devolvida há ${semanas} semana${semanas === 1 ? "" : "s"}: ${d.codigo ?? ""}`,
          chaveEntrega: `ordem-devolvida:${d.id}:${semanas}`,
        },
        amb
      )
    } catch (e) {
      erros.push(`${d.codigo}: ${e instanceof Error ? e.message : String(e)}`)
    }
  }
  return { devolvidas: lista.length, avisos, erros }
}
