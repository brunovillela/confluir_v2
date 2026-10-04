import "server-only"

import { headers } from "next/headers"
import { cache } from "react"

import { EMP_PROPRIETARIA_ID } from "@/lib/env"
import { conferirTenant } from "@/lib/tenant-assinatura"

/**
 * Tenant (organização) da requisição atual.
 *
 * O proxy resolve o tenant a partir do host (subdomínio) e o injeta no header
 * `x-tenant-id`; aqui a gente lê esse header. Fallback: o tenant do `.env`
 * (EMP_PROPRIETARIA_ID) — enquanto existe UM único tenant, os dois coincidem,
 * então trocar `EMP_PROPRIETARIA_ID` por `await tenantAtual()` no código é
 * NEUTRO de comportamento. Quando o roteamento por subdomínio entrar (fase 2),
 * o header passa a variar por organização e o mesmo código já fica correto.
 *
 * `cache` (React) memoiza por requisição — uma leitura de header por request.
 *
 * Fora de um contexto de requisição (scripts, etc.) `headers()` lança; nesse
 * caso caímos no tenant do `.env`.
 */
export const tenantAtual = cache(async (): Promise<string> => {
  try {
    const h = await headers()
    const id = h.get("x-tenant-id")
    if (!id) return EMP_PROPRIETARIA_ID
    // Só vale assinado pelo proxy (lib/tenant-assinatura.ts): um cabeçalho
    // vindo de fora, numa rota que o proxy não cobre, não troca o tenant.
    if (await conferirTenant(id, h.get("x-tenant-assinatura"))) return id
    // Sem a chave configurada (dev sem SUPABASE_JWT_SECRET) não há como
    // assinar: mantém o comportamento anterior.
    if (!process.env.SUPABASE_JWT_SECRET) return id
    return EMP_PROPRIETARIA_ID
  } catch {
    return EMP_PROPRIETARIA_ID
  }
})

export { subdominioDoHost } from "@/lib/tenant-host"
