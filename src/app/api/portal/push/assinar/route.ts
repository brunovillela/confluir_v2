import { type AssinaturaPush, registrarAssinaturaPushPortal } from "@/lib/db/push"

import { associadoDoPush } from "../sessao"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/**
 * Liga o Web Push deste navegador para o associado logado no portal (A52).
 * Corpo: `{ assinatura }` — o `PushSubscription.toJSON()` do navegador.
 */
export async function POST(req: Request): Promise<Response> {
  const quem = await associadoDoPush(req)
  if (quem instanceof Response) return quem
  const assinatura = quem.corpo.assinatura as AssinaturaPush | undefined
  if (!assinatura || typeof assinatura !== "object") return Response.json({ erro: "Assinatura ausente." }, { status: 400 })
  const { erro, refazer } = await registrarAssinaturaPushPortal(quem.cpf, assinatura, req.headers.get("user-agent"))
  if (erro) return Response.json({ erro, refazer }, { status: 400 })
  return Response.json({ ok: true })
}
