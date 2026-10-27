import { contextoDoTenant } from "@/lib/db/comunicacao-mensagens"
import { avisosAvaliacaoPendentes, type ResultadoAvisosAvaliacao } from "@/lib/db/oposicao"
import { createServiceClient } from "@/lib/supabase/admin"

export const runtime = "nodejs"
// Até 300 avisos por entidade a cada volta, cinco por vez.
export const maxDuration = 300

/**
 * Tick da FILA DE AVISOS DA OPOSIÇÃO (onda 2 da avaliação de 27/10/2026).
 * Protegido por `CRON_SECRET` (header `x-cron-secret` ou `Authorization:
 * Bearer`), como os outros ticks; o vercel.json chama a cada 15 minutos.
 *
 * A avaliação em lote e o encerramento das oposições sem carta gravam a
 * decisão na hora e marcam `aviso_avaliacao_pendente_em`; aqui os avisos saem
 * aos poucos (lib/db/oposicao.ts, `avisosAvaliacaoPendentes`), entidade por
 * entidade, só nas que têm fila. Milhares de decisões num clique não viram
 * milhares de e-mails no mesmo segundo.
 *
 * `?tenant=<uuid>` roda uma entidade só (disparo manual e testes na demo).
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
  const inicio = Date.now()
  const unico = new URL(req.url).searchParams.get("tenant")
  const svc = createServiceClient()

  // Só as entidades com aviso na fila (a coluna tem índice parcial).
  let q = svc.from("oposicao_opositor").select("emp_proprietaria_id").not("aviso_avaliacao_pendente_em", "is", null).limit(5000)
  if (unico) q = q.eq("emp_proprietaria_id", unico)
  const { data, error } = await q
  if (error) return Response.json({ erro: error.message }, { status: 500 })
  const tenants = [...new Set((data ?? []).map((r) => String(r.emp_proprietaria_id)))]

  const resultados: ({ tenant: string } & ResultadoAvisosAvaliacao)[] = []
  for (const tenantId of tenants) {
    // Folga de 40 s antes do maxDuration para a última leva terminar.
    const ate = inicio + 250_000
    if (Date.now() >= ate) break
    try {
      const contexto = await contextoDoTenant(tenantId, svc)
      resultados.push({ tenant: tenantId, ...(await avisosAvaliacaoPendentes({ client: svc, tenantId, contexto, ate })) })
    } catch (e) {
      resultados.push({
        tenant: tenantId,
        pendentes: 0,
        avisados: 0,
        porEmail: 0,
        falhas: 0,
        restantes: 0,
        erro: e instanceof Error ? e.message : String(e),
      })
    }
  }
  for (const r of resultados) {
    if (r.erro) console.error(`[oposicao/tick] fila de avisos (${r.tenant}):`, r.erro)
  }
  return Response.json({ entidades: tenants.length, resultados })
}

export const GET = handler
export const POST = handler
