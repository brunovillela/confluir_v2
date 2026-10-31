import { contextoDoTenant } from "@/lib/db/comunicacao-mensagens"
import { enviarRelatoriosRpaDoFechamento } from "@/lib/db/rpa-contabilidade"
import { enviarResumoVencimentos, tenantsDoResumo } from "@/lib/db/vencimentos"
import { createServiceClient } from "@/lib/supabase/admin"

export const runtime = "nodejs"
export const maxDuration = 120

/**
 * Tick diário do RESUMO DE VENCIMENTOS (onda 2, A6/D4). Protegido por
 * `CRON_SECRET` (header `x-cron-secret` ou `Authorization: Bearer`).
 *
 * Para cada tenant, cada pessoa recebe (sino, e-mail e Telegram conforme
 * preferência) o que está vencendo ou vencido nas áreas em que tem permissão:
 * contratos, ajudas, acordos, CNH, seguro, locação, ASO, férias, treinamentos,
 * faturas de viagem, guias das retenções do RPA, ordens, mandatos, assentos,
 * convênios e CIPA (lib/db/vencimentos.ts). Uma vez por dia; sem vencimento,
 * nada sai.
 *
 * Depois, o RELATÓRIO DE RPAs À CONTABILIDADE: o fechamento do mês feito em
 * dia anterior e ainda não enviado vai por e-mail, com a planilha
 * (lib/db/rpa-contabilidade.ts).
 *
 * `?tenant=<uuid>` roda um tenant só (disparo manual e testes na demo);
 * `?etapa=resumo` ou `?etapa=relatorio-rpa` roda só uma das partes.
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

  const params = new URL(req.url).searchParams
  const unico = params.get("tenant")
  const etapa = params.get("etapa")
  const tenants = (await tenantsDoResumo()).filter((t) => !unico || t === unico)
  const resultados: { tenant: string; grupos: number; pessoas: number; resumos: number; erro?: string }[] = []
  for (const t of etapa === "relatorio-rpa" ? [] : tenants) {
    try {
      resultados.push({ tenant: t, ...(await enviarResumoVencimentos(t)) })
    } catch (e) {
      resultados.push({ tenant: t, grupos: 0, pessoas: 0, resumos: 0, erro: e instanceof Error ? e.message : String(e) })
    }
  }
  const svc = createServiceClient()
  const relatoriosRpa: { tenant: string; enviados: number; erros: string[] }[] = []
  for (const t of etapa === "resumo" ? [] : tenants) {
    try {
      const contexto = await contextoDoTenant(t, svc)
      relatoriosRpa.push({ tenant: t, ...(await enviarRelatoriosRpaDoFechamento(svc, t, contexto)) })
    } catch (e) {
      relatoriosRpa.push({ tenant: t, enviados: 0, erros: [e instanceof Error ? e.message : String(e)] })
    }
  }
  for (const r of relatoriosRpa) {
    if (r.erros.length) console.error(`[vencimentos/tick] relatório de RPAs (${r.tenant}):`, r.erros.join(" · "))
  }
  return Response.json({ verificados: tenants.length, processados: resultados, relatoriosRpa })
}

export const GET = handler
export const POST = handler
