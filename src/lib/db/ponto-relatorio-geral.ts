import "server-only"

import { esquemaAusente, lerEmLotesPorIds, texto } from "@/lib/db/comum"
import { carregarBasePonto } from "@/lib/db/ponto-analise"
import type { FaixasHE } from "@/lib/faixas-he"
import type { FaixasAcerto, MotivoAcerto } from "@/lib/ponto-acertos"
import { montarRelatorioGeral, type FiltroRelatorio, type ItemAcertoRelatorio, type RelatorioGeral } from "@/lib/ponto-relatorio-geral"
import { createAdminClient } from "@/lib/supabase/admin"
import { tenantAtual } from "@/lib/tenant"

/**
 * Relatório consolidado do ponto e das horas extras (Ponto, Fase 3 —
 * 28/11/2026): lê a base do ponto e os acertos do banco (com o quanto foi
 * zerado) e monta o relatório (lib/ponto-relatorio-geral). A tela, o PDF e a
 * planilha usam o mesmo resultado.
 */

async function itensDeAcerto(): Promise<ItemAcertoRelatorio[]> {
  const admin = await createAdminClient()
  const emp = await tenantAtual()
  const itens: Record<string, unknown>[] = []
  try {
    for (let de = 0; ; de += 1000) {
      const { data, error } = await admin
        .from("pessoal_ponto_acerto_itens")
        .select("acerto_id, funcionario_id, competencia, saldo_70, saldo_100")
        .eq("emp_proprietaria_id", emp)
        .order("id")
        .range(de, de + 999)
      if (error) throw error
      itens.push(...((data ?? []) as Record<string, unknown>[]))
      if (!data || data.length < 1000) break
    }
  } catch (e) {
    if (esquemaAusente(e as { code?: string })) return []
    throw e
  }
  if (!itens.length) return []
  const ids = [...new Set(itens.map((i) => String(i.acerto_id)))]
  const acertos = await lerEmLotesPorIds<Record<string, unknown>>(ids, (fatia, de, ate) =>
    admin.from("pessoal_ponto_acertos").select("id, faixas, motivo").in("id", fatia).order("id").range(de, ate)
  )
  const porId = new Map(acertos.map((a) => [String(a.id), a]))
  const num = (v: unknown) => (v === null || v === undefined ? null : Number(v))
  return itens.flatMap((i) => {
    const a = porId.get(String(i.acerto_id))
    const f = texto(i.funcionario_id)
    if (!a || !f) return []
    return [
      {
        acertoId: String(i.acerto_id),
        funcionarioId: f,
        competencia: String(i.competencia),
        faixas: String(a.faixas) as FaixasAcerto,
        motivo: String(a.motivo) as MotivoAcerto,
        saldo70: num(i.saldo_70),
        saldo100: num(i.saldo_100),
      },
    ]
  })
}

export type OpcoesRelatorio = {
  departamentos: { chave: string; nome: string }[]
  funcionarios: { id: string; nome: string }[]
  /** Primeira e última competência com registro. */
  primeira: string | null
  ultima: string | null
}

/** O relatório pelos parâmetros da URL (de, ate, departamento, funcionario). */
export async function relatorioGeralPonto(
  sp: Record<string, string | undefined>
): Promise<{ relatorio: RelatorioGeral; opcoes: OpcoesRelatorio; faixas: FaixasHE }> {
  const [base, acertos] = await Promise.all([carregarBasePonto(), itensDeAcerto()])
  const funcionarios = new Map<string, string>()
  for (const r of base.registros) funcionarios.set(r.funcionarioId, r.nome)
  const comps = base.registros.map((r) => r.competencia).sort()
  const filtro = filtroDaUrl(sp, comps[comps.length - 1] ?? null)
  return {
    relatorio: montarRelatorioGeral(base.registros, acertos, filtro),
    faixas: base.faixas,
    opcoes: {
      departamentos: base.departamentos,
      funcionarios: [...funcionarios].map(([id, nome]) => ({ id, nome })).sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR")),
      primeira: comps[0] ?? null,
      ultima: comps[comps.length - 1] ?? null,
    },
  }
}

/** Filtro a partir da URL; sem período, o ano da última competência com registro (ou o atual). */
export function filtroDaUrl(sp: Record<string, string | undefined>, ultima: string | null): FiltroRelatorio {
  const ok = (v: string | undefined) => (v && /^\d{4}-(0[1-9]|1[0-2])$/.test(v) ? v : null)
  const ano = (ultima ?? new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date())).slice(0, 4)
  let de = ok(sp.de) ?? `${ano}-01`
  let ate = ok(sp.ate) ?? `${ano}-12`
  if (de > ate) [de, ate] = [ate, de]
  return { de, ate, departamento: sp.departamento || null, funcionario: sp.funcionario || null }
}
