import "server-only"

import { esquemaAusente, lerEmLotesPorIds, texto } from "@/lib/db/comum"
import type { AcertoDaPessoa, FaixasAcerto, MotivoAcerto } from "@/lib/ponto-acertos"
import { createAdminClient } from "@/lib/supabase/admin"
import { tenantAtual } from "@/lib/tenant"

/**
 * Os acertos do banco de horas de cada funcionário (lib/ponto-acertos). Módulo
 * à parte para a cadeia de saldos (ponto-cascata, saldosAnterioresPonto) ler
 * os acertos sem depender de quem os grava. Sem a tabela (migração não
 * aplicada), nenhum acerto.
 */
export async function acertosPorFuncionario(funcionarioIds?: string[]): Promise<Map<string, AcertoDaPessoa[]>> {
  const admin = await createAdminClient()
  const emp = await tenantAtual()
  const saida = new Map<string, AcertoDaPessoa[]>()
  let itens: Record<string, unknown>[]
  try {
    itens = funcionarioIds
      ? await lerEmLotesPorIds<Record<string, unknown>>(funcionarioIds, (fatia, de, ate) =>
          admin
            .from("pessoal_ponto_acerto_itens")
            .select("acerto_id, funcionario_id, competencia")
            .eq("emp_proprietaria_id", emp)
            .in("funcionario_id", fatia)
            .order("id")
            .range(de, ate)
        )
      : await (async () => {
          const todos: Record<string, unknown>[] = []
          for (let de = 0; ; de += 1000) {
            const { data, error } = await admin
              .from("pessoal_ponto_acerto_itens")
              .select("acerto_id, funcionario_id, competencia")
              .eq("emp_proprietaria_id", emp)
              .order("id")
              .range(de, de + 999)
            if (error) throw error
            todos.push(...((data ?? []) as Record<string, unknown>[]))
            if (!data || data.length < 1000) break
          }
          return todos
        })()
  } catch (e) {
    if (esquemaAusente(e as { code?: string })) return saida
    throw e
  }
  if (!itens.length) return saida
  const ids = [...new Set(itens.map((i) => String(i.acerto_id)))]
  const acertos = await lerEmLotesPorIds<Record<string, unknown>>(ids, (fatia, de, ate) =>
    admin.from("pessoal_ponto_acertos").select("id, competencia, faixas, motivo").in("id", fatia).order("id").range(de, ate)
  )
  const porId = new Map(acertos.map((a) => [String(a.id), a]))
  for (const i of itens) {
    const a = porId.get(String(i.acerto_id))
    const f = texto(i.funcionario_id)
    if (!a || !f) continue
    const lista = saida.get(f) ?? []
    lista.push({
      acertoId: String(a.id),
      competencia: String(a.competencia),
      faixas: (texto(a.faixas) ?? "ambas") as FaixasAcerto,
      motivo: (texto(a.motivo) ?? "outro") as MotivoAcerto,
    })
    saida.set(f, lista)
  }
  for (const l of saida.values()) l.sort((a, b) => a.competencia.localeCompare(b.competencia))
  return saida
}
