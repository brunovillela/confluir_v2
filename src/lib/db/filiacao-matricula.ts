import "server-only"

import { createAdminClient } from "@/lib/supabase/admin"
import { tenantAtual } from "@/lib/tenant"

/**
 * Numeração da matrícula sindical — é da ENTIDADE, sequencial. O sistema
 * antigo numerava sozinho; o Confluir deixava cadastros novos sem número.
 * Módulo sem dependências de outras telas: a importação por fonte (fontes.ts)
 * usa, e fontes.ts é importado pela tela de pendências.
 */

/** Matrícula sindical: só dígitos, sem zeros à esquerda; "0" e vazio → null. */
export function normalizarMatricula(valor: string | null | undefined): string | null {
  const digitos = (valor ?? "").replace(/\D/g, "").replace(/^0+/, "")
  return digitos ? digitos : null
}

/**
 * As `qtd` menores matrículas sindicais livres (17/11/2026): a numeração é
 * sequencial, então um número vago (de um cadastro unido, por exemplo) é
 * ocupado antes de abrir um novo no fim. Cadastro excluído não segura número.
 * Calculado no banco numa consulta (filiacao_matriculas_livres, 18/11/2026).
 */
export async function matriculasLivres(qtd: number): Promise<number[]> {
  const { data, error } = await (await createAdminClient()).rpc("filiacao_matriculas_livres", {
    p_emp: await tenantAtual(),
    p_qtd: Math.max(1, qtd),
  })
  if (error) throw new Error(`Falha ao ler matrículas: ${error.message}`)
  return ((data ?? []) as number[]).map(Number)
}

/**
 * Dá a menor matrícula sindical livre a um cadastro sem matrícula, no banco e
 * com trava por entidade: cadastros simultâneos nunca levam o mesmo número.
 * Cadastro que já tem matrícula fica com ela (devolvida). null = não achou.
 */
export async function atribuirMenorMatricula(filiacaoId: string): Promise<string | null> {
  const { data, error } = await (await createAdminClient()).rpc("filiacao_atribuir_matricula", {
    p_emp: await tenantAtual(),
    p_id: filiacaoId,
  })
  if (error) {
    console.error("[matrícula sindical] falha ao atribuir:", error.message)
    return null
  }
  return (data as string | null) ?? null
}

/** A próxima matrícula sindical: a menor livre. */
export async function proximaMatriculaSindical(): Promise<number> {
  return (await matriculasLivres(1))[0]
}

/** Todas as matrículas em uso por cadastros não excluídos (normalizadas). */
export async function matriculasEmUso(): Promise<Set<string>> {
  const admin = await createAdminClient()
  const emp = await tenantAtual()
  const usadas = new Set<string>()
  for (let de = 0; ; de += 1000) {
    const { data, error } = await admin
      .from("filiacoes")
      .select("matricula_sindical")
      .eq("emp_proprietaria_id", emp)
      .not("filiacao_excluida", "is", true)
      .not("matricula_sindical", "is", null)
      .order("id", { ascending: true })
      .range(de, de + 999)
    if (error) throw new Error(`Falha ao ler matrículas: ${error.message}`)
    for (const r of data ?? []) {
      const m = normalizarMatricula(r.matricula_sindical as string | null)
      if (m) usadas.add(m)
    }
    if (!data || data.length < 1000) break
  }
  return usadas
}

export type MatriculaAnterior = {
  matricula: string
  substituida_por: string | null
  ate: string
  motivo: string | null
}

/**
 * Matrículas sindicais que o cadastro já teve (a mais recente primeiro),
 * gravadas pelo gatilho de filiacoes a cada troca (18/11/2026).
 */
export async function matriculasAnterioresDoFiliado(filiacaoId: string): Promise<MatriculaAnterior[]> {
  const admin = await createAdminClient()
  const { data, error } = await admin
    .from("filiacao_matriculas_anteriores")
    .select("matricula, substituida_por, ate, motivo")
    .eq("emp_proprietaria_id", await tenantAtual())
    .eq("filiacao_id", filiacaoId)
    .order("ate", { ascending: false })
    .limit(20)
  if (error) return []
  return (data ?? []) as MatriculaAnterior[]
}
