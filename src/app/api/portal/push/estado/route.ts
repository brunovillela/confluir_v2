import { aparelhoLigadoNoPortal } from "@/lib/db/push"

import { associadoDoPush } from "../sessao"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/**
 * Este aparelho está ligado para o associado logado? (A52) Corpo:
 * `{ endpoint }`. O navegador sozinho não responde: o service worker é um só
 * para painel e portal, então a assinatura que ele tem pode ser a do painel
 * ou a de outra pessoa que usou o portal neste aparelho. POST, e não GET, para
 * o endpoint (que funciona como senha do aparelho) não ir para a URL e os logs.
 */
export async function POST(req: Request): Promise<Response> {
  const quem = await associadoDoPush(req)
  if (quem instanceof Response) return quem
  const endpoint = quem.corpo.endpoint
  if (typeof endpoint !== "string" || !endpoint) return Response.json({ ativo: false })
  return Response.json({ ativo: await aparelhoLigadoNoPortal(quem.cpf, endpoint) })
}
