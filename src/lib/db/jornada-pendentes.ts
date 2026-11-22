import "server-only"

import type { SupabaseClient } from "@supabase/supabase-js"

import { lerEmLotes } from "@/lib/db/comum"

/**
 * Funcionários ativos (vínculo com a entidade sem desligamento, cadastro não
 * excluído) que não têm jornada vinculada. Sem jornada, o uso fora do
 * expediente não é registrado, a faixa de fora do horário não aparece e o
 * recálculo pelas marcações cai na carga diária (22/11/2026).
 *
 * Recebe o cliente porque a caixa de entrada também conta no lembrete diário,
 * sem requisição. null = não deu para contar (tabela ausente ou erro).
 */
export async function funcionariosSemJornada(client: SupabaseClient, emp: string): Promise<{ total: number } | null> {
  try {
    const vinculos = await lerEmLotes<{ trabalhador_id: string | null }>((de, ate) =>
      client
        .from("vinculos_trabalhistas")
        .select("id, trabalhador_id")
        .eq("empregador_id", emp)
        .is("contrato_demissao", null)
        .order("id")
        .range(de, ate)
    )
    const ativos = new Set(vinculos.map((v) => v.trabalhador_id).filter((x): x is string => Boolean(x)))
    if (ativos.size === 0) return { total: 0 }
    const [excluidos, comJornada] = await Promise.all([
      lerEmLotes<{ id: string }>((de, ate) =>
        client.from("usuarios").select("id").in("id", [...ativos]).eq("deletado", true).order("id").range(de, ate)
      ),
      lerEmLotes<{ funcionario_id: string }>((de, ate) =>
        client.from("pessoal_jornada_funcionarios").select("id, funcionario_id").eq("emp_proprietaria_id", emp).order("id").range(de, ate)
      ),
    ])
    for (const u of excluidos) ativos.delete(String(u.id))
    for (const j of comJornada) ativos.delete(String(j.funcionario_id))
    return { total: ativos.size }
  } catch {
    return null
  }
}
