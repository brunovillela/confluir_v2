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
 * Lê só a coluna inteira, em páginas paralelas (o PostgREST corta em 1.000).
 */
export async function matriculasLivres(qtd: number): Promise<number[]> {
  const admin = await createAdminClient()
  const emp = await tenantAtual()
  const base = () =>
    admin
      .from("filiacoes")
      .select("matricula_sindical_numero", { count: "exact" })
      .eq("emp_proprietaria_id", emp)
      .not("filiacao_excluida", "is", true)
      .not("matricula_sindical_numero", "is", null)
  const { count, error } = await base().limit(1)
  if (error) throw new Error(`Falha ao ler matrículas: ${error.message}`)
  const total = count ?? 0
  const paginas = await Promise.all(
    Array.from({ length: Math.ceil(total / 1000) }, (_, i) =>
      base()
        .order("matricula_sindical_numero", { ascending: true })
        .order("id", { ascending: true })
        .range(i * 1000, i * 1000 + 999)
    )
  )
  const usados = new Set<number>()
  for (const p of paginas) {
    if (p.error) throw new Error(`Falha ao ler matrículas: ${p.error.message}`)
    for (const r of p.data ?? []) {
      const n = Number(r.matricula_sindical_numero)
      // Mais de 7 dígitos é CPF ou lixo digitado no campo, não matrícula.
      if (n > 0 && n < 10_000_000) usados.add(n)
    }
  }
  const livres: number[] = []
  for (let n = 1; livres.length < qtd; n++) if (!usados.has(n)) livres.push(n)
  return livres
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
