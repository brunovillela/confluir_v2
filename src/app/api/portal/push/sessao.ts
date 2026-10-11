import "server-only"

import { getSessaoPortal } from "@/lib/auth"
import { getVisualizacaoPortal } from "@/lib/visualizacao-filiado"

/**
 * Quem liga e desliga o celular do portal (A52): só o próprio associado, com
 * a sessão do portal. Na visualização pela gestão ("Ver como filiado") nada
 * grava — o aparelho seria o do atendente, não o do associado.
 *
 * Devolve o CPF da sessão e o corpo JSON já lido, ou a resposta de erro
 * pronta para o route handler devolver.
 */
export async function associadoDoPush(req: Request): Promise<{ cpf: string; corpo: Record<string, unknown> } | Response> {
  // Só o próprio site chama estas rotas: um fetch vindo de outra origem não
  // liga nem desliga nada, mesmo que o navegador mande os cookies.
  const site = req.headers.get("sec-fetch-site")
  if (site && site !== "same-origin") return Response.json({ erro: "Origem não permitida." }, { status: 403 })
  if (!(req.headers.get("content-type") ?? "").includes("application/json")) {
    return Response.json({ erro: "Corpo inválido." }, { status: 415 })
  }

  const vis = await getVisualizacaoPortal()
  if (vis?.preview) {
    return Response.json({ erro: "Na visualização pela gestão, só o próprio associado liga o celular." }, { status: 403 })
  }
  const sessao = await getSessaoPortal()
  if (!sessao) return Response.json({ erro: "Sua sessão expirou — entre de novo no portal." }, { status: 401 })

  let corpo: unknown
  try {
    corpo = await req.json()
  } catch {
    return Response.json({ erro: "Corpo inválido." }, { status: 400 })
  }
  if (!corpo || typeof corpo !== "object") return Response.json({ erro: "Corpo inválido." }, { status: 400 })
  return { cpf: sessao.filiado.cpf, corpo: corpo as Record<string, unknown> }
}
