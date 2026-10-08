import { requireSessaoPainel } from "@/lib/auth"
import { buscarProcesso } from "@/lib/db/compras"
import { compraNoEscopo, escopoComprasDoUsuario } from "@/lib/db/compras-acesso"
import { podeAcessar } from "@/lib/permissoes"
import { respostaPdfExtratoOrdem } from "@/lib/pdf/extrato-ordem-resposta"

export const runtime = "nodejs"

/**
 * Extrato da ordem a partir do processo de compra: o mesmo PDF do Financeiro,
 * aberto para quem vê o processo (mesma regra da página — comprador em
 * qualquer um, os demais nos seus departamentos). Só ordens do processo.
 */
export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string; ordemId: string }> }
) {
  const sessao = await requireSessaoPainel()
  const { id, ordemId } = await params
  if (!/^[0-9a-f-]{36}$/i.test(id) || !/^[0-9a-f-]{36}$/i.test(ordemId)) {
    return new Response("Não encontrada", { status: 404 })
  }
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
    if (
      !compraNoEscopo(escopo, {
        departamentoId: processo.departamento_id,
        solicitanteId: processo.solicitante_id,
      })
    ) {
      return new Response("Sem acesso a este processo.", { status: 403 })
    }
  }
  const ordensDoProcesso = new Set([
    ...(processo.fornecimentos ?? []).flatMap((f) => [
      ...f.pagamentos.map((o) => o.id),
      ...(f.ordem ? [f.ordem.id] : []),
    ]),
    ...processo.ordensAvulsas.map((o) => o.id),
  ])
  if (!ordensDoProcesso.has(ordemId)) {
    return new Response("Ordem não pertence a este processo.", { status: 404 })
  }
  return respostaPdfExtratoOrdem(ordemId, req)
}
