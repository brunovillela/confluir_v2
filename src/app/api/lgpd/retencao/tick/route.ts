import * as Sentry from "@sentry/nextjs"

import { tenantsDoLembrete } from "@/lib/db/pendencias-lembrete"
import { rodarRetencao } from "@/lib/lgpd/retencao-motor"
import { createServiceClient } from "@/lib/supabase/admin"

export const runtime = "nodejs"
export const maxDuration = 300

/**
 * Tick mensal do MOTOR DE RETENÇÃO (seção 4 de docs/lgpd/retencao.md;
 * lib/lgpd/retencao-motor.ts). Para cada entidade, roda as regras do
 * catálogo: a regra que a entidade ligou em Institucional › LGPD elimina de
 * fato; as demais só SIMULAM e deixam no livro o que sairia. `?tenant=<id>`
 * roda uma entidade só; `?simular=1` força simulação em todas as regras.
 *
 * Service client com o tenant explícito em cada filtro (é rotina de várias
 * entidades). Protegido por CRON_SECRET (header x-cron-secret ou Bearer).
 * Agendado em vercel.json no dia 2 de cada mês, 08:00 UTC (05:00 BRT).
 */
async function handler(req: Request): Promise<Response> {
  const secret = process.env.CRON_SECRET
  const enviado = req.headers.get("x-cron-secret") ?? req.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? ""
  if (!secret || enviado !== secret) return new Response("Não autorizado", { status: 401 })

  const url = new URL(req.url)
  const soTenant = url.searchParams.get("tenant")
  const soSimular = url.searchParams.get("simular") === "1"
  const client = createServiceClient()
  const tenants = (await tenantsDoLembrete()).filter((t) => !soTenant || t.id === soTenant)
  const resultado: Record<string, unknown> = {}
  for (const t of tenants) {
    try {
      const regras = await rodarRetencao({ client, tenantId: t.id, origem: "cron", permitirReal: !soSimular })
      resultado[t.slug ?? t.id] = regras.map((r) => ({
        codigo: r.codigo,
        modo: r.modo,
        linhas: r.linhas,
        arquivos: r.arquivos,
        bloqueadas: r.bloqueadas,
        ...(r.erro ? { erro: r.erro } : {}),
      }))
      for (const r of regras.filter((x) => x.erro)) {
        Sentry.captureMessage(`Retenção ${r.codigo} (${r.modo}) falhou: ${r.erro}`, {
          level: "error",
          tags: { area: "lgpd-retencao", tenant: t.slug ?? t.id },
        })
      }
    } catch (e) {
      resultado[t.slug ?? t.id] = { erro: (e as Error).message }
      Sentry.captureMessage(`Retenção: entidade não rodou (${(e as Error).message})`, {
        level: "error",
        tags: { area: "lgpd-retencao", tenant: t.slug ?? t.id },
      })
    }
  }
  return Response.json({ tenants: resultado })
}

export const GET = handler
export const POST = handler
