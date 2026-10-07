"use server"

import { tenantAtual } from "@/lib/tenant"

import { revalidatePath } from "next/cache"
import { redirect } from "next/navigation"

import { requirePermissao } from "@/lib/auth"
import { type EstadoForm } from "@/lib/contas"
import {
  debitarCaixaCompra,
  saldoCaixaAberta,
} from "@/lib/db/compras-pagamento"
import { permissaoEspecificaDaOrdem, subirComprovanteCompras, subirPdfCompras } from "@/lib/db/compras"
import {
  alterarSituacaoOrdem,
  caixaJaDebitado,
  cancelarOrdem,
  corrigirOrdem,
  registrarEvento,
  reenviarParaAutorizacao,
  SITUACOES_PAGAVEIS,
} from "@/lib/db/ordens-ciclo"
import { listarCentrosDeDebito } from "@/lib/db/financeiro"
import { receberDocumentoFiscal } from "@/lib/db/ordens-documento"
import { registrarEstorno } from "@/lib/db/ordens-estorno"
import { createAdminClient } from "@/lib/supabase/admin"
import { parseValorBR } from "@/lib/valores"

function revalidarOrdem(id: string) {
  revalidatePath(`/painel/financeiro/ordens/${id}`)
  revalidatePath("/painel/financeiro/ordens")
  revalidatePath("/painel/financeiro")
  revalidatePath("/painel/compras/avaliacoes")
  revalidatePath("/painel/financeiro/estornos")
}

function texto(formData: FormData, campo: string): string {
  return String(formData.get(campo) ?? "").trim()
}

/**
 * Registra/atualiza o pagamento da ordem: valor, data, comprovante (PDF no
 * bucket 'comprovantes', caminho ordens/…) e centro de custo da receita — a
 * conta de onde o dinheiro saiu (banco, caixa). Só ordem AUTORIZADA ("A
 * pagar") é paga; registrar marca Paga e grava o pagador (usuário logado).
 */
export async function salvarPagamento(
  _prev: EstadoForm,
  formData: FormData
): Promise<EstadoForm> {
  const sessao = await requirePermissao("financeiro_pagamento")

  const id = texto(formData, "id")
  if (!id) return { erro: "Ordem inválida." }

  const valor = parseValorBR(texto(formData, "valor_pago"))
  if (valor === null || valor <= 0) {
    return { erro: "Informe o valor do pagamento." }
  }
  const dataPagamento = texto(formData, "data_pagamento")
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dataPagamento)) {
    return { erro: "Informe a data do pagamento." }
  }
  const centroReceitaId = texto(formData, "centro_custo_receita_id") || null
  if (!centroReceitaId) {
    return { erro: "Informe o centro de custo do débito — a conta de onde o dinheiro saiu." }
  }

  const admin = await createAdminClient()
  const { data: ordem } = await admin
    .from("ordens_pagamento")
    .select("id, codigo, descricao, situacao, arquivo_pagamento, data_pagamento, valor_pago, caixa_conta_id, centro_custo_receita_id")
    .eq("id", id)
    .eq("emp_proprietaria_id", await tenantAtual())
    .maybeSingle()
  if (!ordem) return { erro: "Ordem não encontrada." }
  // Primeiro registro exige autorização; editar um pagamento já registrado
  // (ordem Paga) é permitido.
  const editando = ordem.situacao === "Paga"
  if (!editando && !SITUACOES_PAGAVEIS.includes(String(ordem.situacao))) {
    return {
      erro:
        ordem.situacao === "Em autorização" || ordem.situacao === "Aguardando informações"
          ? "A ordem ainda não foi autorizada — só ordem \"A pagar\" pode ser paga."
          : `Ordem "${ordem.situacao}" não pode ser paga.`,
    }
  }

  // O débito é uma conta de pagamento (caixa, banco) — ver listarCentrosDeDebito.
  const debitos = await listarCentrosDeDebito((ordem.centro_custo_receita_id as string | null) ?? null)
  if (!debitos.some((c) => c.id === centroReceitaId)) {
    return { erro: "Escolha uma conta de pagamento (caixa, banco) como centro de custo do débito." }
  }

  // Comprovante é opcional na edição (mantém o atual se nenhum for enviado).
  let arquivoPagamento: string | undefined
  const arquivo = formData.get("comprovante")
  if (arquivo instanceof File && arquivo.size > 0) {
    if (arquivo.type !== "application/pdf") {
      return { erro: "O comprovante deve ser um arquivo PDF." }
    }
    if (arquivo.size > 3 * 1024 * 1024) {
      return { erro: "O comprovante deve ter no máximo 3 MB." }
    }
    const caminho = `ordens/${id}/${Date.now()}.pdf`
    const { error: erroUpload } = await admin.storage
      .from("comprovantes")
      .upload(caminho, arquivo, { contentType: "application/pdf" })
    if (erroUpload) {
      return { erro: `Falha ao subir o comprovante: ${erroUpload.message}` }
    }
    arquivoPagamento = caminho
  }

  // Forma "Dinheiro" de parcela de contrato: o caixa é debitado agora, no
  // pagamento (a compra direta já debitou no lançamento — não repete).
  const caixaId = ordem.caixa_conta_id ? String(ordem.caixa_conta_id) : null
  const debitarAgora = !editando && caixaId !== null && !(await caixaJaDebitado(id))
  if (debitarAgora) {
    const saldo = await saldoCaixaAberta(caixaId!)
    if (saldo === null) {
      return { erro: "A conta de caixa desta ordem não está aberta — peça ao responsável para reabri-la." }
    }
    if (saldo < valor) {
      return { erro: `Saldo insuficiente no caixa da ordem (${saldo.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}). Peça um aporte antes de pagar.` }
    }
  }

  const { error } = await admin
    .from("ordens_pagamento")
    .update({
      valor_pago: valor,
      data_pagamento: dataPagamento,
      centro_custo_receita_id: centroReceitaId,
      pagador_id: sessao.usuario.id,
      situacao: "Paga",
      ...(arquivoPagamento ? { arquivo_pagamento: arquivoPagamento } : {}),
    })
    .eq("id", id)
  if (error) return { erro: `Não foi possível salvar o pagamento: ${error.message}` }

  if (debitarAgora) {
    const { erro: erroCaixa } = await debitarCaixaCompra({
      contaId: caixaId!,
      valor,
      descricao: `Pagamento da ordem ${ordem.codigo ?? ""} — ${ordem.descricao ?? ""}`.slice(0, 500),
      usuarioId: sessao.usuario.id,
      ordemId: id,
    })
    if (erroCaixa) {
      // Sem o débito, o pagamento não vale: volta a ordem como estava.
      await admin
        .from("ordens_pagamento")
        .update({
          valor_pago: ordem.valor_pago,
          data_pagamento: ordem.data_pagamento,
          situacao: ordem.situacao,
          pagador_id: null,
        })
        .eq("id", id)
      return { erro: erroCaixa }
    }
  }

  await registrarEvento(
    id,
    "paga",
    sessao.usuario.id,
    editando ? "Dados do pagamento alterados." : null,
    {
      valor_pago: valor,
      data_pagamento: dataPagamento,
      centro_custo_receita_id: centroReceitaId,
      comprovante: Boolean(arquivoPagamento ?? ordem.arquivo_pagamento),
      ...(editando
        ? { antes: { valor_pago: ordem.valor_pago, data_pagamento: ordem.data_pagamento } }
        : {}),
    }
  )
  revalidarOrdem(id)
  redirect(`/painel/financeiro/ordens/${id}?salvo=1`)
}

/**
 * Remove o registro de pagamento: limpa valor/data/comprovante/pagador e a
 * situação volta para "A pagar" (autorizada) ou "Em autorização".
 */
export async function removerPagamento(
  _prev: EstadoForm,
  formData: FormData
): Promise<EstadoForm> {
  const sessao = await requirePermissao("financeiro_pagamento")

  const id = texto(formData, "id")
  if (!id) return { erro: "Ordem inválida." }

  const admin = await createAdminClient()
  const { data: ordem } = await admin
    .from("ordens_pagamento")
    .select("id, autorizacao_esta_autorizado, valor_pago, data_pagamento, caixa_conta_id, processo_compra_id")
    .eq("id", id)
    .eq("emp_proprietaria_id", await tenantAtual())
    .maybeSingle()
  if (!ordem) return { erro: "Ordem não encontrada." }

  const { error } = await admin
    .from("ordens_pagamento")
    .update({
      valor_pago: null,
      data_pagamento: null,
      arquivo_pagamento: null,
      pagador_id: null,
      situacao:
        ordem.autorizacao_esta_autorizado === true ? "A pagar" : "Em autorização",
    })
    .eq("id", id)
  if (error) return { erro: `Não foi possível remover o pagamento: ${error.message}` }

  // Débito feito no PAGAMENTO (parcela com caixa) volta para o caixa. O da
  // compra direta é do lançamento da compra e fica — só o cancelamento o desfaz.
  let caixaDevolvido = false
  if (ordem.caixa_conta_id && !ordem.processo_compra_id) {
    const { data: movs } = await admin
      .from("caixa_movimentacoes")
      .update({ situacao: "cancelada" })
      .eq("ordem_pagamento_id", id)
      .eq("situacao", "confirmada")
      .select("id")
    caixaDevolvido = (movs ?? []).length > 0
  }

  await registrarEvento(id, "pagamento_removido", sessao.usuario.id, null, {
    ...(caixaDevolvido ? { debito_do_caixa: "cancelado" } : {}),
    valor_pago: ordem.valor_pago,
    data_pagamento: ordem.data_pagamento,
  })
  revalidarOrdem(id)
  redirect(`/painel/financeiro/ordens/${id}?removido=1`)
}

export async function cancelarOrdemAction(
  _prev: EstadoForm,
  formData: FormData
): Promise<EstadoForm> {
  const sessao = await requirePermissao("financeiro_pagamento")
  const id = texto(formData, "id")
  if (!id) return { erro: "Ordem inválida." }
  const { erro } = await cancelarOrdem(id, sessao.usuario.id, texto(formData, "motivo"))
  if (erro) return { erro }
  revalidarOrdem(id)
  redirect(`/painel/financeiro/ordens/${id}?cancelada=1`)
}

export async function corrigirOrdemAction(
  _prev: EstadoForm,
  formData: FormData
): Promise<EstadoForm> {
  const sessao = await requirePermissao("financeiro_pagamento")
  const id = texto(formData, "id")
  if (!id) return { erro: "Ordem inválida." }
  const valorTexto = texto(formData, "valor")
  const valor = valorTexto ? parseValorBR(valorTexto) : null
  if (valorTexto && (valor === null || valor <= 0)) return { erro: "Valor inválido." }
  const vencimento = texto(formData, "vencimento")
  if (vencimento && !/^\d{4}-\d{2}-\d{2}$/.test(vencimento)) {
    return { erro: "Vencimento inválido." }
  }
  const { erro, voltouParaAutorizacao } = await corrigirOrdem(
    id,
    sessao.usuario.id,
    {
      descricao: texto(formData, "descricao") || null,
      valor,
      vencimento: vencimento || null,
      centroCustoDespesaId: texto(formData, "centro_custo_despesa_id") || null,
      formaPagamento: texto(formData, "forma_pagamento") || null,
    },
    texto(formData, "motivo")
  )
  if (erro) return { erro }
  revalidarOrdem(id)
  redirect(
    `/painel/financeiro/ordens/${id}?corrigida=${voltouParaAutorizacao ? "reautorizar" : "1"}`
  )
}

export async function reenviarOrdemAction(
  _prev: EstadoForm,
  formData: FormData
): Promise<EstadoForm> {
  const sessao = await requirePermissao("financeiro_pagamento", ["aquisicoes_avaliacoes"])
  const id = texto(formData, "id")
  if (!id) return { erro: "Ordem inválida." }
  const { erro } = await reenviarParaAutorizacao(id, sessao.usuario.id, texto(formData, "observacao"))
  if (erro) return { erro }
  revalidarOrdem(id)
  redirect(`/painel/financeiro/ordens/${id}?reenviada=1`)
}

const TIPOS_COMUNICADO: Record<string, string> = {
  "application/pdf": "pdf",
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
}

/**
 * Comunicado de estorno: o banco devolveu o pagamento. Dentro do prazo
 * configurado, a ordem paga regride para "Aguardando informações" e quem a
 * lançou é avisado para conferir os dados e reencaminhar.
 */
export async function registrarEstornoAction(
  _prev: EstadoForm,
  formData: FormData
): Promise<EstadoForm> {
  const sessao = await requirePermissao("financeiro_estorno")
  const id = texto(formData, "id")
  if (!id) return { erro: "Ordem inválida." }

  let arquivoComunicado: string | null = null
  const arquivo = formData.get("comunicado")
  if (arquivo instanceof File && arquivo.size > 0) {
    const ext = TIPOS_COMUNICADO[arquivo.type]
    if (!ext) return { erro: "O comunicado deve ser um PDF ou uma imagem (JPG, PNG ou WEBP)." }
    if (arquivo.size > 3 * 1024 * 1024) return { erro: "O comunicado deve ter no máximo 3 MB." }
    const admin = await createAdminClient()
    const caminho = `ordens/${id}/estorno-${Date.now()}.${ext}`
    const { error } = await admin.storage
      .from("comprovantes")
      .upload(caminho, arquivo, { contentType: arquivo.type })
    if (error) return { erro: `Falha ao subir o comunicado: ${error.message}` }
    arquivoComunicado = caminho
  }

  const { erro } = await registrarEstorno(id, sessao.usuario.id, {
    dataEstorno: texto(formData, "data_estorno"),
    motivo: texto(formData, "motivo"),
    arquivoComunicado,
  })
  if (erro) return { erro }
  revalidarOrdem(id)
  redirect(`/painel/financeiro/ordens/${id}?estornada=1`)
}

/**
 * Nota fiscal e/ou boleto anexados (ou substituídos) pela tela da ordem —
 * caminhos no bucket 'compras' (notas/…, boletos/…), os mesmos da compra
 * direta e das parcelas de contrato. A situação da ordem não muda aqui.
 */
export async function salvarDocumentosOrdemAction(
  _prev: EstadoForm,
  formData: FormData
): Promise<EstadoForm> {
  const sessao = await requirePermissao("financeiro_pagamento")
  const id = texto(formData, "id")
  if (!id) return { erro: "Ordem inválida." }

  const admin = await createAdminClient()
  const { data: ordem } = await admin
    .from("ordens_pagamento")
    .select("id, situacao, arquivo_nota_fiscal, arquivo_boleto, forma_pagamento")
    .eq("id", id)
    .eq("emp_proprietaria_id", await tenantAtual())
    .maybeSingle()
  if (!ordem) return { erro: "Ordem não encontrada." }
  if (ordem.situacao === "Cancelada") {
    return { erro: "Ordem cancelada não recebe documentos." }
  }

  const nota = formData.get("nota")
  const boleto = formData.get("boleto")
  const temNota = nota instanceof File && nota.size > 0
  const temBoleto = boleto instanceof File && boleto.size > 0
  if (!temNota && !temBoleto) {
    return { erro: "Anexe a nota fiscal e/ou o boleto." }
  }

  // Parcela recorrente esperando a nota: o documento faz a ordem andar
  // (A pagar se no valor autorizado; senão, autorização pontual).
  if (temNota && ordem.situacao === "Aguardando documento fiscal") {
    if (temBoleto) {
      const rb = await subirPdfCompras(`boletos/ordens/${id}`, boleto)
      if (rb.erro || !rb.caminho) return { erro: rb.erro ?? "Falha ao subir o boleto." }
      await admin.from("ordens_pagamento").update({ arquivo_boleto: rb.caminho }).eq("id", id)
    }
    const r = await receberDocumentoFiscal(id, { arquivo: nota, valor: null, onde: "pela tela da ordem" })
    if (r.erro) return { erro: r.erro }
    revalidarOrdem(id)
    revalidatePath("/painel/compras/contratos")
    revalidatePath("/painel/institucional/custeios")
    redirect(`/painel/financeiro/ordens/${id}?documentos=${r.situacao === "A pagar" ? "pagar" : "autorizacao"}`)
  }

  const mudancas: Record<string, string> = {}
  if (temNota) {
    const r = await subirComprovanteCompras(`notas/ordens/${id}`, nota)
    if (r.erro || !r.caminho) return { erro: r.erro ?? "Falha ao subir a nota fiscal." }
    mudancas.arquivo_nota_fiscal = r.caminho
  }
  if (temBoleto) {
    const r = await subirPdfCompras(`boletos/ordens/${id}`, boleto)
    if (r.erro || !r.caminho) {
      return { erro: r.erro === "O arquivo deve ser um PDF." ? "O boleto deve ser um arquivo PDF." : (r.erro ?? "Falha ao subir o boleto.") }
    }
    mudancas.arquivo_boleto = r.caminho
  }

  const { error } = await admin.from("ordens_pagamento").update(mudancas).eq("id", id)
  if (error) return { erro: `Não foi possível salvar os documentos: ${error.message}` }

  const partes = [
    temNota ? `nota fiscal ${ordem.arquivo_nota_fiscal ? "substituída" : "anexada"}` : null,
    temBoleto ? `boleto ${ordem.arquivo_boleto ? "substituído" : "anexado"}` : null,
  ].filter(Boolean)
  await registrarEvento(
    id,
    "documento_fiscal",
    sessao.usuario.id,
    `Pela tela da ordem: ${partes.join(" e ")}.`,
    {
      ...(temNota ? { arquivo_nota_fiscal: mudancas.arquivo_nota_fiscal, nota_anterior: ordem.arquivo_nota_fiscal } : {}),
      ...(temBoleto ? { arquivo_boleto: mudancas.arquivo_boleto, boleto_anterior: ordem.arquivo_boleto } : {}),
    }
  )
  revalidarOrdem(id)
  redirect(`/painel/financeiro/ordens/${id}?documentos=1`)
}

/** Troca manual da situação (ordem não paga), com motivo (opcional para "Processando") — ver DESTINOS_SITUACAO. */
export async function alterarSituacaoAction(
  _prev: EstadoForm,
  formData: FormData
): Promise<EstadoForm> {
  const sessao = await requirePermissao("financeiro_pagamento")
  const id = texto(formData, "id")
  if (!id) return { erro: "Ordem inválida." }
  // "A pagar" à mão é autorizar: extraordinária de contrato/custeio exige a
  // permissão específica, como na aprovação.
  if (texto(formData, "situacao") === "A pagar" && !(await jaAutorizadaEmProcessamento(id))) {
    const exigida = await permissaoEspecificaDaOrdem(id)
    if (exigida && sessao.permissoes[exigida.chave] !== true) {
      return { erro: `Ordem de ${exigida.origem}: levar para "A pagar" exige a permissão "${exigida.rotulo}".` }
    }
  }
  const { erro } = await alterarSituacaoOrdem(
    id,
    sessao.usuario.id,
    texto(formData, "situacao"),
    texto(formData, "motivo")
  )
  if (erro) return { erro }
  revalidarOrdem(id)
  revalidatePath("/painel/compras/contratos")
  redirect(`/painel/financeiro/ordens/${id}?situacao=1`)
}

/** Ordem "Processando" já autorizada: voltar para "A pagar" não é autorizar de novo. */
async function jaAutorizadaEmProcessamento(id: string): Promise<boolean> {
  const admin = await createAdminClient()
  const { data } = await admin
    .from("ordens_pagamento")
    .select("situacao, autorizacao_esta_autorizado")
    .eq("id", id)
    .eq("emp_proprietaria_id", await tenantAtual())
    .maybeSingle()
  return data?.situacao === "Processando" && data.autorizacao_esta_autorizado === true
}
