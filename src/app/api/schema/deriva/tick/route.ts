import * as Sentry from "@sentry/nextjs"

import { createServiceClient } from "@/lib/supabase/admin"
import registrada from "../../../../../../supabase/schema-impressao.json"

export const runtime = "nodejs"
export const maxDuration = 60

/**
 * Tick semanal de DERIVA DO SCHEMA (Onda A3, docs/plano-documentacao.md):
 * compara a impressão digital do banco (`schema_impressao()`) com a registrada
 * no repositório (`supabase/schema-impressao.json`, embutida no build). Se
 * diferirem, alguém mudou o schema fora de `supabase/migrations/` (dashboard,
 * SQL Editor) e o aviso vai para o Sentry. Operação de plataforma (o schema é
 * um só para todos os tenants), por isso o service client.
 *
 * Protegido por `CRON_SECRET` (header `x-cron-secret` ou `Authorization:
 * Bearer`). Agendado em vercel.json às segundas, 10:00 UTC (07:00 BRT).
 */
async function handler(req: Request): Promise<Response> {
  const secret = process.env.CRON_SECRET
  const enviado =
    req.headers.get("x-cron-secret") ??
    req.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ??
    ""
  if (!secret || enviado !== secret) {
    return new Response("Não autorizado", { status: 401 })
  }

  const { data, error } = await createServiceClient().rpc("schema_impressao")
  if (error || !data) {
    Sentry.captureMessage(`Deriva do schema: não foi possível ler a impressão (${error?.message ?? "vazia"})`, {
      level: "error",
      tags: { area: "schema-deriva" },
    })
    return Response.json({ ok: false, erro: error?.message ?? "impressão vazia" }, { status: 503 })
  }

  const esperado = registrada as Record<string, string>
  const atual = data as Record<string, string>
  const novos = Object.keys(atual).filter((k) => !(k in esperado)).sort()
  const removidos = Object.keys(esperado).filter((k) => !(k in atual)).sort()
  const alterados = Object.keys(atual).filter((k) => k in esperado && esperado[k] !== atual[k]).sort()
  const total = novos.length + removidos.length + alterados.length

  if (total > 0) {
    Sentry.captureMessage(`Deriva do schema: ${total} objeto(s) diferem de supabase/schema-impressao.json`, {
      level: "warning",
      tags: { area: "schema-deriva" },
      // Só nomes de objetos (sem dados); limitados para caber no evento.
      extra: { novos: novos.slice(0, 100), removidos: removidos.slice(0, 100), alterados: alterados.slice(0, 100) },
    })
  }

  return Response.json({ ok: total === 0, objetos: Object.keys(atual).length, novos, removidos, alterados })
}

export const GET = handler
export const POST = handler
