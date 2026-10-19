import { requireSessaoPainel } from "@/lib/auth"
import { ordemNoCartaoDoUsuario } from "@/lib/db/cartao-faturas"
import { podeAcessar } from "@/lib/permissoes"
import { respostaPdfExtratoOrdem } from "@/lib/pdf/extrato-ordem-resposta"

export const runtime = "nodejs"

/**
 * Extrato de uma compra (ou da ordem da fatura) a partir de Meu cartão: o
 * mesmo PDF do Financeiro, aberto para o responsável do cartão — além de quem
 * já tem permissão do Financeiro.
 */
export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const sessao = await requireSessaoPainel()
  const { id } = await params
  if (!/^[0-9a-f-]{36}$/i.test(id)) return new Response("Não encontrada", { status: 404 })
  const permitido =
    podeAcessar(sessao.permissoes, "financeiro_pagamento", ["financeiro_leitura", "aquisicoes_avaliacoes"]) ||
    (await ordemNoCartaoDoUsuario(String(sessao.usuario.id), id))
  if (!permitido) return new Response("Sem acesso a esta despesa.", { status: 403 })
  return respostaPdfExtratoOrdem(id, req)
}
