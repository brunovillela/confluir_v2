import "server-only"

import { createHmac, randomUUID } from "node:crypto"

import {
  createClient as createSupabaseClient,
  type SupabaseClient,
} from "@supabase/supabase-js"

import { SUPABASE_ANON_KEY, SUPABASE_URL } from "@/lib/env"
import { usuarioIdAtual } from "@/lib/sessao-atual"
import { reduzirParaArmazenar } from "@/lib/reducao-arquivo"
import { conferirArquivo } from "@/lib/uploads"
import { escrevePeloTenant } from "@/lib/supabase/tabelas-tenant"
import { tenantAtual } from "@/lib/tenant"

/**
 * Client com SERVICE ROLE — IGNORA o RLS. Usar SOMENTE em operações de
 * PLATAFORMA / cross-tenant, onde não há um tenant único: proxy (resolução do
 * tenant pelo host), auth pré-tenant, o controlador /admin (lib/plataforma.ts
 * e lib/db/plataforma.ts), crons `/api/**\/tick`, Telegram, API pública e
 * webhooks. A lista exata é a allowlist `PODEM_USAR_SERVICE_ROLE` do
 * eslint.config.mjs. NUNCA para dados de um tenant sem filtro — para isso é o
 * `createAdminClient()` abaixo. Ver docs/arquitetura/adr/0003.
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

/**
 * Storage com conferência de upload (onda 1, S11): todo `.upload()` passa
 * por `conferirArquivo()` — identifica o tipo pela assinatura do arquivo,
 * recusa conteúdo ativo (HTML, SVG, executável) e grava o contentType
 * DETECTADO, não o que o navegador declarou. Um ponto só cobre os 46 uploads.
 * `update()` recebe o mesmo tratamento; os demais métodos passam direto.
 *
 * Redução (26/11/2026): depois da conferência, foto e PDF sem assinatura são
 * reduzidos com a menor perda possível antes de ir ao bucket
 * (lib/reducao-arquivo.ts). Documento com assinatura digital, PDF gerado pelo
 * sistema e caminhos de assinados vão intactos.
 */
function storageConferido(storage: SupabaseClient["storage"]): SupabaseClient["storage"] {
  return new Proxy(storage, {
    get(alvo, prop) {
      if (prop !== "from") {
        const v = Reflect.get(alvo, prop)
        return typeof v === "function" ? v.bind(alvo) : v
      }
      return (bucket: string) => {
        const api = alvo.from(bucket)
        return new Proxy(api, {
          get(bAlvo, bProp) {
            if (bProp === "upload" || bProp === "update") {
              const original = Reflect.get(bAlvo, bProp) as (...args: unknown[]) => Promise<unknown>
              return async (caminho: string, corpo: unknown, opcoes?: Record<string, unknown>) => {
                const r = await conferirArquivo(corpo, {
                  declarado: typeof opcoes?.contentType === "string" ? opcoes.contentType : null,
                })
                if (!r.ok) return { data: null, error: { message: r.erro, name: "ArquivoRecusado" } }
                const finais = r.contentType ? { ...(opcoes ?? {}), contentType: r.contentType } : opcoes
                const reducao = await reduzirParaArmazenar(corpo, { tipo: r.contentType, caminho })
                return original.call(bAlvo, caminho, reducao.corpo, finais)
              }
            }
            const v = Reflect.get(bAlvo, bProp)
            return typeof v === "function" ? v.bind(bAlvo) : v
          },
        })
      }
    },
  })
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
  // Quem age nesta requisição vai no cabeçalho `x-confluir-usuario`, que o
  // trigger de auditoria lê em `request.headers` (supabase/auditoria.sql).
  // Vale para os dois clientes — tenant e service.
  const usuarioId = await usuarioIdAtual()
  const carimbo: Record<string, string> = usuarioId ? { "x-confluir-usuario": usuarioId } : {}
  // JWT NOVO A CADA CHAMADA (17/11/2026): antes o token era gerado uma vez,
  // com 60 s de vida, e uma operação longa com o mesmo cliente (importar
  // milhares de aptos: ler os existentes em lotes e gravar de 500 em 500)
  // passava disso — o banco recusava as últimas gravações com "JWT expired".
  // Gerar o token por requisição custa um HMAC; a vida curta continua valendo.
  const tenant = createSupabaseClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
    global: {
      headers: carimbo,
      fetch: (entrada, init) => {
        const cabecalhos = new Headers(init?.headers ?? (entrada instanceof Request ? entrada.headers : undefined))
        cabecalhos.set("Authorization", `Bearer ${jwtDoTenant(tenantId)}`)
        return fetch(entrada, { ...init, headers: cabecalhos })
      },
    },
  })
  const service = createSupabaseClient(
    SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false }, global: { headers: carimbo } }
  )

  return new Proxy(tenant, {
    get(alvo, prop, receiver) {
      if (prop === "storage") return storageConferido(service.storage)
      if (typeof prop === "string" && VIA_SERVICE.has(prop)) {
        // `.rpc` é um MÉTODO: sem bind ele rodaria com `this` = o proxy (o
        // cliente do tenant) e a função SQL seria chamada como
        // `authenticated` — "permission denied" nas funções revogadas.
        const v = Reflect.get(service, prop, service)
        return typeof v === "function" ? v.bind(service) : v
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
