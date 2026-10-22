import "server-only"

import { esquemaAusente, hojeSP, texto } from "@/lib/db/comum"
import { createAdminClient } from "@/lib/supabase/admin"
import { tenantAtual } from "@/lib/tenant"

/**
 * Fechamento do mês contábil (financeiro_meses_fechados): depois que a
 * contabilidade recebe o mês, a classificação das ordens pagas nele (centro de
 * custo, departamento, rateio) não muda mais. A régua é a da exportação — a
 * data do pagamento. Reabrir grava quem e por quê; o histórico fica.
 */

export type MesFechado = {
  id: string
  /** "AAAA-MM". */
  mes: string
  fechadoEm: string
  fechadoPor: string | null
  observacao: string | null
}

const MES = /^\d{4}-(0[1-9]|1[0-2])$/

/** Meses com fechamento vigente, do mais recente ao mais antigo. */
export async function listarMesesFechados(): Promise<MesFechado[]> {
  const admin = await createAdminClient()
  const { data, error } = await admin
    .from("financeiro_meses_fechados")
    .select("id, mes, fechado_em, observacao, fechado_por_usuario_id")
    .eq("emp_proprietaria_id", await tenantAtual())
    .is("reaberto_em", null)
    .order("mes", { ascending: false })
  if (error) {
    if (esquemaAusente(error)) return []
    throw new Error(`Falha ao ler os meses fechados: ${error.message}`)
  }
  const linhas = (data ?? []) as Record<string, unknown>[]
  const ids = [...new Set(linhas.map((m) => texto(m.fechado_por_usuario_id)).filter((v): v is string => Boolean(v)))]
  const { data: usuarios } = ids.length
    ? await admin.from("usuarios").select("id, nome_guerra, nome_completo").in("id", ids)
    : { data: [] as Record<string, unknown>[] }
  const nome = new Map(
    ((usuarios ?? []) as Record<string, unknown>[]).map((u) => [String(u.id), texto(u.nome_guerra) ?? texto(u.nome_completo)])
  )
  return linhas.map((m) => ({
    id: String(m.id),
    mes: String(m.mes).slice(0, 7),
    fechadoEm: String(m.fechado_em),
    fechadoPor: nome.get(texto(m.fechado_por_usuario_id) ?? "") ?? null,
    observacao: texto(m.observacao),
  }))
}

/** O mês desta data (ISO) está fechado para a contabilidade? */
export async function mesEstaFechado(data: string | null | undefined): Promise<boolean> {
  if (!data) return false
  const admin = await createAdminClient()
  const { data: linha, error } = await admin
    .from("financeiro_meses_fechados")
    .select("id")
    .eq("emp_proprietaria_id", await tenantAtual())
    .eq("mes", `${data.slice(0, 7)}-01`)
    .is("reaberto_em", null)
    .maybeSingle()
  if (error) {
    if (esquemaAusente(error)) return false
    throw new Error(`Falha ao ler o fechamento do mês: ${error.message}`)
  }
  return Boolean(linha)
}

export async function fecharMes(mes: string, usuarioId: string, observacao: string | null): Promise<{ erro?: string }> {
  if (!MES.test(mes)) return { erro: "Mês inválido." }
  if (mes > hojeSP().slice(0, 7)) return { erro: "Não dá para fechar um mês que ainda não começou." }
  const admin = await createAdminClient()
  const { error } = await admin.from("financeiro_meses_fechados").insert({
    emp_proprietaria_id: await tenantAtual(),
    mes: `${mes}-01`,
    fechado_por_usuario_id: usuarioId,
    observacao: observacao?.trim() || null,
  })
  if (error) {
    if (error.code === "23505") return { erro: "Este mês já está fechado." }
    return { erro: `Não foi possível fechar o mês: ${error.message}` }
  }
  return {}
}

export async function reabrirMes(id: string, usuarioId: string, motivo: string): Promise<{ erro?: string }> {
  if (!motivo.trim()) return { erro: "Informe o motivo da reabertura." }
  const admin = await createAdminClient()
  const { data, error } = await admin
    .from("financeiro_meses_fechados")
    .update({ reaberto_em: new Date().toISOString(), reaberto_por_usuario_id: usuarioId, motivo_reabertura: motivo.trim() })
    .eq("id", id)
    .eq("emp_proprietaria_id", await tenantAtual())
    .is("reaberto_em", null)
    .select("id")
  if (error) return { erro: `Não foi possível reabrir o mês: ${error.message}` }
  if (!data?.length) return { erro: "Este mês já não está fechado." }
  return {}
}
