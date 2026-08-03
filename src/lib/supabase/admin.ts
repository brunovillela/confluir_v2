import "server-only"

import { createHmac, randomUUID } from "node:crypto"

import {
  createClient as createSupabaseClient,
  type SupabaseClient,
} from "@supabase/supabase-js"

import { SUPABASE_ANON_KEY, SUPABASE_URL } from "@/lib/env"
import { escrevePeloTenant } from "@/lib/supabase/tabelas-tenant"
import { tenantAtual } from "@/lib/tenant"

/**
 * Client com SERVICE ROLE — IGNORA o RLS. Usar SOMENTE em operações de
 * PLATAFORMA / cross-tenant, onde não há um tenant único: proxy (resolução do
 * tenant pelo host), auth pré-tenant e o controlador /admin (lib/plataforma.ts
 * e lib/db/plataforma.ts). NUNCA para dados de um tenant — para isso é o
 * `createAdminClient()` abaixo. Ver [[confluir-multitenant]].
 */
export function createServiceClient(): SupabaseClient {
  return createSupabaseClient(
    SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

/** JWT curto (HS256) com role=authenticated e a claim `tenant_id`. */
function jwtDoTenant(tenantId: string): string {
  const b64 = (o: object) => Buffer.from(JSON.stringify(o)).toString("base64url")
  const agora = Math.floor(Date.now() / 1000)
  const cabecalho = b64({ alg: "HS256", typ: "JWT" })
  const corpo = b64({
    role: "authenticated",
    aud: "authenticated",
    sub: randomUUID(),
    tenant_id: tenantId,
    iat: agora,
    exp: agora + 60,
  })
  const assinatura = createHmac("sha256", process.env.SUPABASE_JWT_SECRET!)
    .update(`${cabecalho}.${corpo}`)
    .digest("base64url")
  return `${cabecalho}.${corpo}.${assinatura}`
}

const VIA_SERVICE = new Set([
  "storage",
  "auth",
  "functions",
  "realtime",
  "rpc",
])

/** Verbos de ESCRITA num query builder — roteados pelo service role. */
const ESCRITA = new Set(["insert", "update", "upsert", "delete"])

/**
 * Client de DADOS do tenant ATUAL — HÍBRIDO por operação:
 *
 * - LEITURA (`.from(t).select(...)`): roda sob um JWT `authenticated` com a
 *   claim `tenant_id`, então RESPEITA o RLS. A isolação entre tenants é
 *   garantida NO BANCO, mesmo que a query esqueça o filtro
 *   `emp_proprietaria_id` (ver supabase/rls-tenant-isolation.sql). Esse é o
 *   backstop que fecha os vazamentos de leitura por id (IDOR).
 * - ESCRITA (`.insert/.update/.upsert/.delete`):
     escrevePeloTenant(tabela) → roda pelo cliente do TENANT (RLS gateia:
 *     WITH CHECK barra gravar fora do tenant; USING barra tocar linha alheia).
 *     Cobre dois grupos:
 *     · tenant-owned (TABELAS_TENANT, tem emp): trigger set_emp_from_jwt
 *       preenche o emp — ver supabase/rls-escrita-tenant.sql.
 *     · global escopada por PAI (TABELAS_TENANT_POR_PAI: notificacoes, aso,
 *       dados_bancarios, junções…): o WITH CHECK valida que o FK aponta p/ um
 *       pai do tenant — ver supabase/rls-tenant-por-pai.sql.
 *   · Demais globais sem política (centros_de_custo compartilhado, etc.): roda
 *     pelo SERVICE ROLE, escopada pela APLICAÇÃO, como antes.
 * - `.storage`/`.auth`/`.functions`/`.rpc`: service role (arquivos, convites).
 *
 * É ASSÍNCRONO porque o tenant vem de `tenantAtual()` (header da requisição).
 */
export async function createAdminClient(): Promise<SupabaseClient> {
  const tenantId = await tenantAtual()
  const tenant = createSupabaseClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
    global: { headers: { Authorization: `Bearer ${jwtDoTenant(tenantId)}` } },
  })
  const service = createServiceClient()

  return new Proxy(tenant, {
    get(alvo, prop, receiver) {
      if (typeof prop === "string" && VIA_SERVICE.has(prop)) {
        return Reflect.get(service, prop, service)
      }
      if (prop === "from") {
        // Leitura sempre pelo tenant (RLS). Escrita: tenant-owned → tenant
        // (RLS), global → service.
        return (tabela: string) => {
          const leitura = tenant.from(tabela)
          if (escrevePeloTenant(tabela)) return leitura
          const escrita = service.from(tabela)
          return new Proxy(leitura, {
            get(bAlvo, bProp) {
              if (typeof bProp === "string" && ESCRITA.has(bProp)) {
                const fn = Reflect.get(escrita, bProp) as (
                  ...args: unknown[]
                ) => unknown
                return (...args: unknown[]) => fn.apply(escrita, args)
              }
              const v = Reflect.get(bAlvo, bProp)
              return typeof v === "function" ? v.bind(bAlvo) : v
            },
          })
        }
      }
      return Reflect.get(alvo, prop, receiver)
    },
  }) as SupabaseClient
}
