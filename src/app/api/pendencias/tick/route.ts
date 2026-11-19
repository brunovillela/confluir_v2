import { contextoDoTenant } from "@/lib/db/comunicacao-mensagens"
import { avisarNotasAReceber } from "@/lib/db/compras-marketplace"
import { lembrarCotacoesAtrasadas } from "@/lib/db/compras-cotacao-lembrete"
import { lembrarRecebimentosAtrasados } from "@/lib/db/compras-recebimento-lembrete"
import { lembrarOrdensDevolvidas } from "@/lib/db/compras-ordens-devolvidas"
import { lembrarPendencias, tenantsDoLembrete } from "@/lib/db/pendencias-lembrete"
import { lembretesDoPortal, type ResultadoLembretesDoPortal } from "@/lib/db/portal-lembretes"
import { lembrarAssinaturasRpa } from "@/lib/db/rpa-lembretes"
import { lembrarPrazosDeTarefas } from "@/lib/db/tarefas-lembrete"
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
 * E os LEMBRETES DA ASSINATURA DO RPA: link pendente há 3 dias sem assinatura
 * leva um lembrete ao prestador (até 2); esgotados, quem emitiu é avisado
 * (lib/db/rpa-lembretes.ts).
 *
 * E as COTAÇÕES FORA DO PRAZO: solicitação Via Aquisição que passou do prazo
 * da entidade sem a cotação começar avisa os compradores e o coordenador do
 * departamento, uma vez por solicitação (lib/db/compras-cotacao-lembrete.ts).
 *
 * E os RECEBIMENTOS ATRASADOS: fornecimento que passou da entrega esperada sem
 * recebimento registrado avisa quem comprou, quem pediu e quem recebe — uma
 * vez por semana de atraso (lib/db/compras-recebimento-lembrete.ts).
 *
 * `?tenant=<uuid>` roda um tenant só (disparo manual e testes na demo);
 * `?etapa=pendencias`, `?etapa=portal`, `?etapa=notas`, `?etapa=rpa`, `?etapa=cotacao` ou
 * `?etapa=recebimentos` ou `?etapa=devolvidas` roda só uma das partes.
 *
 * E as ORDENS DE COMPRA DEVOLVIDAS há uma semana ou mais: quem lançou recebe um
 * lembrete por semana (lib/db/compras-ordens-devolvidas.ts).
 *
 * E os PRAZOS DAS TAREFAS: na véspera, o responsável; no atraso (até 7 dias),
 * o responsável e quem pediu — uma vez por tarefa e prazo
 * (lib/db/tarefas-lembrete.ts). `?etapa=tarefas` roda só esta parte.
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
  if (!etapa || etapa === "pendencias") {
    for (const t of tenants) {
      try {
        resultados.push({ tenant: t.id, ...(await lembrarPendencias(t.id)) })
      } catch (e) {
        resultados.push({ tenant: t.id, pessoas: 0, lembretes: 0, erro: e instanceof Error ? e.message : String(e) })
      }
    }
  }

  const portal: ({ tenant: string } & ResultadoLembretesDoPortal)[] = []
  if (!etapa || etapa === "portal") {
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

  const rpa: { tenant: string; lembretes: number; esgotados: number; erros: string[] }[] = []
  if (!etapa || etapa === "rpa") {
    const svc = createServiceClient()
    for (const t of tenants) {
      try {
        const contexto = await contextoDoTenant(t.id, svc)
        rpa.push({ tenant: t.id, ...(await lembrarAssinaturasRpa(svc, t.id, contexto)) })
      } catch (e) {
        rpa.push({ tenant: t.id, lembretes: 0, esgotados: 0, erros: [e instanceof Error ? e.message : String(e)] })
      }
    }
    for (const r of rpa) {
      if (r.erros.length) console.error(`[pendencias/tick] lembretes do RPA (${r.tenant}):`, r.erros.join(" · "))
    }
  }

  const cotacao: { tenant: string; atrasadas: number; avisos: number; erros: string[] }[] = []
  if (!etapa || etapa === "cotacao") {
    const svc = createServiceClient()
    for (const t of tenants) {
      try {
        const contexto = await contextoDoTenant(t.id, svc)
        cotacao.push({ tenant: t.id, ...(await lembrarCotacoesAtrasadas(svc, t.id, contexto)) })
      } catch (e) {
        cotacao.push({ tenant: t.id, atrasadas: 0, avisos: 0, erros: [e instanceof Error ? e.message : String(e)] })
      }
    }
    for (const c of cotacao) {
      if (c.erros.length) console.error(`[pendencias/tick] cotações fora do prazo (${c.tenant}):`, c.erros.join(" · "))
    }
  }

  const recebimentos: { tenant: string; atrasados: number; avisos: number; erros: string[] }[] = []
  if (!etapa || etapa === "recebimentos") {
    const svc = createServiceClient()
    for (const t of tenants) {
      try {
        const contexto = await contextoDoTenant(t.id, svc)
        recebimentos.push({ tenant: t.id, ...(await lembrarRecebimentosAtrasados(svc, t.id, contexto)) })
      } catch (e) {
        recebimentos.push({ tenant: t.id, atrasados: 0, avisos: 0, erros: [e instanceof Error ? e.message : String(e)] })
      }
    }
    for (const r of recebimentos) {
      if (r.erros.length) console.error(`[pendencias/tick] recebimentos atrasados (${r.tenant}):`, r.erros.join(" · "))
    }
  }

  const devolvidas: { tenant: string; devolvidas: number; avisos: number; erros: string[] }[] = []
  if (!etapa || etapa === "devolvidas") {
    const svc = createServiceClient()
    for (const t of tenants) {
      try {
        const contexto = await contextoDoTenant(t.id, svc)
        devolvidas.push({ tenant: t.id, ...(await lembrarOrdensDevolvidas(svc, t.id, contexto)) })
      } catch (e) {
        devolvidas.push({ tenant: t.id, devolvidas: 0, avisos: 0, erros: [e instanceof Error ? e.message : String(e)] })
      }
    }
    for (const d of devolvidas) {
      if (d.erros.length) console.error(`[pendencias/tick] ordens devolvidas (${d.tenant}):`, d.erros.join(" · "))
    }
  }

  const tarefas: { tenant: string; vespera: number; atrasadas: number; avisos: number; erros: string[] }[] = []
  if (!etapa || etapa === "tarefas") {
    const svc = createServiceClient()
    for (const t of tenants) {
      try {
        const contexto = await contextoDoTenant(t.id, svc)
        tarefas.push({ tenant: t.id, ...(await lembrarPrazosDeTarefas(svc, t.id, contexto)) })
      } catch (e) {
        tarefas.push({ tenant: t.id, vespera: 0, atrasadas: 0, avisos: 0, erros: [e instanceof Error ? e.message : String(e)] })
      }
    }
    for (const r of tarefas) {
      if (r.erros.length) console.error(`[pendencias/tick] prazos das tarefas (${r.tenant}):`, r.erros.join(" · "))
    }
  }

  return Response.json({ verificados: tenants.length, processados: resultados, portal, notas, rpa, cotacao, recebimentos, devolvidas, tarefas })
}

export const GET = handler
export const POST = handler
