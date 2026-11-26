"use server"

import { revalidatePath } from "next/cache"
import { redirect } from "next/navigation"

import type { EstadoComApontamentos } from "@/lib/auditoria-confirmacao"
import { lerConfirmacao } from "@/lib/db/ordens-verificacao"
import { requirePermissao } from "@/lib/auth"
import { type EstadoForm } from "@/lib/contas"
import {
  anexarNotaOrdemContrato,
  atualizarCategoriaContrato,
  atualizarContrato,
  criarCategoriaContrato,
  criarContrato,
  excluirCategoriaContrato,
  autorizarContrato,
  classificarOrdemContrato,
  editarOrdemContrato,
  excluirContrato,
  excluirOrdemContrato,
  excluirOrdensContrato,
  finalizarContrato,
  finalizarContratosEmLote,
  reabrirContrato,
  gerarOrdensContrato,
  receberDocumentoOrdemContrato,
  validarCentroDoDepartamento,
} from "@/lib/db/contratos"
import { subirPdfCompras } from "@/lib/db/compras"
import {
  meiosPagamentoFornecedor,
  type ContaFornecedor,
  type PixFornecedor,
} from "@/lib/db/compras-pagamento"
import { lerPagamentoOrdemFutura } from "@/lib/db/compras-pagamento-form"
import { FORMAS_ORDEM_CONTRATO } from "@/lib/compras-constantes"
import { MOTIVOS_FINALIZACAO_CONTRATO, PERIODICIDADES, type Periodicidade } from "@/lib/contratos-constantes"
import { parseValorBR } from "@/lib/valores"

import { lerDadosContrato } from "./dados-form"

function texto(formData: FormData, campo: string): string {
  return String(formData.get(campo) ?? "").trim()
}

function marcado(formData: FormData, campo: string): boolean {
  return texto(formData, campo) === "on"
}

async function requireEdicaoContratos() {
  return requirePermissao("aquisicoes_contratos_edicao")
}

function revalidar(id?: string) {
  revalidatePath("/painel/compras/contratos")
  if (id) revalidatePath(`/painel/compras/contratos/${id}`)
}

const lerDados = lerDadosContrato

/** Sobe o PDF quando enviado; devolve o caminho ou `undefined` (não mexer). */
async function lerArquivo(
  formData: FormData
): Promise<{ caminho?: string | null; erro?: string }> {
  const arquivo = formData.get("arquivo")
  if (!(arquivo instanceof File) || arquivo.size === 0) return { caminho: undefined }
  const { caminho, erro } = await subirPdfCompras("contratos", arquivo)
  if (erro) return { erro }
  return { caminho }
}

export async function criarContratoAction(
  _prev: EstadoForm,
  formData: FormData
): Promise<EstadoForm> {
  await requireEdicaoContratos()
  const { caminho, erro: erroArquivo } = await lerArquivo(formData)
  if (erroArquivo) return { erro: erroArquivo }
  const dados = lerDados(formData)
  const erroCentro = await validarCentroDoDepartamento(dados.centro_custo_id, dados.departamento_id)
  if (erroCentro) return { erro: erroCentro }
  const { id, erro } = await criarContrato({
    ...dados,
    apoio_institucional: false,
    arquivo_contrato: caminho ?? null,
  })
  if (erro || !id) return { erro: erro ?? "Falha ao cadastrar." }
  revalidar(id)
  redirect(`/painel/compras/contratos/${id}?salvo=1`)
}

export async function atualizarContratoAction(
  _prev: EstadoForm,
  formData: FormData
): Promise<EstadoForm> {
  await requireEdicaoContratos()
  const id = texto(formData, "contrato_id")
  if (!id) return { erro: "Contrato inválido." }
  const { caminho, erro: erroArquivo } = await lerArquivo(formData)
  if (erroArquivo) return { erro: erroArquivo }
  const dados = lerDados(formData)
  const erroCentro = await validarCentroDoDepartamento(dados.centro_custo_id, dados.departamento_id)
  if (erroCentro) return { erro: erroCentro }
  const { erro } = await atualizarContrato(id, {
    ...dados,
    apoio_institucional: false,
    arquivo_contrato: caminho,
  })
  if (erro) return { erro }
  revalidar(id)
  redirect(`/painel/compras/contratos/${id}?salvo=1`)
}

export async function gerarOrdensContratoAction(
  _prev: EstadoComApontamentos,
  formData: FormData
): Promise<EstadoComApontamentos> {
  await requireEdicaoContratos()
  const id = texto(formData, "contrato_id")
  if (!id) return { erro: "Contrato inválido." }

  // Dois caminhos (26/11/2026): "Gerar parcelas" (mensal/anual, numeradas no
  // contrato) e "Pagamento avulso" (uma ordem, extraordinária ou sob demanda,
  // com o que está sendo pago). Sem o modo, vale a periodicidade enviada.
  const modo = texto(formData, "modo")
  const per = texto(formData, "periodicidade")
  const periodicidade: Periodicidade =
    modo === "avulso"
      ? "unica"
      : PERIODICIDADES.some((p) => p.chave === per) && !(modo === "parcelas" && per === "unica")
        ? (per as Periodicidade)
        : "mensal"
  const motivoAvulso = texto(formData, "motivo_avulso").replace(/\s+/g, " ").slice(0, 200)
  if (modo === "avulso" && motivoAvulso.length < 5) {
    return { erro: "Diga o que este pagamento avulso paga (pelo menos 5 caracteres)." }
  }
  const valorBruto = texto(formData, "valor_parcela")
  const forma = texto(formData, "forma_pagamento")
  if (!(FORMAS_ORDEM_CONTRATO as readonly string[]).includes(forma)) {
    return { erro: "Escolha a forma de pagamento." }
  }

  const { geradas, puladas, erro, apontamentos } = await gerarOrdensContrato(id, {
    confirmacao: lerConfirmacao(formData),
    periodicidade,
    valorParcela: (valorBruto ? parseValorBR(valorBruto) : 0) ?? 0,
    primeiroVencimento: texto(formData, "primeiro_vencimento"),
    quantidade: Number(texto(formData, "quantidade")) || 1,
    formaPagamento: forma,
    aguardarDocumento: true,
    motivoAvulso: motivoAvulso || null,
    pagamento: (fornecedorId) =>
      lerPagamentoOrdemFutura(
        formData,
        forma as (typeof FORMAS_ORDEM_CONTRATO)[number],
        fornecedorId
      ),
  })
  if (apontamentos) return { apontamentos }
  if (erro) return { erro }

  revalidar(id)
  const params = new URLSearchParams({
    geradas: String(geradas ?? 0),
    puladas: String(puladas ?? 0),
    tipoGerado: periodicidade === "unica" ? "avulso" : "parcelas",
  })
  redirect(`/painel/compras/contratos/${id}?${params.toString()}#ordens`)
}

/** Nota da parcela recorrente: a ordem sai do contrato e vai para autorização. */
export async function receberDocumentoOrdemAction(
  _prev: EstadoComApontamentos,
  formData: FormData
): Promise<EstadoComApontamentos> {
  await requireEdicaoContratos()
  const contratoId = texto(formData, "contrato_id")
  const ordemId = texto(formData, "ordem_id")
  if (!contratoId || !ordemId) return { erro: "Ordem inválida." }
  const arquivo = formData.get("nota")
  if (!(arquivo instanceof File) || arquivo.size === 0) {
    return { erro: "Anexe a nota (PDF ou imagem)." }
  }
  const valorTexto = texto(formData, "valor")
  const valor = valorTexto ? parseValorBR(valorTexto) : null
  if (valorTexto && (valor === null || valor <= 0)) return { erro: "Valor da nota inválido." }

  const { erro, situacao, apontamentos } = await receberDocumentoOrdemContrato(contratoId, ordemId, {
    arquivo,
    valor,
    confirmacao: lerConfirmacao(formData),
  })
  if (apontamentos) return { apontamentos }
  if (erro) return { erro }
  revalidar(contratoId)
  revalidatePath("/painel/financeiro/ordens")
  revalidatePath("/painel/compras/avaliacoes")
  return {
    ok:
      situacao === "A pagar"
        ? "Nota recebida — a parcela já estava autorizada e seguiu direto para pagamento."
        : "Nota recebida — a ordem seguiu para autorização (valor diferente do autorizado ou parcela sem autorização).",
  }
}

/** Nota fiscal anexada pelo contrato a uma ordem que ainda não tem nota. */
export async function anexarNotaOrdemContratoAction(
  _prev: EstadoForm,
  formData: FormData
): Promise<EstadoForm> {
  await requireEdicaoContratos()
  const contratoId = texto(formData, "contrato_id")
  const ordemId = texto(formData, "ordem_id")
  if (!contratoId || !ordemId) return { erro: "Ordem inválida." }
  const arquivo = formData.get("nota")
  if (!(arquivo instanceof File) || arquivo.size === 0) {
    return { erro: "Escolha o arquivo da nota (PDF ou imagem)." }
  }
  const { erro } = await anexarNotaOrdemContrato(contratoId, ordemId, arquivo)
  if (erro) return { erro }
  revalidar(contratoId)
  revalidatePath(`/painel/financeiro/ordens/${ordemId}`)
  return { ok: "Nota anexada." }
}

/** Exclusão em massa das ordens ainda não autorizadas do contrato. */
export async function excluirOrdensContratoAction(
  _prev: EstadoForm,
  formData: FormData
): Promise<EstadoForm> {
  await requireEdicaoContratos()
  const contratoId = texto(formData, "contrato_id")
  if (!contratoId) return { erro: "Contrato inválido." }
  const ids = formData.getAll("ordem_ids").map(String)
  const { erro, excluidas, recusadas } = await excluirOrdensContrato(contratoId, ids)
  if (erro) return { erro }
  revalidar(contratoId)
  revalidatePath("/painel/financeiro/ordens")
  revalidatePath("/painel/compras/avaliacoes")
  return {
    ok: `${excluidas} ordem(ns) excluída(s)${recusadas ? `; ${recusadas} não puderam (já autorizadas ou mudaram de situação)` : ""}.`,
  }
}

/** Chaves Pix e contas do fornecedor, para a forma das ordens do contrato. */
export async function meiosDoFornecedorContrato(
  fornecedorId: string
): Promise<{ pix: PixFornecedor[]; contas: ContaFornecedor[] }> {
  await requireEdicaoContratos()
  if (!fornecedorId) return { pix: [], contas: [] }
  return meiosPagamentoFornecedor(fornecedorId)
}

export async function excluirContratoAction(
  _prev: EstadoForm,
  formData: FormData
): Promise<EstadoForm> {
  await requireEdicaoContratos()
  const id = texto(formData, "contrato_id")
  if (!id) return { erro: "Contrato inválido." }
  const { erro } = await excluirContrato(id)
  if (erro) return { erro }
  revalidar()
  redirect("/painel/compras/contratos?excluido=1")
}

// ── Categorias ───────────────────────────────────────────────────────────────

function revalidarCategorias() {
  revalidatePath("/painel/compras/contratos/categorias")
  revalidatePath("/painel/compras/contratos")
}

export async function criarCategoriaAction(
  _prev: EstadoForm,
  formData: FormData
): Promise<EstadoForm> {
  await requireEdicaoContratos()
  const { erro } = await criarCategoriaContrato(
    texto(formData, "nome"),
    marcado(formData, "sigiloso")
  )
  if (erro) return { erro }
  revalidarCategorias()
  return { ok: "Categoria criada." }
}

export async function atualizarCategoriaAction(
  _prev: EstadoForm,
  formData: FormData
): Promise<EstadoForm> {
  await requireEdicaoContratos()
  const id = texto(formData, "categoria_id")
  if (!id) return { erro: "Categoria inválida." }
  const { erro } = await atualizarCategoriaContrato(
    id,
    texto(formData, "nome"),
    marcado(formData, "sigiloso")
  )
  if (erro) return { erro }
  revalidarCategorias()
  return { ok: "Categoria atualizada." }
}

export async function excluirCategoriaAction(
  _prev: EstadoForm,
  formData: FormData
): Promise<EstadoForm> {
  await requireEdicaoContratos()
  const id = texto(formData, "categoria_id")
  if (!id) return { erro: "Categoria inválida." }
  const { erro } = await excluirCategoriaContrato(id)
  if (erro) return { erro }
  revalidarCategorias()
  return { ok: "Categoria excluída." }
}

/**
 * Edita uma ordem do contrato (descrição, valor, vencimento) ainda não paga
 * nem em processamento. Mudar o valor de ordem autorizada a devolve para
 * autorização — mesma regra da correção no Financeiro.
 */
export async function editarOrdemContratoAction(
  _prev: EstadoForm,
  formData: FormData
): Promise<EstadoForm> {
  await requireEdicaoContratos()
  const contratoId = texto(formData, "contrato_id")
  const ordemId = texto(formData, "ordem_id")
  if (!contratoId || !ordemId) return { erro: "Ordem inválida." }
  const valorTexto = texto(formData, "valor")
  const valor = valorTexto ? parseValorBR(valorTexto) : null
  if (valorTexto && (valor === null || valor <= 0)) return { erro: "Valor inválido." }
  const vencimento = texto(formData, "vencimento")
  if (vencimento && !/^\d{4}-\d{2}-\d{2}$/.test(vencimento)) return { erro: "Vencimento inválido." }
  const { erro, voltouParaAutorizacao } = await editarOrdemContrato(
    contratoId,
    ordemId,
    {
      descricao: texto(formData, "descricao") || null,
      valor,
      vencimento: vencimento || null,
    },
    texto(formData, "motivo")
  )
  if (erro) return { erro }
  revalidar(contratoId)
  revalidatePath(`/painel/financeiro/ordens/${ordemId}`)
  revalidatePath("/painel/financeiro/ordens")
  revalidatePath("/painel/compras/avaliacoes")
  return {
    ok: voltouParaAutorizacao
      ? "Ordem alterada. Como o valor mudou, ela voltou para autorização."
      : "Ordem alterada — o antes e o depois ficaram no histórico.",
  }
}

/** Exclui UMA ordem do contrato que ainda não foi paga nem está em processamento. */
export async function excluirOrdemContratoAction(
  _prev: EstadoForm,
  formData: FormData
): Promise<EstadoForm> {
  await requireEdicaoContratos()
  const contratoId = texto(formData, "contrato_id")
  const ordemId = texto(formData, "ordem_id")
  if (!contratoId || !ordemId) return { erro: "Ordem inválida." }
  const { erro } = await excluirOrdemContrato(contratoId, ordemId)
  if (erro) return { erro }
  revalidar(contratoId)
  revalidatePath("/painel/financeiro/ordens")
  revalidatePath("/painel/compras/avaliacoes")
  redirect(`/painel/compras/contratos/${contratoId}?ordemExcluida=1`)
}

/** Autoriza o contrato: as parcelas recorrentes passam a nascer autorizadas. */
export async function autorizarContratoAction(
  _prev: EstadoForm,
  formData: FormData
): Promise<EstadoForm> {
  const sessao = await requirePermissao("aquisicoes_contratos_autorizacao")
  const id = texto(formData, "contrato_id")
  if (!id) return { erro: "Contrato inválido." }
  const { erro, parcelas } = await autorizarContrato(id, sessao.usuario.id)
  if (erro) return { erro }
  revalidar(id)
  revalidatePath("/painel/financeiro/ordens")
  redirect(`/painel/compras/contratos/${id}?autorizado=${parcelas ?? 0}`)
}

/** Parcela ↔ pagamento avulso: corrige a natureza de uma ordem do contrato. */
export async function classificarOrdemContratoAction(
  _prev: EstadoForm,
  formData: FormData
): Promise<EstadoForm> {
  await requireEdicaoContratos()
  const contratoId = texto(formData, "contrato_id")
  const ordemId = texto(formData, "ordem_id")
  const natureza = texto(formData, "natureza")
  if (!contratoId || !ordemId || (natureza !== "parcela" && natureza !== "avulso")) return { erro: "Ordem inválida." }
  const { erro } = await classificarOrdemContrato(contratoId, ordemId, natureza)
  if (erro) return { erro }
  revalidar(contratoId)
  return { ok: natureza === "parcela" ? "Agora é parcela do contrato." : "Agora é pagamento avulso." }
}

/** Finaliza o contrato (cumprido, rescindido, substituído) — não é "vencido". */
export async function finalizarContratoAction(
  _prev: EstadoForm,
  formData: FormData
): Promise<EstadoForm> {
  await requireEdicaoContratos()
  const id = texto(formData, "contrato_id")
  if (!id) return { erro: "Contrato inválido." }
  const data = texto(formData, "data")
  if (!/^\d{4}-\d{2}-\d{2}$/.test(data)) return { erro: "Informe a data da finalização." }
  const motivo = texto(formData, "motivo")
  if (!(MOTIVOS_FINALIZACAO_CONTRATO as readonly string[]).includes(motivo)) return { erro: "Escolha o motivo." }
  const observacao = texto(formData, "observacao").replace(/\s+/g, " ").slice(0, 500)
  if (motivo === "Outro motivo" && observacao.length < 5) return { erro: "Explique o motivo da finalização." }
  const { erro, excluidas, emAberto } = await finalizarContrato(id, {
    data,
    motivo: observacao ? `${motivo} — ${observacao}` : motivo,
    excluirFuturas: texto(formData, "excluir_futuras") === "on",
  })
  if (erro) return { erro }
  revalidar(id)
  redirect(`/painel/compras/contratos/${id}?finalizado=1&excluidas=${excluidas ?? 0}&emAberto=${emAberto ?? 0}`)
}

/** Desfaz a finalização (finalizado por engano). */
export async function reabrirContratoAction(_prev: EstadoForm, formData: FormData): Promise<EstadoForm> {
  await requireEdicaoContratos()
  const id = texto(formData, "contrato_id")
  if (!id) return { erro: "Contrato inválido." }
  const { erro } = await reabrirContrato(id)
  if (erro) return { erro }
  revalidar(id)
  redirect(`/painel/compras/contratos/${id}?reaberto=1`)
}

/** Finaliza em lote os vencidos há mais de N dias sem pagamento em aberto. */
export async function finalizarContratosEmLoteAction(
  _prev: EstadoForm,
  formData: FormData
): Promise<EstadoForm> {
  await requireEdicaoContratos()
  const dias = Number(texto(formData, "dias"))
  const { erro, finalizados } = await finalizarContratosEmLote(dias, true)
  if (erro) return { erro }
  revalidatePath("/painel/compras/contratos")
  redirect(`/painel/compras/contratos?situacao=finalizados&finalizadosLote=${finalizados ?? 0}`)
}
