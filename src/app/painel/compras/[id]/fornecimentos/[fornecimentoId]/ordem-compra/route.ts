import { requireSessaoPainel } from "@/lib/auth"
import { buscarProcesso } from "@/lib/db/compras"
import { compraNoEscopo, escopoComprasDoUsuario } from "@/lib/db/compras-acesso"
import { dadosOrdemCompra, nomeArquivoOrdemCompra, renderizarPdfOrdemCompra } from "@/lib/db/ordem-compra"
import { podeAcessar } from "@/lib/permissoes"

export const runtime = "nodejs"

/**
 * PDF da ordem de compra de um fornecimento — para baixar e mandar ao
 * fornecedor. Mesma regra de acesso da página do processo.
 */
export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string; fornecimentoId: string }> }
) {
  const sessao = await requireSessaoPainel()
  const { id, fornecimentoId } = await params
  const uuid = /^[0-9a-f-]{36}$/i
  if (!uuid.test(id) || !uuid.test(fornecimentoId)) return new Response("Não encontrada", { status: 404 })
  if (
    !podeAcessar(sessao.permissoes, "aquisicoes_compras", [
      "aquisicoes_compras_edicao",
      "aquisicoes_avaliacoes",
      "aquisicoes_recebimentos",
    ])
  ) {
    return new Response("Sem acesso a Aquisição.", { status: 403 })
  }
  const processo = await buscarProcesso(id)
  if (!processo) return new Response("Processo não encontrado", { status: 404 })
  if (!podeAcessar(sessao.permissoes, "aquisicoes_comprador")) {
    const escopo = await escopoComprasDoUsuario(sessao.usuario.id)
    if (!compraNoEscopo(escopo, { departamentoId: processo.departamento_id, solicitanteId: processo.solicitante_id })) {
      return new Response("Sem acesso a este processo.", { status: 403 })
    }
  }
  const dados = await dadosOrdemCompra(id, fornecimentoId)
  if (!dados) return new Response("Fornecimento não encontrado neste processo.", { status: 404 })
  const pdf = await renderizarPdfOrdemCompra(dados)
  const baixar = new URL(req.url).searchParams.get("baixar") === "1"
  return new Response(new Uint8Array(pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `${baixar ? "attachment" : "inline"}; filename="${nomeArquivoOrdemCompra(dados)}"`,
      "Cache-Control": "no-store",
    },
  })
}
