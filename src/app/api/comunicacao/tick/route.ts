import {
  configsAtivasParaTick,
  estaNaHoraDeGerar,
  gerarResumo,
} from "@/lib/db/comunicacao"

export const runtime = "nodejs"

/**
 * Tick do agendador do Resumo de notícias. Protegido por `CRON_SECRET`
 * (header `x-cron-secret` ou `Authorization: Bearer`). Percorre TODOS os
 * tenants com config ativa e, para os que estão na hora, gera o resumo.
 *
 * Em dev (localhost) ninguém chama — o botão "Gerar agora" cobre os testes.
 * Na virada, ligar: Supabase pg_cron + pg_net POST nesta rota, OU vercel.json
 * `crons` (GET) nesta rota. Ambos passam o segredo.
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

  const agora = new Date()
  const configs = await configsAtivasParaTick()
  const resultados: { tenant: string; id?: string; erro?: string }[] = []
  for (const c of configs) {
    if (!estaNaHoraDeGerar(c, agora)) continue
    const r = await gerarResumo(c.tenantId, "agendador")
    resultados.push({ tenant: c.tenantId, id: r.id, erro: r.erro })
  }
  return Response.json({ verificados: configs.length, gerados: resultados })
}

export const GET = handler
export const POST = handler
