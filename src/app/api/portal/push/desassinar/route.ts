import { removerAssinaturaPushPortal } from "@/lib/db/push"

import { associadoDoPush } from "../sessao"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/**
 * Desliga este aparelho para o associado logado (A52). Corpo: `{ endpoint }`.
 * Só apaga a assinatura do portal: a do painel, no mesmo navegador, continua.
 */
export async function POST(req: Request): Promise<Response> {
  const quem = await associadoDoPush(req)
  if (quem instanceof Response) return quem
  const endpoint = quem.corpo.endpoint
  if (typeof endpoint !== "string" || !endpoint) return Response.json({ erro: "Endpoint ausente." }, { status: 400 })
  const { erro } = await removerAssinaturaPushPortal(quem.cpf, endpoint)
  if (erro) return Response.json({ erro }, { status: 500 })
  return Response.json({ ok: true })
}
