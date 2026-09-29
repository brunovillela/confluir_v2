"use server"

import { revalidatePath } from "next/cache"
import { redirect } from "next/navigation"

import { requirePermissao } from "@/lib/auth"
import { type EstadoForm } from "@/lib/contas"
import {
  DETALHE_DA_FORMA,
  FORMAS_PAGAMENTO_COMPRAS,
  pixCodigoValido,
  type FormaPagamentoCompras,
} from "@/lib/compras-constantes"
import { TIPOS_CHAVE_PIX, TIPOS_CONTA } from "@/lib/contracheques-constantes"
import {
  criarCompraDireta,
  criarSolicitacao,
  subirComprovanteCompras,
  TIPOS_COMPROVANTE_COMPRAS,
} from "@/lib/db/compras"
import { escopoComprasDoUsuario } from "@/lib/db/compras-acesso"
import {
  inserirMeioFornecedor,
  meiosPagamentoFornecedor,
  validarDetalhePagamento,
  type DetalhePagamento,
} from "@/lib/db/compras-pagamento"
import { podeAcessar } from "@/lib/permissoes"
import { parseValorBR } from "@/lib/valores"

function texto(formData: FormData, campo: string): string {
  return String(formData.get(campo) ?? "").trim()
}

function dataISO(valor: string): string | null {
  return /^\d{4}-\d{2}-\d{2}$/.test(valor) ? valor : null
}

/** Valor do select de chave/conta que pede cadastro de uma nova. */
const NOVA = "nova"

/**
 * Lê e confere o "com o quê foi paga" da forma escolhida. Chave Pix ou conta
 * NOVA do fornecedor é gravada no cadastro dele aqui mesmo (só depois de todo
 * o resto validado).
 */
async function lerDetalhePagamento(
  formData: FormData,
  forma: FormaPagamentoCompras,
  fornecedorId: string,
  valor: number
): Promise<{ detalhe?: DetalhePagamento; boleto?: File; erro?: string }> {
  const detalhe: DetalhePagamento = {
    cartao_id: null,
    caixa_conta_id: null,
    dados_bancarios_id: null,
    pix_codigo: null,
    arquivo_boleto: null,
  }
  let boleto: File | undefined
  let novoMeio: Parameters<typeof inserirMeioFornecedor>[1] | null = null

  switch (DETALHE_DA_FORMA[forma]) {
    case "cartao":
      detalhe.cartao_id = texto(formData, "cartao_id") || null
      if (!detalhe.cartao_id) return { erro: "Escolha o cartão usado no pagamento." }
      break
    case "caixa":
      detalhe.caixa_conta_id = texto(formData, "caixa_conta_id") || null
      if (!detalhe.caixa_conta_id) {
        return { erro: "Escolha a conta de caixa de onde saiu o dinheiro." }
      }
      break
    case "pix_fornecedor": {
      const escolha = texto(formData, "dados_bancarios_id")
      if (!escolha) return { erro: "Informe a chave Pix do fornecedor." }
      if (escolha === NOVA) {
        const chave = texto(formData, "pix_chave")
        const tipo = texto(formData, "pix_tipo")
        if (!(TIPOS_CHAVE_PIX as readonly string[]).includes(tipo)) {
          return { erro: "Escolha o tipo da chave Pix." }
        }
        if (chave.length < 5) return { erro: "Informe a chave Pix do fornecedor." }
        novoMeio = { pix: chave, pix_tipo: tipo }
      } else {
        detalhe.dados_bancarios_id = escolha
      }
      break
    }
    case "conta_fornecedor": {
      const escolha = texto(formData, "dados_bancarios_id")
      if (!escolha) return { erro: "Informe a conta do fornecedor que recebeu a TED." }
      if (escolha === NOVA) {
        const conta = {
          banco: texto(formData, "conta_banco"),
          agencia: texto(formData, "conta_agencia"),
          conta: texto(formData, "conta_numero"),
          tipo_conta: texto(formData, "conta_tipo"),
          favorecido: texto(formData, "conta_favorecido"),
        }
        if (!conta.banco || !conta.agencia || !conta.conta || !conta.favorecido) {
          return { erro: "Preencha banco, agência, conta e favorecido da conta do fornecedor." }
        }
        if (!TIPOS_CONTA.some((t) => t.valor === conta.tipo_conta)) {
          return { erro: "Escolha o tipo da conta do fornecedor." }
        }
        novoMeio = conta
      } else {
        detalhe.dados_bancarios_id = escolha
      }
      break
    }
    case "pix_codigo":
      detalhe.pix_codigo = texto(formData, "pix_codigo").replace(/\s/g, "") || null
      if (!detalhe.pix_codigo || !pixCodigoValido(detalhe.pix_codigo)) {
        return {
          erro: "Cole o código Pix copia e cola usado no pagamento (começa com 000201).",
        }
      }
      break
    case "boleto": {
      // Sobe junto com a nota, depois de tudo validado (em criarCompra).
      const arquivo = formData.get("boleto_arquivo")
      if (!(arquivo instanceof File) || arquivo.size === 0) {
        return { erro: "Anexe o arquivo do boleto." }
      }
      if (!TIPOS_COMPROVANTE_COMPRAS[arquivo.type]) {
        return { erro: "O boleto deve ser um PDF ou uma imagem (JPG, PNG ou WEBP)." }
      }
      boleto = arquivo
      break
    }
  }

  const invalido = await validarDetalhePagamento(detalhe, fornecedorId, valor)
  if (invalido) return { erro: invalido }

  if (novoMeio) {
    // A mesma chave/conta pode já estar no cadastro: reaproveita.
    const meios = await meiosPagamentoFornecedor(fornecedorId)
    const existente =
      "pix" in novoMeio
        ? meios.pix.find((p) => p.chave === (novoMeio as { pix: string }).pix)
        : meios.contas.find(
            (c) =>
              c.banco === (novoMeio as { banco: string }).banco &&
              c.conta === (novoMeio as { conta: string }).conta
          )
    if (existente) {
      detalhe.dados_bancarios_id = existente.id
    } else {
      const { id, erro } = await inserirMeioFornecedor(fornecedorId, novoMeio)
      if (erro || !id) return { erro: erro ?? "Falha ao gravar o dado bancário." }
      detalhe.dados_bancarios_id = id
    }
  }
  return { detalhe, boleto }
}

export async function criarCompra(
  _prev: EstadoForm,
  formData: FormData
): Promise<EstadoForm> {
  // Registrar compra é escrita: via Compras exige "editar"; aquisição direta,
  // a permissão própria. E só pelos departamentos que a pessoa alcança.
  const sessao = await requirePermissao("aquisicoes_compras_edicao", ["aquisicoes_compra_direta"])

  const direta = texto(formData, "modalidade") === "direta"
  if (direta && !podeAcessar(sessao.permissoes, "aquisicoes_compra_direta")) {
    return { erro: "Você não tem permissão para registrar aquisição direta — use a solicitação via Compras." }
  }
  if (!direta && !podeAcessar(sessao.permissoes, "aquisicoes_compras_edicao")) {
    return { erro: "Você só tem permissão para registrar aquisição direta." }
  }

  // Toda compra é auditada: só a observação é facultativa (e limite/local
  // para receber, quando a entrega é no ato da compra).
  const produto = texto(formData, "produto")
  if (!produto) return { erro: "Descreva o produto ou serviço." }
  const observacao = texto(formData, "observacao") || null
  const tipo = texto(formData, "e_produto")
  if (tipo !== "bem" && tipo !== "servico") {
    return { erro: "Informe o tipo: bem/produto ou prestação de serviço." }
  }
  const departamentoId = texto(formData, "departamento_id")
  if (!departamentoId) return { erro: "Informe o departamento solicitante." }
  const escopo = await escopoComprasDoUsuario(sessao.usuario.id)
  if (!escopo.todos && !escopo.departamentoIds.includes(departamentoId)) {
    return { erro: "Você não compra por esse departamento." }
  }
  const centroCustoId = texto(formData, "centro_custo_id")
  if (!centroCustoId) {
    return { erro: "Informe o centro de custo da despesa." }
  }
  const comProjeto = texto(formData, "com_projeto") === "on"
  const projetoId = texto(formData, "projeto_id")
  if (comProjeto && !projetoId) return { erro: "Escolha o projeto da compra." }

  const entregaNoAto = texto(formData, "entrega_no_ato") === "on"
  const dataLimite = entregaNoAto ? null : dataISO(texto(formData, "data_limite"))
  const localEntrega = entregaNoAto ? null : texto(formData, "local_entrega") || null
  if (!entregaNoAto) {
    if (!dataLimite) return { erro: "Informe o limite para receber." }
    if (!localEntrega) return { erro: "Informe o local para receber." }
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

  // Aquisição direta: fornecedor, valor, data, pagamento e nota.
  const fornecedorId = texto(formData, "fornecedor_id")
  if (!fornecedorId) return { erro: "Busque e selecione o fornecedor." }
  const valor = parseValorBR(texto(formData, "valor"))
  if (valor === null || valor <= 0) return { erro: "Informe o valor da compra." }
  const dataCompra = dataISO(texto(formData, "data_compra"))
  if (!dataCompra) return { erro: "Informe a data da compra." }
  const formaBruta = texto(formData, "forma_pagamento")
  const forma = (FORMAS_PAGAMENTO_COMPRAS as readonly string[]).includes(formaBruta)
    ? (formaBruta as FormaPagamentoCompras)
    : null
  if (!forma) return { erro: "Escolha a forma de pagamento." }
  const vencimento = dataISO(texto(formData, "vencimento"))
  if (!vencimento) return { erro: "Informe a data de pagamento (Pagar em)." }
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

  const { id, erro } = await criarCompraDireta({
    ...base,
    fornecedor_id: fornecedorId,
    valor,
    forma_pagamento: forma,
    data_compra: dataCompra,
    vencimento,
    comprador_id: sessao.usuario.id,
    nota_fiscal_url: caminho,
    ja_recebido: entregaNoAto,
    recebedor_id: sessao.usuario.id,
    detalhe,
  })
  if (erro || !id) return { erro: erro ?? "Falha ao registrar." }
  revalidatePath("/painel/compras")
  redirect(`/painel/compras/${id}?criado=1`)
}
