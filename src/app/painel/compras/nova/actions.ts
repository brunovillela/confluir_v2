"use server"

import { revalidatePath } from "next/cache"
import { redirect } from "next/navigation"

import { FORMAS_PAGAMENTO_RPA } from "@/lib/rpa-calculo"

import { requirePermissao } from "@/lib/auth"
import type { EstadoComApontamentos } from "@/lib/auditoria-confirmacao"
import {
  FORMAS_PAGAMENTO_COMPRAS,
  type FormaPagamentoCompras,
} from "@/lib/compras-constantes"
import {
  criarCompraDireta,
  criarSolicitacao,
  subirComprovanteCompras,
} from "@/lib/db/compras"
import { escopoComprasDoUsuario } from "@/lib/db/compras-acesso"
import { compradoresPossiveis } from "@/lib/db/compras-compradores"
import { impedimentoDoPrestador } from "@/lib/db/compras-rpa"
import { lerDetalhePagamento } from "@/lib/db/compras-pagamento-form"
import { FORMA_PAGA_NO_ATO } from "@/lib/compras-constantes"
import { lerConfirmacao } from "@/lib/db/ordens-verificacao"
import { createAdminClient } from "@/lib/supabase/admin"
import { podeAcessar } from "@/lib/permissoes"
import { parseValorBR } from "@/lib/valores"

function texto(formData: FormData, campo: string): string {
  return String(formData.get(campo) ?? "").trim()
}

function dataISO(valor: string): string | null {
  return /^\d{4}-\d{2}-\d{2}$/.test(valor) ? valor : null
}

export async function criarCompra(
  _prev: EstadoComApontamentos,
  formData: FormData
): Promise<EstadoComApontamentos> {
  // Registrar compra é escrita: via Aquisição exige "editar"; aquisição direta,
  // a permissão própria. E só pelos departamentos que a pessoa alcança.
  const sessao = await requirePermissao("aquisicoes_compras_edicao", ["aquisicoes_compra_direta"])

  const direta = texto(formData, "modalidade") === "direta"
  if (direta && !podeAcessar(sessao.permissoes, "aquisicoes_compra_direta")) {
    return { erro: "Você não tem permissão para registrar aquisição direta — use a solicitação via Aquisição." }
  }
  if (!direta && !podeAcessar(sessao.permissoes, "aquisicoes_compras_edicao")) {
    return { erro: "Você só tem permissão para registrar aquisição direta." }
  }

  // Toda compra é auditada: só a observação é facultativa (e limite/local
  // para receber, quando a entrega é no ato da compra).
  const produto = texto(formData, "produto")
  if (!produto) return { erro: "Descreva o produto ou serviço.", campo: "produto" }
  const observacao = texto(formData, "observacao") || null
  const tipo = texto(formData, "e_produto")
  if (tipo !== "bem" && tipo !== "servico") {
    return { erro: "Informe o tipo: bem/produto ou prestação de serviço.", campo: "e_produto" }
  }
  const departamentoId = texto(formData, "departamento_id")
  if (!departamentoId) return { erro: "Informe o departamento solicitante.", campo: "departamento_id" }
  const escopo = await escopoComprasDoUsuario(sessao.usuario.id)
  if (!escopo.todos && !escopo.departamentoIds.includes(departamentoId)) {
    return { erro: "Você não compra por esse departamento.", campo: "departamento_id" }
  }
  const centroCustoId = texto(formData, "centro_custo_id")
  if (!centroCustoId) {
    return { erro: "Informe o centro de custo da despesa.", campo: "centro_custo_id" }
  }
  const comProjeto = texto(formData, "com_projeto") === "on"
  const projetoId = texto(formData, "projeto_id")
  if (comProjeto && !projetoId) return { erro: "Escolha o projeto da compra.", campo: "projeto_id" }

  const entregaNoAto = texto(formData, "entrega_no_ato") === "on"
  const dataLimite = entregaNoAto ? null : dataISO(texto(formData, "data_limite"))
  const localEntrega = entregaNoAto ? null : texto(formData, "local_entrega") || null
  if (!entregaNoAto) {
    if (!dataLimite) return { erro: "Informe o limite para receber.", campo: "data_limite" }
    if (!localEntrega) return { erro: "Informe o local para receber.", campo: "local_entrega" }
  }

  const base = {
    produto,
    e_produto: tipo === "bem",
    observacao,
    departamento_id: departamentoId,
    centro_custo_id: centroCustoId,
    projeto_id: comProjeto ? projetoId : null,
    data_limite: dataLimite,
    local_entrega: localEntrega,
    entrega_no_ato: entregaNoAto,
    solicitante_id: sessao.usuario.id,
  }

  if (!direta) {
    const { id, erro } = await criarSolicitacao(base)
    if (erro || !id) return { erro: erro ?? "Falha ao registrar." }
    revalidatePath("/painel/compras")
    redirect(`/painel/compras/${id}?criado=1`)
  }

  // Aquisição direta: quem comprou pode ser outra pessoa (funcionário ou
  // diretor ativo); quem lança fica como solicitante.
  const compradorEscolhido = texto(formData, "comprador_id") || String(sessao.usuario.id)
  if (compradorEscolhido !== String(sessao.usuario.id)) {
    const possiveis = await compradoresPossiveis(String(sessao.usuario.id))
    if (!possiveis.some((c) => c.id === compradorEscolhido)) {
      return { erro: "Escolha o comprador entre os funcionários e diretores ativos.", campo: "comprador_id" }
    }
  }

  // Aquisição direta: fornecedor, valor, data, pagamento e nota.
  const fornecedorId = texto(formData, "fornecedor_id")
  if (!fornecedorId) return { erro: "Busque e selecione o fornecedor.", campo: "fornecedor_id" }
  const valor = parseValorBR(texto(formData, "valor"))
  if (valor === null || valor <= 0) return { erro: "Informe o valor da compra.", campo: "valor" }
  const dataCompra = dataISO(texto(formData, "data_compra"))
  if (!dataCompra) return { erro: "Informe a data da compra.", campo: "data_compra" }

  // Serviço de autônomo pago por RPA: o RPA substitui SÓ o documento
  // fiscal. Forma, "Pagar em" e o "para onde" ficam na compra, como em
  // qualquer outra; a ordem nasce "Aguardando documento fiscal" e segue para
  // autorização quando o prestador assina o recibo.
  if (tipo === "servico" && texto(formData, "por_rpa") === "on") {
    const impedimento = await impedimentoDoPrestador(fornecedorId)
    if (impedimento) return { erro: impedimento }
    const formaRpa = texto(formData, "forma_pagamento")
    if (!(FORMAS_PAGAMENTO_RPA as readonly string[]).includes(formaRpa)) {
      return { erro: "Escolha a forma de pagamento.", campo: "forma_pagamento" }
    }
    const vencimentoRpa = dataISO(texto(formData, "vencimento"))
    if (!vencimentoRpa) return { erro: "Informe a data de pagamento (Pagar em).", campo: "vencimento" }
    // Valor 0 na conferência do caixa: em dinheiro, ele é debitado no pagamento.
    const { detalhe, boleto, erro: erroDetalhe } = await lerDetalhePagamento(
      formData,
      formaRpa as FormaPagamentoCompras,
      fornecedorId,
      0
    )
    if (erroDetalhe || !detalhe) return { erro: erroDetalhe ?? "Pagamento inválido." }
    if (boleto) {
      const r = await subirComprovanteCompras("boletos", boleto)
      if (r.erro || !r.caminho) return { erro: r.erro ?? "Falha ao subir o boleto." }
      detalhe.arquivo_boleto = r.caminho
    }
    const { id, fornecimentoId, erro, apontamentos } = await criarCompraDireta({
      ...base,
      confirmacao: lerConfirmacao(formData),
      fornecedor_id: fornecedorId,
      valor,
      forma_pagamento: formaRpa,
      data_compra: dataCompra,
      vencimento: vencimentoRpa,
      comprador_id: compradorEscolhido,
      nota_fiscal_url: null,
      ja_recebido: entregaNoAto,
      recebedor_id: sessao.usuario.id,
      detalhe,
      por_rpa: true,
    })
    if (apontamentos || erro) {
      if (detalhe.arquivo_boleto) await (await createAdminClient()).storage.from("compras").remove([detalhe.arquivo_boleto])
      if (apontamentos) return { apontamentos }
    }
    if (erro || !id || !fornecimentoId) return { erro: erro ?? "Falha ao registrar." }
    revalidatePath("/painel/compras")
    redirect(`/painel/compras/contratos/rpa/novo?fornecimento=${fornecimentoId}`)
  }

  const formaBruta = texto(formData, "forma_pagamento")
  const forma = (FORMAS_PAGAMENTO_COMPRAS as readonly string[]).includes(formaBruta)
    ? (formaBruta as FormaPagamentoCompras)
    : null
  if (!forma) return { erro: "Escolha a forma de pagamento.", campo: "forma_pagamento" }
  // Dinheiro é pago no ato: o vencimento é a data da compra, mesmo lançando depois.
  const vencimento =
    forma === FORMA_PAGA_NO_ATO ? dataCompra : dataISO(texto(formData, "vencimento"))
  if (!vencimento) return { erro: "Informe a data de pagamento (Pagar em).", campo: "vencimento" }
  const arquivo = formData.get("nota_fiscal")
  if (!(arquivo instanceof File) || arquivo.size === 0) {
    return { erro: "Anexe a nota fiscal, o cupom ou o documento equivalente." }
  }

  const { detalhe, boleto, erro: erroDetalhe } = await lerDetalhePagamento(
    formData,
    forma,
    fornecedorId,
    valor
  )
  if (erroDetalhe || !detalhe) return { erro: erroDetalhe ?? "Pagamento inválido." }

  const { caminho, erro: erroArquivo } = await subirComprovanteCompras("notas", arquivo)
  if (erroArquivo || !caminho) return { erro: erroArquivo ?? "Falha ao subir a nota." }
  if (boleto) {
    const r = await subirComprovanteCompras("boletos", boleto)
    if (r.erro || !r.caminho) return { erro: r.erro ?? "Falha ao subir o boleto." }
    detalhe.arquivo_boleto = r.caminho
  }

  const { id, erro, apontamentos } = await criarCompraDireta({
    ...base,
    confirmacao: lerConfirmacao(formData),
    fornecedor_id: fornecedorId,
    valor,
    forma_pagamento: forma,
    data_compra: dataCompra,
    vencimento,
    comprador_id: compradorEscolhido,
    nota_fiscal_url: caminho,
    ja_recebido: entregaNoAto,
    recebedor_id: sessao.usuario.id,
    detalhe,
  })
  if (apontamentos) {
    // Nada foi gravado: os arquivos sobem de novo no reenvio.
    const enviados = [caminho, detalhe.arquivo_boleto].filter((c): c is string => typeof c === "string" && !!c)
    if (enviados.length) await (await createAdminClient()).storage.from("compras").remove(enviados)
    return { apontamentos }
  }
  if (erro || !id) return { erro: erro ?? "Falha ao registrar." }
  revalidatePath("/painel/compras")
  redirect(`/painel/compras/${id}?criado=1`)
}
