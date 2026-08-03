import "server-only"

import { headers } from "next/headers"

import { APP_DOMAIN, SITE_URL } from "@/lib/env"

/**
 * Origens (protocolo + host) por tenant. Em multi-tenant, cada organização é
 * servida em `<slug>.<APP_DOMAIN>`, então os links de e-mail (convite,
 * redefinição de senha) precisam apontar para o subdomínio certo — nunca para
 * uma URL fixa. Ver [[confluir-multitenant]].
 */

function protocoloPara(dominio: string): string {
  return dominio.includes("localhost") || /^\d+\.\d+\.\d+\.\d+/.test(dominio)
    ? "http"
    : "https"
}

/**
 * Origem da requisição atual (o subdomínio do tenant em produção). Usada nos
 * convites disparados de dentro de um tenant. Fora de contexto de requisição,
 * cai em SITE_URL.
 */
export async function origemAtual(): Promise<string> {
  try {
    const host = (await headers()).get("host")
    if (host) return `${protocoloPara(host)}://${host}`
  } catch {
    // sem contexto de requisição
  }
  return SITE_URL
}

/** Origem de um tenant a partir do slug: `<slug>.<APP_DOMAIN>`. */
export function origemDoTenant(slug: string): string {
  return `${protocoloPara(APP_DOMAIN)}://${slug}.${APP_DOMAIN}`
}
