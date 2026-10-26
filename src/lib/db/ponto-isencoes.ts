import "server-only"

import { hojeEmBrasilia } from "@/lib/assembleias-constantes"
import { esquemaAusente } from "@/lib/db/comum"
import { createAdminClient } from "@/lib/supabase/admin"
import { tenantAtual } from "@/lib/tenant"

/**
 * Isenção de registro de ponto: o funcionário não registra ponto no período
 * (cargo de confiança, afastamento longo…). Quem está isento no mês inteiro
 * da remessa não aparece como pendente; quem está isento em parte do mês
 * continua pendente, com a isenção à vista.
 */
export type IsencaoPonto = {
  id: string
  funcionarioId: string
  funcionarioNome: string
  inicio: string
  /** Último dia; null = sem prazo. */
  fim: string | null
  justificativa: string
  registradoPorNome: string | null
  encerradoPorNome: string | null
  encerradoEm: string | null
  createdAt: string
}

const nomeDe = (u: { nome_guerra?: string | null; nome_completo?: string | null } | null | undefined) =>
  u?.nome_completo?.trim() || u?.nome_guerra?.trim() || null

/** Todas as isenções da entidade (ou de um funcionário), da mais recente à mais antiga. */
export async function listarIsencoesPonto(funcionarioId?: string): Promise<IsencaoPonto[]> {
  const admin = await createAdminClient()
  let q = admin
    .from("pessoal_ponto_isencoes")
    .select("id, funcionario_id, inicio, fim, justificativa, registrado_por, encerrado_por, encerrado_em, created_at")
    .eq("emp_proprietaria_id", await tenantAtual())
    .order("inicio", { ascending: false })
    .range(0, 4999)
  if (funcionarioId) q = q.eq("funcionario_id", funcionarioId)
  const { data, error } = await q
  if (error) {
    if (esquemaAusente(error)) return []
    throw new Error(`Falha ao ler as isenções de ponto: ${error.message}`)
  }
  const linhas = data ?? []
  const ids = [
    ...new Set(linhas.flatMap((l) => [l.funcionario_id, l.registrado_por, l.encerrado_por]).filter((x): x is string => !!x)),
  ]
  const nomes = new Map<string, string>()
  if (ids.length) {
    const { data: us } = await admin.from("usuarios").select("id, nome_completo, nome_guerra").in("id", ids)
    for (const u of us ?? []) nomes.set(u.id, nomeDe(u) ?? "(sem nome)")
  }
  return linhas.map((l) => ({
    id: l.id,
    funcionarioId: l.funcionario_id,
    funcionarioNome: nomes.get(l.funcionario_id) ?? "(sem nome)",
    inicio: l.inicio,
    fim: l.fim,
    justificativa: l.justificativa,
    registradoPorNome: l.registrado_por ? (nomes.get(l.registrado_por) ?? null) : null,
    encerradoPorNome: l.encerrado_por ? (nomes.get(l.encerrado_por) ?? null) : null,
    encerradoEm: l.encerrado_em,
    createdAt: l.created_at,
  }))
}

/** Primeiro e último dia de uma competência 'AAAA-MM'. */
export function limitesDoMes(competencia: string): { primeiro: string; ultimo: string } {
  const [a, m] = competencia.split("-").map(Number)
  const dias = new Date(Date.UTC(a, m, 0)).getUTCDate()
  const mm = String(m).padStart(2, "0")
  return { primeiro: `${a}-${mm}-01`, ultimo: `${a}-${mm}-${String(dias).padStart(2, "0")}` }
}

/** A isenção cobre o mês inteiro, parte dele ou nada. */
export function coberturaNoMes(i: Pick<IsencaoPonto, "inicio" | "fim">, competencia: string): "inteiro" | "parcial" | null {
  const { primeiro, ultimo } = limitesDoMes(competencia)
  if (i.inicio > ultimo || (i.fim !== null && i.fim < primeiro)) return null
  return i.inicio <= primeiro && (i.fim === null || i.fim >= ultimo) ? "inteiro" : "parcial"
}

/** Situação da isenção hoje. */
export function situacaoIsencao(i: Pick<IsencaoPonto, "inicio" | "fim">, hoje = hojeEmBrasilia()): "vigente" | "futura" | "encerrada" {
  if (i.inicio > hoje) return "futura"
  if (i.fim !== null && i.fim < hoje) return "encerrada"
  return "vigente"
}

/**
 * Isentos numa competência 'AAAA-MM': `inteiro` (não são pendência) e
 * `parcial` (continuam pendentes; a isenção vai junto como nota).
 */
export async function isentosNaCompetencia(competencia: string | null): Promise<{
  inteiro: Map<string, IsencaoPonto>
  parcial: Map<string, IsencaoPonto>
}> {
  const inteiro = new Map<string, IsencaoPonto>()
  const parcial = new Map<string, IsencaoPonto>()
  if (!competencia) return { inteiro, parcial }
  const porFuncionario = new Map<string, IsencaoPonto[]>()
  for (const i of await listarIsencoesPonto()) {
    if (!coberturaNoMes(i, competencia)) continue
    porFuncionario.set(i.funcionarioId, [...(porFuncionario.get(i.funcionarioId) ?? []), i])
  }
  const { primeiro, ultimo } = limitesDoMes(competencia)
  const diaSeguinte = (d: string) => new Date(Date.parse(`${d}T12:00:00Z`) + 86_400_000).toISOString().slice(0, 10)
  for (const [id, lista] of porFuncionario) {
    // Isenções seguidas (uma encerrada e outra registrada no dia seguinte)
    // somam: o mês está coberto se não sobra dia descoberto.
    lista.sort((a, b) => a.inicio.localeCompare(b.inicio))
    let cursor: string | null = primeiro
    for (const i of lista) {
      if (cursor === null || i.inicio > cursor) break
      cursor = i.fim === null ? null : i.fim >= cursor ? diaSeguinte(i.fim) : cursor
    }
    const coberto = cursor === null || cursor > ultimo
    ;(coberto ? inteiro : parcial).set(id, lista[lista.length - 1])
  }
  return { inteiro, parcial }
}

/** "01/03/2026 a 31/05/2026" ou "desde 01/03/2026 (sem prazo)". */
export function periodoIsencao(i: Pick<IsencaoPonto, "inicio" | "fim">): string {
  const br = (d: string) => d.split("-").reverse().join("/")
  return i.fim ? `${br(i.inicio)} a ${br(i.fim)}` : `desde ${br(i.inicio)} (sem prazo)`
}
