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
 * A próxima matrícula sindical livre: a maior em uso + 1. Lê o número (coluna
 * inteira) e, por segurança, o texto das matrículas recentes — cadastros
 * antigos têm só o texto.
 */
export async function proximaMatriculaSindical(): Promise<number> {
  const admin = await createAdminClient()
  const emp = await tenantAtual()
  const [{ data: porNumero }, { data: recentes }] = await Promise.all([
    admin
      .from("filiacoes")
      .select("matricula_sindical_numero")
      .eq("emp_proprietaria_id", emp)
      .not("matricula_sindical_numero", "is", null)
      .order("matricula_sindical_numero", { ascending: false })
      .limit(1),
    admin
      .from("filiacoes")
      .select("matricula_sindical")
      .eq("emp_proprietaria_id", emp)
      .not("matricula_sindical", "is", null)
      .order("created_at", { ascending: false })
      .limit(200),
  ])
  const candidatos = [
    Number(porNumero?.[0]?.matricula_sindical_numero ?? 0),
    // Mais de 7 dígitos é CPF ou lixo digitado no campo, não matrícula.
    ...(recentes ?? [])
      .map((r) => normalizarMatricula(r.matricula_sindical as string | null))
      .filter((m): m is string => Boolean(m) && m!.length <= 7)
      .map(Number),
  ]
  return Math.max(0, ...candidatos) + 1
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
