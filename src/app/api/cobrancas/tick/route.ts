import { contextoDoTenant } from "@/lib/db/comunicacao-mensagens"
import { competenciaAtual, gerarCobrancas, obterConfigCobranca } from "@/lib/db/cobrancas"
import { tenantsDoLembrete } from "@/lib/db/pendencias-lembrete"
import { createServiceClient } from "@/lib/supabase/admin"

export const runtime = "nodejs"
export const maxDuration = 300

/**
 * Tick mensal das COBRANÇAS DA CONTRIBUIÇÃO (onda 5, A3): no dia 1, gera a
 * cobrança Pix da competência para quem paga por Pix, em cada entidade com
 * geração automática ligada. Idempotente: rodar de novo não duplica.
 * `?tenant=<id>` roda uma entidade só; `?competencia=AAAA-MM` força o mês.
 * Protegido por CRON_SECRET (header x-cron-secret ou Bearer).
 */
async function handler(req: Request): Promise<Response> {
  const secret = process.env.CRON_SECRET
  const enviado = req.headers.get("x-cron-secret") ?? req.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? ""
  if (!secret || enviado !== secret) return new Response("Não autorizado", { status: 401 })

  const url = new URL(req.url)
  const soTenant = url.searchParams.get("tenant")
  const competencia = url.searchParams.get("competencia") ?? competenciaAtual()
  const svc = createServiceClient()
  const tenants = (await tenantsDoLembrete()).filter((t) => !soTenant || t.id === soTenant)
  const resultado: Record<string, unknown> = {}
  for (const t of tenants) {
    try {
      const config = await obterConfigCobranca({ client: svc, tenantId: t.id })
      if (!config.disponivel || !config.gerarAutomatico || !config.valorMensal) {
        resultado[t.id] = { pulado: !config.disponivel ? "sem tabela" : !config.gerarAutomatico ? "automático desligado" : "sem valor mensal" }
        continue
      }
      const contexto = await contextoDoTenant(t.id, svc)
      resultado[t.id] = await gerarCobrancas(competencia, { client: svc, tenantId: t.id, contexto })
    } catch (e) {
      resultado[t.id] = { erro: (e as Error).message }
    }
  }
  return Response.json({ competencia, tenants: resultado })
}

export const GET = handler
export const POST = handler
