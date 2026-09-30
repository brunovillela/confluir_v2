import "server-only"

import {
  DETALHE_DA_FORMA,
  pixCodigoValido,
  type FormaPagamentoCompras,
} from "@/lib/compras-constantes"
import { TIPOS_CHAVE_PIX, TIPOS_CONTA } from "@/lib/contracheques-constantes"
import { TIPOS_COMPROVANTE_COMPRAS } from "@/lib/db/compras"
import {
  inserirMeioFornecedor,
  meiosPagamentoFornecedor,
  validarDetalhePagamento,
  type DetalhePagamento,
} from "@/lib/db/compras-pagamento"

function texto(formData: FormData, campo: string): string {
  return String(formData.get(campo) ?? "").trim()
}

/** Valor do select de chave/conta que pede cadastro de uma nova. */
const NOVA = "nova"

/**
 * Lê e confere o "com o quê foi paga" da forma escolhida. Chave Pix ou conta
 * NOVA do fornecedor é gravada no cadastro dele aqui mesmo (só depois de todo
 * o resto validado).
 */
export async function lerDetalhePagamento(
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
