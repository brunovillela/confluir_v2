"use server"

import { revalidatePath } from "next/cache"
import { redirect } from "next/navigation"

import { requirePermissao } from "@/lib/auth"
import type { EstadoComApontamentos } from "@/lib/auditoria-confirmacao"
import {
  FORMA_PAGA_NO_ATO,
  FORMAS_PAGAMENTO_COMPRAS,
  type FormaPagamentoCompras,
} from "@/lib/compras-constantes"
import { buscarProcesso } from "@/lib/db/compras"
import { compraNoEscopo, escopoComprasDoUsuario } from "@/lib/db/compras-acesso"
import { compradoresPossiveis } from "@/lib/db/compras-compradores"
import { edicaoDaCompra, editarCompra, type DadosEdicaoCompra } from "@/lib/db/compras-edicao"
import { lerDetalhePagamento } from "@/lib/db/compras-pagamento-form"
import { lerConfirmacao } from "@/lib/db/ordens-verificacao"
import { podeAcessar } from "@/lib/permissoes"
import { FORMAS_PAGAMENTO_RPA } from "@/lib/rpa-calculo"
import { parseValorBR } from "@/lib/valores"

function texto(fd: FormData, campo: string): string {
  return String(fd.get(campo) ?? "").trim()
}

function dataISO(valor: string): string | null {
  return /^\d{4}-\d{2}-\d{2}$/.test(valor) ? valor : null
}

/** Edita a compra enquanto nenhuma ordem dela foi autorizada (lib/db/compras-edicao). */
export async function editarCompraAction(
  _prev: EstadoComApontamentos,
  fd: FormData
): Promise<EstadoComApontamentos> {
  const sessao = await requirePermissao("aquisicoes_compras_edicao", [
    "aquisicoes_compra_direta",
    "aquisicoes_comprador",
  ])
  const processoId = texto(fd, "processo_id")
  const processo = processoId ? await buscarProcesso(processoId) : null
  if (!processo) return { erro: "Processo não encontrado." }
  const comprador = podeAcessar(sessao.permissoes, "aquisicoes_comprador")
  const escopo = await escopoComprasDoUsuario(sessao.usuario.id)
  if (
    !comprador &&
    !compraNoEscopo(escopo, { departamentoId: processo.departamento_id, solicitanteId: processo.solicitante_id })
  ) {
    return { erro: "Esta compra não é de um departamento pelo qual você compra." }
  }
  const ed = await edicaoDaCompra(processo)
  if (!ed.pode) return { erro: ed.motivo ?? "Esta compra não pode mais ser editada." }

  const produto = texto(fd, "produto")
  if (!produto) return { erro: "Descreva o produto ou serviço.", campo: "produto" }
  const tipo = texto(fd, "e_produto")
  if (tipo !== "bem" && tipo !== "servico") {
    return { erro: "Informe o tipo: bem/produto ou prestação de serviço.", campo: "e_produto" }
  }
  if (ed.porRpa && tipo !== "servico") {
    return { erro: "Compra paga por RPA é prestação de serviço.", campo: "e_produto" }
  }
  const departamentoId = texto(fd, "departamento_id")
  if (!departamentoId) return { erro: "Informe o departamento solicitante.", campo: "departamento_id" }
  if (!escopo.todos && !comprador && departamentoId !== processo.departamento_id && !escopo.departamentoIds.includes(departamentoId)) {
    return { erro: "Você não compra por esse departamento.", campo: "departamento_id" }
  }
  const centroCustoId = texto(fd, "centro_custo_id")
  if (!centroCustoId) return { erro: "Informe o centro de custo da despesa.", campo: "centro_custo_id" }
  const comProjeto = texto(fd, "com_projeto") === "on"
  const projetoId = texto(fd, "projeto_id")
  if (comProjeto && !projetoId) return { erro: "Escolha o projeto da compra.", campo: "projeto_id" }
  const entregaNoAto = texto(fd, "entrega_no_ato") === "on"
  const dataLimite = entregaNoAto ? null : dataISO(texto(fd, "data_limite"))
  const localEntrega = entregaNoAto ? null : texto(fd, "local_entrega") || null
  if (!entregaNoAto) {
    if (!dataLimite) return { erro: "Informe o limite para receber.", campo: "data_limite" }
    if (!localEntrega) return { erro: "Informe o local para receber.", campo: "local_entrega" }
  }

  const dados: DadosEdicaoCompra = {
    produto,
    e_produto: tipo === "bem",
    observacao: texto(fd, "observacao") || null,
    departamento_id: departamentoId,
    centro_custo_id: centroCustoId,
    projeto_id: comProjeto ? projetoId : null,
    entrega_no_ato: entregaNoAto,
    data_limite: dataLimite,
    local_entrega: localEntrega,
  }

  if (ed.completa) {
    const f = (processo.fornecimentos ?? [])[0]
    const fornecedorId = ed.fornecedorEditavel ? texto(fd, "fornecedor_id") : (f?.fornecedor_id ?? "")
    if (!fornecedorId) return { erro: "Busque e selecione o fornecedor.", campo: "fornecedor_id" }
    const valor = ed.porRpa || ed.caixaDebitado ? (f?.valor ?? 0) : parseValorBR(texto(fd, "valor"))
    if (valor === null || valor <= 0) return { erro: "Informe o valor da compra.", campo: "valor" }
    const dataCompra = dataISO(texto(fd, "data_compra"))
    if (!dataCompra) return { erro: "Informe a data da compra.", campo: "data_compra" }

    const compradorId = texto(fd, "comprador_id") || null
    if (compradorId && compradorId !== f?.comprador_id && compradorId !== String(sessao.usuario.id)) {
      const possiveis = await compradoresPossiveis(String(sessao.usuario.id))
      if (!possiveis.some((c) => c.id === compradorId)) {
        return { erro: "Escolha o comprador entre os funcionários e diretores ativos.", campo: "comprador_id" }
      }
    }

    let pagamento: NonNullable<DadosEdicaoCompra["compra"]>["pagamento"] = null
    let formaFinal = texto(fd, "forma_atual")
    if (texto(fd, "alterar_pagamento") === "on" && !ed.caixaDebitado) {
      const formas = (ed.porRpa ? FORMAS_PAGAMENTO_RPA : FORMAS_PAGAMENTO_COMPRAS) as readonly string[]
      const forma = texto(fd, "forma_pagamento")
      if (!formas.includes(forma)) return { erro: "Escolha a forma de pagamento.", campo: "forma_pagamento" }
      // Dinheiro sai do caixa no lançamento: mudar para ele é um lançamento novo.
      if (forma === FORMA_PAGA_NO_ATO && !ed.porRpa) {
        return {
          erro: "Para pagar em dinheiro, cancele esta compra e lance de novo — o valor sai do caixa no lançamento.",
          campo: "forma_pagamento",
        }
      }
      const { detalhe, boleto, erro } = await lerDetalhePagamento(
        fd,
        forma as FormaPagamentoCompras,
        fornecedorId,
        ed.porRpa ? 0 : valor
      )
      if (erro || !detalhe) return { erro: erro ?? "Pagamento inválido." }
      pagamento = { forma, detalhe, boleto }
      formaFinal = forma
    }
    const vencimento =
      formaFinal === FORMA_PAGA_NO_ATO && !ed.porRpa ? dataCompra : dataISO(texto(fd, "vencimento"))
    if (!vencimento) return { erro: "Informe a data de pagamento (Pagar em).", campo: "vencimento" }
    const nota = fd.get("nota_fiscal")

    dados.compra = {
      fornecedor_id: fornecedorId,
      valor,
      data_compra: dataCompra,
      comprador_id: compradorId,
      vencimento,
      pagamento,
      nota: !ed.porRpa && nota instanceof File && nota.size > 0 ? nota : null,
    }
  }

  const { erro, apontamentos } = await editarCompra(processoId, dados, String(sessao.usuario.id), lerConfirmacao(fd))
  if (apontamentos) return { apontamentos }
  if (erro) return { erro }
  revalidatePath("/painel/compras")
  revalidatePath(`/painel/compras/${processoId}`)
  if (ed.ordemId) revalidatePath(`/painel/financeiro/ordens/${ed.ordemId}`)
  redirect(`/painel/compras/${processoId}?editada=1`)
}
