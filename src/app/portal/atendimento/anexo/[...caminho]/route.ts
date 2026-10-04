import { getVisualizacaoPortal } from "@/lib/visualizacao-filiado"
import { atendimentoDoFiliado, urlAnexoAtendimento } from "@/lib/db/portal-atendimentos"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/**
 * Anexo de uma solicitação do PRÓPRIO filiado (ou da gestão em visualização):
 * o caminho carrega o id da solicitação, e ela precisa ser do CPF da sessão.
 */
export async function GET(_req: Request, { params }: { params: Promise<{ caminho: string[] }> }): Promise<Response> {
  const vis = await getVisualizacaoPortal()
  if (!vis) return new Response("Sem acesso", { status: 403 })
  const { caminho } = await params
  const path = caminho.join("/")
  const m = /^atendimentos\/([0-9a-f-]{36})\/[0-9a-f-]{36}\.[a-z0-9]{1,8}$/.exec(path)
  if (!m) return new Response("Não encontrado", { status: 404 })
  const proprio = await atendimentoDoFiliado(m[1], vis.filiado.cpf)
  if (!proprio || !proprio.mensagens.some((x) => x.anexoCaminho === path)) return new Response("Não encontrado", { status: 404 })
  const url = await urlAnexoAtendimento(path)
  if (!url) return new Response("Não encontrado", { status: 404 })
  return Response.redirect(url, 302)
}
