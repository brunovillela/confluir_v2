"use server"

import { revalidatePath } from "next/cache"
import { redirect } from "next/navigation"

import type { EstadoComApontamentos } from "@/lib/auditoria-confirmacao"
import { lerConfirmacao } from "@/lib/db/ordens-verificacao"
import { createAdminClient } from "@/lib/supabase/admin"
import { requirePermissao } from "@/lib/auth"
import { type EstadoForm } from "@/lib/contas"
import { FORMAS_PAGAMENTO_COMPRAS, type FormaPagamentoCompras } from "@/lib/compras-constantes"
import { lerPagamentoOrdemFutura } from "@/lib/db/compras-pagamento-form"
import {
  meiosPagamentoFornecedor,
  type ContaFornecedor,
  type PixFornecedor,
} from "@/lib/db/compras-pagamento"
import {
  adicionarProposta,
  buscarProcesso,
  cancelarProcesso,
  definirEscolhaProposta,
  encerrarCotacao,
  gerarOrdemFornecimento,
  hojeSP,
  iniciarCotacao,
  reabrirCotacao,
  registrarCompra,
  registrarRecebimento,
  removerProposta,
  subirComprovanteCompras,
  subirPdfCompras,
} from "@/lib/db/compras"
import { compraNoEscopo, escopoComprasDoUsuario } from "@/lib/db/compras-acesso"
import { trocarCodigoPix, trocarNotaDaCompra, trocarNotaDaOrdem } from "@/lib/db/compras-ajustes"
import { podeAcessar } from "@/lib/permissoes"
import { parseValorBR } from "@/lib/valores"

function revalidarProcesso(id: string) {
  revalidatePath(`/painel/compras/${id}`)
  revalidatePath("/painel/compras")
  revalidatePath("/painel/compras/recebimentos")
  revalidatePath("/painel/compras/avaliacoes")
}

function texto(formData: FormData, campo: string): string {
  return String(formData.get(campo) ?? "").trim()
}

function dataISO(valor: string): string | null {
  return /^\d{4}-\d{2}-\d{2}$/.test(valor) ? valor : null
}

/**
 * Operar o processo (cotar, escolher, comprar, gerar ordem). O comprador é o
 * setor central e opera qualquer processo; quem opera por "editar" fica nos
 * departamentos que alcança em Aquisição.
 */
async function requireOperacao(formData: FormData) {
  const sessao = await requirePermissao("aquisicoes_compras_edicao", ["aquisicoes_comprador"])
  if (!podeAcessar(sessao.permissoes, "aquisicoes_comprador")) {
    await garantirEscopoDoProcesso(sessao.usuario.id, texto(formData, "processo_id"))
  }
  return sessao
}

async function garantirEscopoDoProcesso(usuarioId: string, processoId: string) {
  const escopo = await escopoComprasDoUsuario(usuarioId)
  if (escopo.todos || !processoId) return
  const processo = await buscarProcesso(processoId)
  if (
    processo &&
    !compraNoEscopo(escopo, { departamentoId: processo.departamento_id, solicitanteId: processo.solicitante_id })
  ) {
    redirect("/painel/compras?fora=1")
  }
}

export async function cancelarProcessoAction(
  _prev: EstadoForm,
  formData: FormData
): Promise<EstadoForm> {
  // Cancelar é operação de edição — não basta a flag base (só leitura).
  const sessao = await requireOperacao(formData)
  const id = texto(formData, "processo_id")
  if (!id) return { erro: "Processo inválido." }
  const { erro } = await cancelarProcesso(id, sessao.usuario.id)
  if (erro) return { erro }
  revalidarProcesso(id)
  redirect(`/painel/compras/${id}?salvo=1`)
}

export async function iniciarCotacaoAction(
  _prev: EstadoForm,
  formData: FormData
): Promise<EstadoForm> {
  const sessao = await requireOperacao(formData)
  const id = texto(formData, "processo_id")
  if (!id) return { erro: "Processo inválido." }
  const { erro } = await iniciarCotacao(id, sessao.usuario.id)
  if (erro) return { erro }
  revalidarProcesso(id)
  redirect(`/painel/compras/${id}?salvo=1`)
}

export async function encerrarCotacaoAction(
  _prev: EstadoForm,
  formData: FormData
): Promise<EstadoForm> {
  await requireOperacao(formData)
  const id = texto(formData, "processo_id")
  if (!id) return { erro: "Processo inválido." }
  const { erro } = await encerrarCotacao(id)
  if (erro) return { erro }
  revalidarProcesso(id)
  redirect(`/painel/compras/${id}?salvo=1`)
}

export async function reabrirCotacaoAction(
  _prev: EstadoForm,
  formData: FormData
): Promise<EstadoForm> {
  await requireOperacao(formData)
  const id = texto(formData, "processo_id")
  if (!id) return { erro: "Processo inválido." }
  const { erro } = await reabrirCotacao(id)
  if (erro) return { erro }
  revalidarProcesso(id)
  redirect(`/painel/compras/${id}?salvo=1`)
}

export async function adicionarPropostaAction(
  _prev: EstadoForm,
  formData: FormData
): Promise<EstadoForm> {
  await requireOperacao(formData)
  const processoId = texto(formData, "processo_id")
  if (!processoId) return { erro: "Processo inválido." }
  const fornecedorId = texto(formData, "fornecedor_id")
  if (!fornecedorId) return { erro: "Busque e selecione o fornecedor." }
  const valor = parseValorBR(texto(formData, "valor"))
  if (valor === null || valor < 0) return { erro: "Informe o valor da proposta." }
  const formaBruta = texto(formData, "forma_pagamento")
  const forma = (FORMAS_PAGAMENTO_COMPRAS as readonly string[]).includes(
    formaBruta
  )
    ? formaBruta
    : null

  let arquivoUrl: string | null = null
  const arquivo = formData.get("arquivo")
  if (arquivo instanceof File && arquivo.size > 0) {
    const { caminho, erro } = await subirPdfCompras(
      `propostas/${processoId}`,
      arquivo
    )
    if (erro) return { erro }
    arquivoUrl = caminho ?? null
  }

  const { erro } = await adicionarProposta({
    processo_id: processoId,
    fornecedor_id: fornecedorId,
    valor,
    forma_pagamento: forma,
    previsao_entrega: dataISO(texto(formData, "previsao_entrega")),
    arquivo_url: arquivoUrl,
  })
  if (erro) return { erro }
  revalidarProcesso(processoId)
  redirect(`/painel/compras/${processoId}?salvo=1`)
}

export async function removerPropostaAction(
  _prev: EstadoForm,
  formData: FormData
): Promise<EstadoForm> {
  await requireOperacao(formData)
  const processoId = texto(formData, "processo_id")
  const propostaId = texto(formData, "proposta_id")
  if (!processoId || !propostaId) return { erro: "Proposta inválida." }
  const { erro } = await removerProposta(propostaId)
  if (erro) return { erro }
  revalidarProcesso(processoId)
  redirect(`/painel/compras/${processoId}?salvo=1`)
}

export async function escolherPropostaAction(
  _prev: EstadoForm,
  formData: FormData
): Promise<EstadoForm> {
  const sessao = await requireOperacao(formData)
  const processoId = texto(formData, "processo_id")
  const propostaId = texto(formData, "proposta_id")
  if (!processoId || !propostaId) return { erro: "Proposta inválida." }
  const escolher = texto(formData, "escolher") === "1"
  const { erro } = await definirEscolhaProposta(
    propostaId,
    escolher,
    sessao.usuario.id
  )
  if (erro) return { erro }
  revalidarProcesso(processoId)
  redirect(`/painel/compras/${processoId}?salvo=1`)
}

export async function registrarCompraAction(
  _prev: EstadoForm,
  formData: FormData
): Promise<EstadoForm> {
  const sessao = await requireOperacao(formData)
  const processoId = texto(formData, "processo_id")
  if (!processoId) return { erro: "Processo inválido." }
  const dataCompra = dataISO(texto(formData, "data_compra"))
  if (!dataCompra) return { erro: "Informe a data da compra." }
  const { erro } = await registrarCompra(
    processoId,
    sessao.usuario.id,
    dataCompra
  )
  if (erro) return { erro }
  revalidarProcesso(processoId)
  redirect(`/painel/compras/${processoId}?salvo=1`)
}

export async function gerarOrdemAction(
  _prev: EstadoComApontamentos,
  formData: FormData
): Promise<EstadoComApontamentos> {
  await requireOperacao(formData)
  const processoId = texto(formData, "processo_id")
  const fornecimentoId = texto(formData, "fornecimento_id")
  if (!processoId || !fornecimentoId) return { erro: "Fornecimento inválido." }

  const fornecimento = (await buscarProcesso(processoId))?.fornecimentos?.find((f) => f.id === fornecimentoId)
  if (!fornecimento) return { erro: "Fornecimento não encontrado neste processo." }

  const valorTexto = texto(formData, "valor")
  const valor = valorTexto ? parseValorBR(valorTexto) : null
  if (valorTexto && (valor === null || valor <= 0)) return { erro: "Informe um valor de pagamento válido." }

  // Cada pagamento tem a sua forma e o "para onde" dela (chave Pix, boleto…).
  const forma = texto(formData, "forma_pagamento")
  if (!(FORMAS_PAGAMENTO_COMPRAS as readonly string[]).includes(forma)) {
    return { erro: "Escolha a forma de pagamento." }
  }
  if (!fornecimento.fornecedor_id) return { erro: "O fornecimento não tem fornecedor." }
  const pagamento = await lerPagamentoOrdemFutura(
    formData,
    forma as FormaPagamentoCompras,
    fornecimento.fornecedor_id
  )
  if (pagamento.erro || !pagamento.detalhe) return { erro: pagamento.erro ?? "Dados de pagamento inválidos." }
  if ((pagamento.boletos?.length ?? 0) > 1) return { erro: "Anexe um boleto só — um por pagamento." }

  let notaFiscal: string | null = null
  const arquivo = formData.get("nota_fiscal")
  if (arquivo instanceof File && arquivo.size > 0) {
    const { caminho, erro } = await subirPdfCompras(
      `notas/${processoId}`,
      arquivo
    )
    if (erro) return { erro }
    notaFiscal = caminho ?? null
  }
  const boleto = pagamento.boletos?.[0]
  if (boleto) {
    const { caminho, erro } = await subirComprovanteCompras(`boletos/${processoId}`, boleto)
    if (erro || !caminho) {
      if (notaFiscal) await (await createAdminClient()).storage.from("compras").remove([notaFiscal])
      return { erro: erro ?? "Falha ao subir o boleto." }
    }
    pagamento.detalhe.arquivo_boleto = caminho
  }

  const { erro, apontamentos } = await gerarOrdemFornecimento(
    fornecimentoId,
    {
      vencimento: dataISO(texto(formData, "vencimento")),
      nota_fiscal_url: notaFiscal,
      valor,
      forma_pagamento: forma,
      detalhe: pagamento.detalhe,
    },
    lerConfirmacao(formData)
  )
  if (apontamentos || erro) {
    // Nada foi gravado: os arquivos sobem de novo no reenvio.
    const enviados = [notaFiscal, pagamento.detalhe.arquivo_boleto].filter((c): c is string => !!c)
    if (enviados.length) await (await createAdminClient()).storage.from("compras").remove(enviados)
    if (apontamentos) return { apontamentos }
    return { erro }
  }
  revalidarProcesso(processoId)
  redirect(`/painel/compras/${processoId}?salvo=1`)
}

/** Chaves Pix e contas do fornecedor, para a forma de cada pagamento. */
export async function meiosDoFornecedorProcesso(
  fornecedorId: string
): Promise<{ pix: PixFornecedor[]; contas: ContaFornecedor[] }> {
  await requirePermissao("aquisicoes_compras_edicao", ["aquisicoes_comprador"])
  if (!fornecedorId) return { pix: [], contas: [] }
  return meiosPagamentoFornecedor(fornecedorId)
}

export async function registrarRecebimentoAction(
  _prev: EstadoForm,
  formData: FormData
): Promise<EstadoForm> {
  const sessao = await requirePermissao("aquisicoes_recebimentos", [
    "aquisicoes_compras_edicao",
  ])
  const processoId = texto(formData, "processo_id")
  await garantirEscopoDoProcesso(sessao.usuario.id, processoId)
  const fornecimentoId = texto(formData, "fornecimento_id")
  if (!fornecimentoId) return { erro: "Fornecimento inválido." }
  const data = dataISO(texto(formData, "data")) ?? hojeSP()

  const { erro } = await registrarRecebimento(fornecimentoId, {
    recebedor_id: sessao.usuario.id,
    data,
    de_acordo: texto(formData, "de_acordo") === "on",
    observacao: texto(formData, "observacao") || null,
  })
  if (erro) return { erro }
  if (processoId) {
    revalidarProcesso(processoId)
    redirect(`/painel/compras/${processoId}?salvo=1`)
  }
  revalidatePath("/painel/compras/recebimentos")
  redirect("/painel/compras/recebimentos?salvo=1")
}

// ── Ajustes do pagamento (código Pix e notas fiscais) ───────────────────────

/**
 * Quem opera o processo e quem registra aquisição direta ajustam o pagamento
 * — dentro dos departamentos que alcançam (o comprador, em qualquer um).
 */
async function requireAjustePagamento(formData: FormData) {
  const sessao = await requirePermissao("aquisicoes_compras_edicao", [
    "aquisicoes_comprador",
    "aquisicoes_compra_direta",
  ])
  if (!podeAcessar(sessao.permissoes, "aquisicoes_comprador")) {
    await garantirEscopoDoProcesso(sessao.usuario.id, texto(formData, "processo_id"))
  }
  return sessao
}

/** Novo código Pix copia e cola (o anterior expirou). */
export async function trocarCodigoPixAction(_prev: EstadoForm, formData: FormData): Promise<EstadoForm> {
  const sessao = await requireAjustePagamento(formData)
  const processoId = texto(formData, "processo_id")
  const ordemId = texto(formData, "ordem_id")
  if (!processoId || !ordemId) return { erro: "Ordem inválida." }
  const { erro } = await trocarCodigoPix(processoId, ordemId, texto(formData, "pix_codigo"), sessao.usuario.id)
  if (erro) return { erro }
  revalidarProcesso(processoId)
  revalidatePath(`/painel/financeiro/ordens/${ordemId}`)
  return { ok: "Código Pix atualizado." }
}

/** Inclui ou troca a nota fiscal da compra (fornecimento) ou do pagamento (ordem). */
export async function trocarNotaFiscalAction(_prev: EstadoForm, formData: FormData): Promise<EstadoForm> {
  const sessao = await requireAjustePagamento(formData)
  const processoId = texto(formData, "processo_id")
  const alvo = texto(formData, "alvo")
  const id = texto(formData, "id")
  if (!processoId || !id || (alvo !== "compra" && alvo !== "pagamento")) return { erro: "Pedido inválido." }
  const arquivo = formData.get("nota_fiscal")
  if (!(arquivo instanceof File) || arquivo.size === 0) return { erro: "Escolha o arquivo da nota (PDF ou foto)." }
  const { caminho, erro: erroUpload } = await subirComprovanteCompras(`notas/${processoId}`, arquivo)
  if (erroUpload || !caminho) return { erro: erroUpload ?? "Falha ao subir a nota." }

  const { erro } =
    alvo === "compra"
      ? await trocarNotaDaCompra(processoId, id, caminho, sessao.usuario.id)
      : await trocarNotaDaOrdem(processoId, id, caminho, sessao.usuario.id)
  if (erro) return { erro }
  revalidarProcesso(processoId)
  return { ok: "Nota fiscal salva." }
}
