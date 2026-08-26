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
