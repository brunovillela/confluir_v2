import { contextoDoTenant } from "@/lib/db/comunicacao-mensagens"
import { avisarNotasAReceber } from "@/lib/db/compras-marketplace"
import { lembrarPendencias, tenantsDoLembrete } from "@/lib/db/pendencias-lembrete"
import { lembretesDoPortal, type ResultadoLembretesDoPortal } from "@/lib/db/portal-lembretes"
import { createServiceClient } from "@/lib/supabase/admin"

export const runtime = "nodejs"
// Os lembretes do portal mandam e-mail um a um: o mesmo teto do tick das cobranças.
export const maxDuration = 300

/**
 * Tick diário do LEMBRETE DE PENDÊNCIAS (onda 2, U2). Protegido por
 * `CRON_SECRET` (header `x-cron-secret` ou `Authorization: Bearer`), como os
 * outros ticks.
 *
 * Para cada tenant, cada pessoa com algo esperando por ela recebe um resumo
 * (sino, e-mail e Telegram conforme preferência), uma vez por dia, com o que
 * está parado há mais de 7 dias em destaque (lib/db/pendencias-lembrete.ts).
 *
 * Depois, os LEMBRETES DO PORTAL do associado (Pix vencendo, último dia de
 * votação e resultado, véspera de evento, carta da oposição, prazo de
 * atendimento — lib/db/portal-lembretes.ts), também tenant por tenant. As
 * pendências rodam antes, para todos os tenants: os lembretes do portal não
 * atrasam o que já existia. Uma falha num tenant ou numa etapa não impede o
 * resto; tudo é idempotente, e rodar de novo no dia não repete aviso.
 *
 * Por fim, as NOTAS A RECEBER das compras em marketplace: 7 dias depois da
 * compra sem a nota do vendedor, quem comprou recebe um e-mail — uma vez por
 * compra (lib/db/compras-marketplace.ts).
 *
 * `?tenant=<uuid>` roda um tenant só (disparo manual e testes na demo);
 * `?etapa=pendencias`, `?etapa=portal` ou `?etapa=notas` roda só uma das partes.
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
  const tenants = (await tenantsDoLembrete()).filter((t) => !unico || t.id === unico)

  const resultados: { tenant: string; pessoas: number; lembretes: number; erro?: string }[] = []
  if (etapa !== "portal" && etapa !== "notas") {
    for (const t of tenants) {
      try {
        resultados.push({ tenant: t.id, ...(await lembrarPendencias(t.id)) })
      } catch (e) {
        resultados.push({ tenant: t.id, pessoas: 0, lembretes: 0, erro: e instanceof Error ? e.message : String(e) })
      }
    }
  }

  const portal: ({ tenant: string } & ResultadoLembretesDoPortal)[] = []
  if (etapa !== "pendencias" && etapa !== "notas") {
    const svc = createServiceClient()
    for (const t of tenants) {
      try {
        const contexto = await contextoDoTenant(t.id, svc)
        portal.push({ tenant: t.id, ...(await lembretesDoPortal({ client: svc, tenantId: t.id, contexto })) })
      } catch (e) {
        portal.push({ tenant: t.id, erros: [`contexto: ${e instanceof Error ? e.message : String(e)}`] })
      }
    }
    for (const p of portal) {
      if (p.erros.length) console.error(`[pendencias/tick] lembretes do portal (${p.tenant}):`, p.erros.join(" · "))
    }
  }

  const notas: { tenant: string; avisados: number; erros: string[] }[] = []
  if (!etapa || etapa === "notas") {
    const svc = createServiceClient()
    for (const t of tenants) {
      try {
        const contexto = await contextoDoTenant(t.id, svc)
        notas.push({ tenant: t.id, ...(await avisarNotasAReceber(svc, t.id, contexto)) })
      } catch (e) {
        notas.push({ tenant: t.id, avisados: 0, erros: [e instanceof Error ? e.message : String(e)] })
      }
    }
    for (const n of notas) {
      if (n.erros.length) console.error(`[pendencias/tick] notas a receber (${n.tenant}):`, n.erros.join(" · "))
    }
  }

  return Response.json({ verificados: tenants.length, processados: resultados, portal, notas })
}

export const GET = handler
export const POST = handler
