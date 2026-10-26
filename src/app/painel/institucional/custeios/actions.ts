"use server"

import { revalidatePath } from "next/cache"
import { redirect } from "next/navigation"

import { requirePermissao } from "@/lib/auth"
import { podeAcessar } from "@/lib/permissoes"
import { type EstadoForm } from "@/lib/contas"
import {
  atualizarCusteio,
  autorizarCusteio,
  cancelarCusteio,
  criarCusteio,
  reabrirCusteioReprovado,
  meiosDoBeneficiario,
  editarOrdemCusteio,
  excluirOrdemCusteio,
  excluirOrdensCusteio,
  gerarNovasOrdensCusteio,
  meiosDoCusteio,
  reprovarCusteio,
  salvarConvidado,
  salvarFinalidade,
  salvarFormalizacaoCusteio,
  submeterCusteio,
  type DadosCusteio,
  type PagamentoCusteio,
} from "@/lib/db/custeio"
import type { EstadoComApontamentos } from "@/lib/auditoria-confirmacao"
import { DETALHE_DA_FORMA, FORMAS_ORDEM_CONTRATO, pixCodigoValido, type FormaPagamentoCompras } from "@/lib/compras-constantes"
import { TIPOS_CHAVE_PIX, TIPOS_CONTA } from "@/lib/contracheques-constantes"
import { subirComprovanteCompras } from "@/lib/db/compras"
import { saldoCaixaAberta, type ContaFornecedor, type PixFornecedor } from "@/lib/db/compras-pagamento"
import { receberDocumentoFiscal } from "@/lib/db/ordens-documento"
import { lerConfirmacao } from "@/lib/db/ordens-verificacao"
import { createAdminClient } from "@/lib/supabase/admin"
import { tenantAtual } from "@/lib/tenant"
import { type Periodicidade } from "@/lib/custeio-constantes"
import { parseValorBR } from "@/lib/valores"

function texto(formData: FormData, campo: string): string {
  return String(formData.get(campo) ?? "").trim()
}

function ouNull(v: string): string | null {
  return v || null
}

const BASE = "/painel/institucional/custeios"

function revalidar(id?: string) {
  revalidatePath(BASE)
  if (id) revalidatePath(`${BASE}/${id}`)
}

/**
 * O "para onde" do custeio, no modelo das compras: chave Pix ou conta do
 * beneficiário (uma do cadastro ou uma nova), código Pix, caixa ou boleto.
 */
async function lerPagamentoCusteio(
  formData: FormData,
  carregarMeios: () => Promise<{ pix: PixFornecedor[]; contas: ContaFornecedor[] }>,
  pontual: boolean,
  boletoAtual = false
): Promise<{ pagamento?: PagamentoCusteio; boleto?: File; erro?: string }> {
  const forma = texto(formData, "forma_pagamento")
  if (!(FORMAS_ORDEM_CONTRATO as readonly string[]).includes(forma)) {
    return { erro: "Escolha a forma de pagamento." }
  }
  const p: PagamentoCusteio = {
    forma,
    pix: null,
    tipoChavePix: null,
    banco: null,
    agencia: null,
    conta: null,
    tipoConta: null,
    favorecido: null,
    pixCodigo: null,
    caixaContaId: null,
    arquivoBoleto: null,
  }
  let boleto: File | undefined
  const escolha = texto(formData, "dados_bancarios_id")
  const meios = escolha && escolha !== "nova" ? await carregarMeios() : null
  switch (DETALHE_DA_FORMA[forma as FormaPagamentoCompras]) {
    case "pix_fornecedor": {
      if (!escolha) return { erro: "Informe a chave Pix do beneficiário." }
      if (escolha === "nova") {
        const tipoChave = texto(formData, "pix_tipo")
        const chave = texto(formData, "pix_chave")
        if (!(TIPOS_CHAVE_PIX as readonly string[]).includes(tipoChave)) return { erro: "Escolha o tipo da chave Pix." }
        if (chave.length < 5) return { erro: "Informe a chave Pix do beneficiário." }
        p.pix = chave
        p.tipoChavePix = tipoChave
      } else {
        const m = meios?.pix.find((x) => x.id === escolha)
        if (!m) return { erro: "A chave Pix escolhida não é deste beneficiário." }
        p.pix = m.chave
        p.tipoChavePix = m.tipo
      }
      break
    }
    case "conta_fornecedor": {
      if (!escolha) return { erro: "Informe a conta do beneficiário." }
      if (escolha === "nova") {
        p.banco = texto(formData, "conta_banco") || null
        p.agencia = texto(formData, "conta_agencia") || null
        p.conta = texto(formData, "conta_numero") || null
        p.tipoConta = texto(formData, "conta_tipo") || null
        p.favorecido = texto(formData, "conta_favorecido") || null
        if (!p.banco || !p.agencia || !p.conta || !p.favorecido) {
          return { erro: "Preencha banco, agência, conta e favorecido." }
        }
        if (!TIPOS_CONTA.some((t) => t.valor === p.tipoConta)) return { erro: "Escolha o tipo da conta." }
      } else {
        const m = meios?.contas.find((x) => x.id === escolha)
        if (!m) return { erro: "A conta escolhida não é deste beneficiário." }
        p.banco = m.banco
        p.agencia = m.agencia
        p.conta = m.conta
        p.tipoConta = m.tipo_conta
        p.favorecido = m.favorecido
      }
      break
    }
    case "pix_codigo":
      p.pixCodigo = texto(formData, "pix_codigo").replace(/\s/g, "") || null
      if (!p.pixCodigo || !pixCodigoValido(p.pixCodigo)) {
        return { erro: "Cole o código Pix copia e cola (começa com 000201)." }
      }
      break
    case "caixa":
      p.caixaContaId = texto(formData, "caixa_conta_id") || null
      if (!p.caixaContaId) return { erro: "Escolha uma conta de caixa aberta." }
      {
        // saldoCaixaAberta lança se a leitura falhar: vira mensagem, não tela de erro.
        const saldo = await saldoCaixaAberta(p.caixaContaId).catch(() => undefined)
        if (saldo === undefined) return { erro: "Não foi possível conferir o caixa. Tente de novo." }
        if (saldo === null) return { erro: "Escolha uma conta de caixa aberta." }
      }
      break
    case "boleto": {
      const arquivo = formData.get("boleto_arquivo")
      if (arquivo instanceof File && arquivo.size > 0) boleto = arquivo
      else if (pontual && !boletoAtual) return { erro: "Anexe o arquivo do boleto." }
      break
    }
  }
  return { pagamento: p, boleto }
}

async function lerFormalizacao(formData: FormData): Promise<File | null> {
  const arquivo = formData.get("formalizacao")
  return arquivo instanceof File && arquivo.size > 0 ? arquivo : null
}

function lerDadosCusteio(formData: FormData): DadosCusteio {
  const valorBruto = texto(formData, "valor_parcela")
  const per = texto(formData, "periodicidade")
  const periodicidade: Periodicidade = ["mensal", "anual", "unica"].includes(per)
    ? (per as Periodicidade)
    : "mensal"
  return {
    finalidadeId: texto(formData, "finalidade_id"),
    tipoBeneficiario: texto(formData, "tipo_beneficiario"),
    beneficiarioId: texto(formData, "beneficiario_id"),
    descricao: ouNull(texto(formData, "descricao")),
    evento: ouNull(texto(formData, "evento")),
    centroCustoDespesaId: ouNull(texto(formData, "centro_custo_despesa_id")),
    cadencia: texto(formData, "cadencia") === "recorrente"
      ? "recorrente"
      : "pontual",
    valorParcela: (valorBruto ? parseValorBR(valorBruto) : 0) ?? 0,
    numParcelas: Number(texto(formData, "num_parcelas")) || 1,
    periodicidade,
    primeiroVencimento: ouNull(texto(formData, "primeiro_vencimento")),
    formaPagamento: ouNull(texto(formData, "forma_pagamento")),
  }
}

// ── Custeio ──────────────────────────────────────────────────────────────────

export async function criarCusteioAction(
  _prev: EstadoForm,
  formData: FormData
): Promise<EstadoForm> {
  const sessao = await requirePermissao("custeio_institucional_edicao")
  const dados = lerDadosCusteio(formData)
  const pag = await lerPagamentoCusteio(formData, () => meiosDoBeneficiario(dados.tipoBeneficiario, dados.beneficiarioId), dados.cadencia !== "recorrente")
  if (pag.erro) return { erro: pag.erro }
  if (pag.boleto) {
    const up = await subirComprovanteCompras(`boletos/custeios/${await tenantAtual()}`, pag.boleto)
    if (up.erro || !up.caminho) return { erro: up.erro ?? "Falha ao subir o boleto." }
    pag.pagamento!.arquivoBoleto = up.caminho
  }
  const res = await criarCusteio({ ...dados, pagamento: pag.pagamento }, sessao.usuario.id)
  if ("erro" in res) return { erro: res.erro }
  const formal = await lerFormalizacao(formData)
  if (formal && res.id) {
    const r = await salvarFormalizacaoCusteio(res.id, formal)
    if ("erro" in r) {
      revalidar(res.id)
      redirect(`${BASE}/${res.id}?salvo=1&formalizacao=erro`)
    }
  }
  revalidar(res.id)
  redirect(`${BASE}/${res.id}?salvo=1`)
}

export async function atualizarCusteioAction(
  _prev: EstadoForm,
  formData: FormData
): Promise<EstadoForm> {
  await requirePermissao("custeio_institucional_edicao")
  const id = texto(formData, "custeio_id")
  if (!id) return { erro: "Custeio inválido." }
  const dados = lerDadosCusteio(formData)
  // Boleto já anexado: editar sem trocar o arquivo mantém o atual.
  const pag = await lerPagamentoCusteio(formData, () => meiosDoBeneficiario(dados.tipoBeneficiario, dados.beneficiarioId), dados.cadencia !== "recorrente", texto(formData, "boleto_atual") === "1")
  if (pag.erro) return { erro: pag.erro }
  if (pag.boleto) {
    const up = await subirComprovanteCompras(`boletos/custeios/${id}`, pag.boleto)
    if (up.erro || !up.caminho) return { erro: up.erro ?? "Falha ao subir o boleto." }
    pag.pagamento!.arquivoBoleto = up.caminho
  }
  const res = await atualizarCusteio(id, { ...dados, pagamento: pag.pagamento })
  if ("erro" in res) return { erro: res.erro }
  const formal = await lerFormalizacao(formData)
  if (formal) {
    const r = await salvarFormalizacaoCusteio(id, formal)
    if ("erro" in r) return { erro: r.erro }
  }
  revalidar(id)
  redirect(`${BASE}/${id}?salvo=1`)
}

export async function submeterCusteioAction(
  _prev: EstadoForm,
  formData: FormData
): Promise<EstadoForm> {
  await requirePermissao("custeio_institucional_edicao")
  const id = texto(formData, "custeio_id")
  if (!id) return { erro: "Custeio inválido." }
  const res = await submeterCusteio(id)
  if ("erro" in res) return { erro: res.erro }
  revalidar(id)
  redirect(`${BASE}/${id}?submetido=1`)
}

export async function autorizarCusteioAction(
  _prev: EstadoForm,
  formData: FormData
): Promise<EstadoForm> {
  const sessao = await requirePermissao("custeio_institucional_autorizacao")
  const id = texto(formData, "custeio_id")
  if (!id) return { erro: "Custeio inválido." }
  const res = await autorizarCusteio(id, sessao.usuario.id)
  if ("erro" in res) return { erro: res.erro }
  revalidar(id)
  const params = new URLSearchParams({
    geradas: String(res.geradas ?? 0),
    puladas: String(res.puladas ?? 0),
  })
  redirect(`${BASE}/${id}?${params.toString()}`)
}

export async function reprovarCusteioAction(
  _prev: EstadoForm,
  formData: FormData
): Promise<EstadoForm> {
  const sessao = await requirePermissao("custeio_institucional_autorizacao")
  const id = texto(formData, "custeio_id")
  if (!id) return { erro: "Custeio inválido." }
  const res = await reprovarCusteio(
    id,
    texto(formData, "motivo_reprovacao"),
    sessao.usuario.id
  )
  if ("erro" in res) return { erro: res.erro }
  revalidar(id)
  redirect(`${BASE}/${id}?reprovado=1`)
}

export async function cancelarCusteioAction(
  _prev: EstadoForm,
  formData: FormData
): Promise<EstadoForm> {
  const sessao = await requirePermissao("custeio_institucional_edicao")
  const id = texto(formData, "custeio_id")
  if (!id) return { erro: "Custeio inválido." }
  const res = await cancelarCusteio(
    id,
    sessao.usuario.id,
    texto(formData, "motivo"),
    podeAcessar(sessao.permissoes, "custeio_institucional_autorizacao")
  )
  if ("erro" in res) return { erro: res.erro }
  revalidar(id)
  redirect(`${BASE}/${id}?cancelado=1`)
}

export async function reabrirCusteioAction(
  _prev: EstadoForm,
  formData: FormData
): Promise<EstadoForm> {
  await requirePermissao("custeio_institucional_edicao")
  const id = texto(formData, "custeio_id")
  if (!id) return { erro: "Custeio inválido." }
  const res = await reabrirCusteioReprovado(id)
  if ("erro" in res) return { erro: res.erro }
  revalidar(id)
  redirect(`${BASE}/${id}?editar=1&reaberto=1`)
}

// ── Finalidades ──────────────────────────────────────────────────────────────

export async function salvarFinalidadeAction(
  _prev: EstadoForm,
  formData: FormData
): Promise<EstadoForm> {
  await requirePermissao("custeio_institucional_edicao")
  const res = await salvarFinalidade({
    id: ouNull(texto(formData, "finalidade_id")) ?? undefined,
    nome: texto(formData, "nome"),
    descricao: ouNull(texto(formData, "descricao")),
    tipoBeneficiarioSugerido: texto(formData, "tipo_beneficiario_sugerido"),
    centroCustoDespesaId: ouNull(texto(formData, "centro_custo_despesa_id")),
    ativa: texto(formData, "ativa") === "on",
    ordem: Number(texto(formData, "ordem")) || 0,
  })
  if ("erro" in res) return { erro: res.erro }
  revalidatePath(`${BASE}/finalidades`)
  revalidatePath(BASE)
  redirect(`${BASE}/finalidades?salvo=1`)
}

// ── Convidados ───────────────────────────────────────────────────────────────

export async function salvarConvidadoAction(
  _prev: EstadoForm,
  formData: FormData
): Promise<EstadoForm> {
  await requirePermissao("custeio_institucional_edicao")
  const res = await salvarConvidado({
    id: ouNull(texto(formData, "convidado_id")) ?? undefined,
    nome: texto(formData, "nome"),
    cpf: ouNull(texto(formData, "cpf")),
    email: ouNull(texto(formData, "email")),
    telefone: ouNull(texto(formData, "telefone")),
    banco: ouNull(texto(formData, "banco")),
    agencia: ouNull(texto(formData, "agencia")),
    conta: ouNull(texto(formData, "conta")),
    tipoConta: ouNull(texto(formData, "tipo_conta")),
    pix: ouNull(texto(formData, "pix")),
    tipoChavePix: ouNull(texto(formData, "tipo_chave_pix")),
    observacoes: ouNull(texto(formData, "observacoes")),
  })
  if ("erro" in res) return { erro: res.erro }
  revalidatePath(`${BASE}/convidados`)
  redirect(`${BASE}/convidados?salvo=1`)
}

// ── Pagamento do beneficiário, formalização, extraordinário, documento ─────

/** Chaves/contas do beneficiário para o seletor da forma ("tipo:id"). */
export async function meiosDoBeneficiarioAction(chave: string) {
  await requirePermissao("custeio_institucional_edicao")
  const [tipo, id] = chave.split(":")
  return meiosDoBeneficiario(tipo ?? "", id ?? "")
}

/** Anexa ou troca a formalização do custeio (a qualquer tempo). */
export async function salvarFormalizacaoAction(
  _prev: EstadoForm,
  formData: FormData
): Promise<EstadoForm> {
  await requirePermissao("custeio_institucional_edicao")
  const id = texto(formData, "custeio_id")
  const arquivo = await lerFormalizacao(formData)
  if (!id || !arquivo) return { erro: "Escolha o arquivo da formalização." }
  const r = await salvarFormalizacaoCusteio(id, arquivo)
  if ("erro" in r) return { erro: r.erro }
  revalidar(id)
  redirect(`${BASE}/${id}?formalizacao=1`)
}

/**
 * Novas ordens de um custeio autorizado (como o "Gerar ordens" do contrato).
 * A forma vem preenchida com a do custeio, mas pode mudar só nestas ordens.
 */
export async function gerarOrdensCusteioAction(
  _prev: EstadoComApontamentos,
  formData: FormData
): Promise<EstadoComApontamentos> {
  const sessao = await requirePermissao("custeio_institucional_edicao")
  const id = texto(formData, "custeio_id")
  if (!id) return { erro: "Custeio inválido." }
  const per = texto(formData, "periodicidade")
  const periodicidade: Periodicidade = ["mensal", "anual", "unica"].includes(per)
    ? (per as Periodicidade)
    : "mensal"
  const pag = await lerPagamentoCusteio(formData, () => meiosDoCusteio(id), false)
  if (pag.erro || !pag.pagamento) return { erro: pag.erro ?? "Escolha a forma de pagamento." }
  const boletos = formData
    .getAll("boleto_arquivo")
    .filter((a): a is File => a instanceof File && a.size > 0)
    .sort((a, b) => a.name.localeCompare(b.name, "pt-BR", { numeric: true }))
  if (pag.pagamento.forma === "Boleto" && boletos.length === 0) {
    return { erro: "Anexe os boletos, um por ordem." }
  }
  const valorBruto = texto(formData, "valor_parcela")
  const { geradas, puladas, erro, apontamentos } = await gerarNovasOrdensCusteio(
    id,
    {
      periodicidade,
      quantidade: Number(texto(formData, "quantidade")) || 1,
      valorParcela: (valorBruto ? parseValorBR(valorBruto) : 0) ?? 0,
      primeiroVencimento: texto(formData, "primeiro_vencimento"),
      motivo: texto(formData, "motivo"),
      pagamento: pag.pagamento,
      boletos,
      confirmacao: lerConfirmacao(formData),
    },
    sessao.usuario.id,
    podeAcessar(sessao.permissoes, "custeio_institucional_autorizacao")
  )
  if (apontamentos) return { apontamentos }
  if (erro) return { erro }
  revalidar(id)
  revalidatePath("/painel/financeiro/ordens")
  revalidatePath("/painel/compras/avaliacoes")
  redirect(`${BASE}/${id}?novas=${geradas ?? 0}&puladas=${puladas ?? 0}`)
}

/** Chaves e contas para as novas ordens: as do custeio primeiro, depois as do cadastro. */
export async function meiosDoCusteioAction(custeioId: string) {
  await requirePermissao("custeio_institucional_edicao")
  return meiosDoCusteio(custeioId)
}

/** Edita UMA ordem do custeio (descrição, valor, vencimento), com motivo. */
export async function editarOrdemCusteioAction(
  _prev: EstadoForm,
  formData: FormData
): Promise<EstadoForm> {
  await requirePermissao("custeio_institucional_edicao")
  const custeioId = texto(formData, "custeio_id")
  const ordemId = texto(formData, "ordem_id")
  if (!custeioId || !ordemId) return { erro: "Ordem inválida." }
  const valorTexto = texto(formData, "valor")
  const valor = valorTexto ? parseValorBR(valorTexto) : null
  if (valorTexto && (valor === null || valor <= 0)) return { erro: "Valor inválido." }
  const vencimento = texto(formData, "vencimento")
  if (vencimento && !/^\d{4}-\d{2}-\d{2}$/.test(vencimento)) return { erro: "Vencimento inválido." }
  const { erro, voltouParaAutorizacao } = await editarOrdemCusteio(
    custeioId,
    ordemId,
    { descricao: texto(formData, "descricao") || null, valor, vencimento: vencimento || null },
    texto(formData, "motivo")
  )
  if (erro) return { erro }
  revalidar(custeioId)
  revalidatePath(`/painel/financeiro/ordens/${ordemId}`)
  revalidatePath("/painel/financeiro/ordens")
  revalidatePath("/painel/compras/avaliacoes")
  return {
    ok: voltouParaAutorizacao
      ? "Ordem alterada. Como o valor mudou, ela voltou para autorização."
      : "Ordem alterada.",
  }
}

/** Exclui UMA ordem do custeio ainda não paga nem em processamento. */
export async function excluirOrdemCusteioAction(
  _prev: EstadoForm,
  formData: FormData
): Promise<EstadoForm> {
  await requirePermissao("custeio_institucional_edicao")
  const custeioId = texto(formData, "custeio_id")
  const ordemId = texto(formData, "ordem_id")
  if (!custeioId || !ordemId) return { erro: "Ordem inválida." }
  const { erro } = await excluirOrdemCusteio(custeioId, ordemId)
  if (erro) return { erro }
  revalidar(custeioId)
  revalidatePath("/painel/financeiro/ordens")
  revalidatePath("/painel/compras/avaliacoes")
  redirect(`${BASE}/${custeioId}?ordemExcluida=1`)
}

/** Exclui de uma vez ordens do custeio ainda não autorizadas. */
export async function excluirOrdensCusteioAction(
  _prev: EstadoForm,
  formData: FormData
): Promise<EstadoForm> {
  await requirePermissao("custeio_institucional_edicao")
  const id = texto(formData, "custeio_id")
  if (!id) return { erro: "Custeio inválido." }
  const { erro, excluidas, recusadas } = await excluirOrdensCusteio(
    id,
    formData.getAll("ordem_ids").map(String)
  )
  if (erro) return { erro }
  revalidar(id)
  revalidatePath("/painel/financeiro/ordens")
  revalidatePath("/painel/compras/avaliacoes")
  return {
    ok: `${excluidas} ordem(ns) excluída(s)${recusadas ? `; ${recusadas} não puderam (já autorizadas ou mudaram de situação)` : ""}.`,
  }
}

/** Documento fiscal de uma parcela do custeio que aguarda a nota. */
export async function receberDocumentoCusteioAction(
  _prev: EstadoComApontamentos,
  formData: FormData
): Promise<EstadoComApontamentos> {
  await requirePermissao("custeio_institucional_edicao")
  const custeioId = texto(formData, "custeio_id")
  const ordemId = texto(formData, "ordem_id")
  if (!custeioId || !ordemId) return { erro: "Ordem inválida." }
  const admin = await createAdminClient()
  const { data: o } = await admin
    .from("ordens_pagamento")
    .select("custeio_id")
    .eq("id", ordemId)
    .eq("emp_proprietaria_id", await tenantAtual())
    .maybeSingle()
  if (!o || String(o.custeio_id) !== custeioId) return { erro: "Ordem não encontrada neste custeio." }
  const arquivo = formData.get("nota")
  if (!(arquivo instanceof File) || arquivo.size === 0) return { erro: "Anexe o documento fiscal (PDF ou foto)." }
  const valorTexto = texto(formData, "valor")
  const valor = valorTexto ? parseValorBR(valorTexto) : null
  if (valorTexto && (valor === null || valor <= 0)) return { erro: "Valor inválido." }
  const { erro, situacao, apontamentos } = await receberDocumentoFiscal(ordemId, {
    arquivo,
    valor,
    confirmacao: lerConfirmacao(formData),
    onde: "no custeio",
  })
  if (apontamentos) return { apontamentos }
  if (erro) return { erro }
  revalidar(custeioId)
  revalidatePath("/painel/financeiro/ordens")
  revalidatePath("/painel/compras/avaliacoes")
  return {
    ok:
      situacao === "A pagar"
        ? "Documento recebido — a parcela já estava autorizada e seguiu para pagamento."
        : "Documento recebido — a ordem seguiu para autorização.",
  }
}
