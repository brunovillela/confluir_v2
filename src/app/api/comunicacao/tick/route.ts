import {
  configsAtivasParaTick,
  estaNaHoraDeGerar,
  gerarResumo,
} from "@/lib/db/comunicacao"
import { executarAniversarios, executarMalasDiretas } from "@/lib/db/comunicacao-mensagens"

export const runtime = "nodejs"
// O parabéns de um dia pode ter dezenas de e-mails em lotes.
export const maxDuration = 300

/**
 * Tick diário da Comunicação. Protegido por `CRON_SECRET` (header
 * `x-cron-secret` ou `Authorization: Bearer`). Faz duas coisas:
 *
 * 1. Resumo de notícias — percorre os tenants com config ativa e, para os que
 *    estão na hora, gera o resumo.
 * 2. Aniversariantes — nos tenants com o parabéns automático ligado, prepara a
 *    mensagem do dia e envia os e-mails (lib/db/comunicacao-mensagens.ts).
 * 3. Mala direta — as agendadas para hoje começam a sair; as que ficaram pela
 *    metade continuam. Para perto do limite da função; o resto segue amanhã
 *    ou pelo botão da tela.
 *
 * `?tenant=<uuid>` roda só um tenant (disparo manual e testes na demo).
 * O vercel.json chama esta rota às 12:00 UTC (9h em Brasília).
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
  const agora = new Date()
  const configs = (await configsAtivasParaTick()).filter((c) => !unico || c.tenantId === unico)
  const resultados: { tenant: string; id?: string; erro?: string }[] = []
  for (const c of configs) {
    if (!estaNaHoraDeGerar(c, agora)) continue
    const r = await gerarResumo(c.tenantId, "agendador")
    resultados.push({ tenant: c.tenantId, id: r.id, erro: r.erro })
  }

  const aniversarios = await executarAniversarios(unico)
  // Folga de 40 s antes do maxDuration para gravar a situação do último lote.
  const malasDiretas = await executarMalasDiretas(inicio + 260_000, unico)
  return Response.json({ verificados: configs.length, gerados: resultados, aniversarios, malasDiretas })
}

export const GET = handler
export const POST = handler
