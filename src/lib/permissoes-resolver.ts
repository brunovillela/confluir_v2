import { type SupabaseClient } from "@supabase/supabase-js"

import { CHAVES_PERMISSAO } from "@/lib/permissoes-catalogo"
import { type Permissoes } from "@/lib/permissoes"

/**
 * Resolução das permissões EFETIVAS (RBAC) — camada de COMPOSIÇÃO por cima da
 * ACL plana. Recebe a linha `permissoes` (overrides individuais) e SOBREPÕE as
 * chaves concedidas pelos perfis do usuário, devolvendo o MESMO formato
 * `Permissoes` que sidebar, proxy, requirePermissao e podeAcessar consomem.
 *
 * Recebe o `client` por parâmetro DE PROPÓSITO: o proxy (middleware) usa o
 * service client, enquanto getSessaoPainel usa o client do tenant. Por isso
 * este arquivo NÃO importa `createAdminClient`/node — fica seguro no bundle do
 * middleware. Schema em supabase/perfis-acesso.sql.
 *
 * Aditivo (grant-only) e à prova de esquema-ausente: sem perfis, tabelas
 * inexistentes ou erro, devolve a base intacta (fail-safe, nunca concede a
 * mais).
 */

/** PGRST205/42P01 = tabela ausente; PGRST204/42703 = coluna ausente. */
function esquemaAusente(erro: { code?: string } | null): boolean {
  return ["PGRST205", "42P01", "PGRST204", "42703"].includes(erro?.code ?? "")
}

/** Alçada "sem teto" (perfis de comando): grande o bastante para todo valor. */
const ALCADA_SEM_TETO = Number.MAX_SAFE_INTEGER

function comoNumero(v: unknown): number {
  const n = typeof v === "string" ? Number(v) : Number(v ?? 0)
  return Number.isFinite(n) ? n : 0
}

type PerfilEmbutido = {
  ativo: boolean | null
  concede_tudo: boolean | null
  alcada_aprovacao: number | string | null
  perfil_permissoes: { chave: string }[] | null
}

export async function resolverPermissoes(
  client: SupabaseClient,
  usuarioId: string,
  base: Permissoes
): Promise<Permissoes> {
  // Uma consulta com recursos embutidos (usuario_perfis → perfis → chaves).
  const { data, error } = await client
    .from("usuario_perfis")
    .select(
      "perfis(ativo, concede_tudo, alcada_aprovacao, perfil_permissoes(chave))"
    )
    .eq("usuario_id", usuarioId)

  // Sem perfis, esquema ausente ou qualquer erro: cai para a base (fail-safe,
  // nunca concede a mais do que o usuário já tinha).
  if (error) {
    if (!esquemaAusente(error)) {
      console.error("resolverPermissoes:", error.message)
    }
    return base
  }
  if (!data || data.length === 0) return base

  const efetiva: Permissoes = { ...base }
  let concedeTudo = false
  let semTeto = false
  let maiorAlcada = comoNumero(base.alcada_aprovacao)

  for (const linha of data) {
    const bruto = (linha as { perfis: PerfilEmbutido | PerfilEmbutido[] | null })
      .perfis
    const perfil = Array.isArray(bruto) ? bruto[0] : bruto
    if (!perfil || perfil.ativo === false) continue

    if (perfil.concede_tudo === true) concedeTudo = true
    for (const pp of perfil.perfil_permissoes ?? []) {
      if (pp?.chave) efetiva[pp.chave] = true
    }
    if (
      perfil.alcada_aprovacao === null ||
      perfil.alcada_aprovacao === undefined
    ) {
      semTeto = true
    } else {
      maiorAlcada = Math.max(maiorAlcada, comoNumero(perfil.alcada_aprovacao))
    }
  }

  if (concedeTudo) for (const c of CHAVES_PERMISSAO) efetiva[c] = true
  efetiva.alcada_aprovacao = semTeto ? ALCADA_SEM_TETO : maiorAlcada
  return efetiva
}
