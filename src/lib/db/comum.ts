import "server-only"

import { createAdminClient } from "@/lib/supabase/admin"

/**
 * Helpers compartilhados pela camada de dados (src/lib/db). Antes cada módulo
 * carregava a própria cópia; as definições canônicas vivem aqui.
 */

/** PGRST205/42P01 = tabela ausente; PGRST204/42703 = coluna ausente. */
export function esquemaAusente(erro: { code?: string } | null): boolean {
  return ["PGRST205", "42P01", "PGRST204", "42703"].includes(erro?.code ?? "")
}

/**
 * Lê TODAS as linhas de uma consulta em lotes de 1.000 — o PostgREST corta
 * qualquer resposta em 1.000 linhas, mesmo com .range() maior. A consulta
 * precisa de ordem estável (termine em .order("id")) para os lotes não
 * pularem nem repetirem linhas.
 */
export async function lerEmLotes<T = Record<string, unknown>>(
  consulta: (de: number, ate: number) => PromiseLike<{
    data: unknown[] | null
    error: { message: string; code?: string } | null
  }>
): Promise<T[]> {
  const LOTE = 1000
  const linhas: T[] = []
  for (let de = 0; ; de += LOTE) {
    const { data, error } = await consulta(de, de + LOTE - 1)
    // Mantém o código do PostgREST para quem testa esquemaAusente(erro).
    if (error) throw Object.assign(new Error(error.message), { code: error.code })
    linhas.push(...((data ?? []) as T[]))
    if (!data || data.length < LOTE) break
  }
  return linhas
}

/** String com conteúdo (trim) ou null. */
export function texto(v: unknown): string | null {
  return typeof v === "string" && v.trim() !== "" ? v : null
}

/** Data de hoje no fuso de São Paulo (AAAA-MM-DD) — para colunas DATE. */
export function hojeSP(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
  }).format(new Date())
}

/**
 * Mapa id → nome de usuários. Prefere `nome_completo` caindo para
 * `nome_guerra`; passe `"guerra"` para inverter a preferência.
 */
export async function nomesDosUsuarios(
  ids: string[],
  preferir: "completo" | "guerra" = "completo"
): Promise<Map<string, string>> {
  const nomes = new Map<string, string>()
  const unicos = [...new Set(ids.filter(Boolean))]
  if (unicos.length === 0) return nomes
  const admin = await createAdminClient()
  const { data } = await admin
    .from("usuarios")
    .select("id, nome_completo, nome_guerra")
    .in("id", unicos)
  for (const u of data ?? []) {
    const candidatos =
      preferir === "guerra"
        ? [u.nome_guerra, u.nome_completo]
        : [u.nome_completo, u.nome_guerra]
    const nome = candidatos.find(
      (v): v is string => typeof v === "string" && v.trim() !== ""
    )
    if (nome) nomes.set(u.id as string, nome)
  }
  return nomes
}
