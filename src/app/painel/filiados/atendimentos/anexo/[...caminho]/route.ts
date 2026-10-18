import { ENTRADA_ATENDIMENTOS } from "@/lib/atendimento-constantes"
import { getSessaoPainel } from "@/lib/auth"
import { assuntoDoAtendimento, podeVerAtendimento, urlAnexoAtendimento } from "@/lib/db/portal-atendimentos"
import { podeAcessar } from "@/lib/permissoes"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/** Anexo de uma solicitação do portal, para quem atende (link assinado de curta duração). */
export async function GET(_req: Request, { params }: { params: Promise<{ caminho: string[] }> }): Promise<Response> {
  const sessao = await getSessaoPainel()
  if (!sessao || !podeAcessar(sessao.permissoes, ENTRADA_ATENDIMENTOS[0], [...ENTRADA_ATENDIMENTOS[1]])) {
    return new Response("Sem acesso", { status: 403 })
  }
  const { caminho } = await params
  const path = caminho.join("/")
  if (!/^atendimentos\/[0-9a-f-]{36}\/[0-9a-f-]{36}\.[a-z0-9]{1,8}$/.test(path)) return new Response("Não encontrado", { status: 404 })
  // O anexo segue a solicitação: o de saúde, só para a equipe de saúde (R2).
  const assunto = await assuntoDoAtendimento(caminho[1])
  if (assunto === null || !podeVerAtendimento(sessao.permissoes, assunto)) return new Response("Não encontrado", { status: 404 })
  const url = await urlAnexoAtendimento(path)
  if (!url) return new Response("Não encontrado", { status: 404 })
  return Response.redirect(url, 302)
}
