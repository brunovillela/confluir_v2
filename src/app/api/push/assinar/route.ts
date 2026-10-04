import { getSessaoPainel } from "@/lib/auth"
import { registrarAssinaturaPush, removerAssinaturaPush, type AssinaturaPush } from "@/lib/db/push"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/** Liga (POST) ou desliga (DELETE) o Web Push deste navegador para a conta logada. */
export async function POST(req: Request): Promise<Response> {
  const sessao = await getSessaoPainel()
  if (!sessao) return Response.json({ erro: "Sem sessão." }, { status: 401 })
  let corpo: { assinatura?: AssinaturaPush } = {}
  try {
    corpo = (await req.json()) as { assinatura?: AssinaturaPush }
  } catch {
    return Response.json({ erro: "Corpo inválido." }, { status: 400 })
  }
  if (!corpo.assinatura) return Response.json({ erro: "Assinatura ausente." }, { status: 400 })
  const { erro } = await registrarAssinaturaPush(sessao.usuario.id as string, corpo.assinatura, req.headers.get("user-agent"))
  if (erro) return Response.json({ erro }, { status: 400 })
  return Response.json({ ok: true })
}

export async function DELETE(req: Request): Promise<Response> {
  const sessao = await getSessaoPainel()
  if (!sessao) return Response.json({ erro: "Sem sessão." }, { status: 401 })
  let corpo: { endpoint?: string } = {}
  try {
    corpo = (await req.json()) as { endpoint?: string }
  } catch {
    return Response.json({ erro: "Corpo inválido." }, { status: 400 })
  }
  if (!corpo.endpoint) return Response.json({ erro: "Endpoint ausente." }, { status: 400 })
  await removerAssinaturaPush(sessao.usuario.id as string, corpo.endpoint)
  return Response.json({ ok: true })
}
