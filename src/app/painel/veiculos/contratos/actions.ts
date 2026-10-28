"use server"

import { revalidatePath } from "next/cache"
import { redirect } from "next/navigation"

import { requirePermissao } from "@/lib/auth"
import { type EstadoForm } from "@/lib/contas"
import {
  criarContrato,
  editarContrato,
  finalizarContrato,
  gerarOrdemAluguel,
  prorrogarContrato,
  subirArquivoVeiculos,
} from "@/lib/db/veiculos"
import {
  anexarDocumentosOrdemAluguel,
  editarOrdemAluguel,
  excluirOrdemAluguel,
} from "@/lib/db/veiculos-locacao-ordens"
import { parseValorBR } from "@/lib/valores"

function texto(formData: FormData, campo: string): string {
  return String(formData.get(campo) ?? "").trim()
}

function arquivo(formData: FormData, campo: string): File | null {
  const f = formData.get(campo)
  return f instanceof File && f.size > 0 ? f : null
}

function dataISO(valor: string): string | null {
  return /^\d{4}-\d{2}-\d{2}$/.test(valor) ? valor : null
}

export async function criarContratoAction(
  _prev: EstadoForm,
  formData: FormData
): Promise<EstadoForm> {
  const sessao = await requirePermissao("veiculos_gestao")
  const numero = texto(formData, "numero")
  const fornecedorId = texto(formData, "fornecedor_id")
  const inicio = dataISO(texto(formData, "vigencia_inicio"))
  if (!numero) return { erro: "Informe o número do contrato na locadora." }
  if (!fornecedorId) return { erro: "Busque e selecione a locadora." }
  if (!inicio) return { erro: "Informe o início da vigência." }

  let arquivoUrl: string | null = null
  const arquivo = formData.get("arquivo_contrato")
  if (arquivo instanceof File && arquivo.size > 0) {
    const { caminho, erro } = await subirArquivoVeiculos("contratos", arquivo)
    if (erro) return { erro }
    arquivoUrl = caminho ?? null
  }

  const { id, erro } = await criarContrato({
    numero,
    fornecedor_id: fornecedorId,
    responsavel_id: texto(formData, "responsavel_id") || sessao.usuario.id,
    vigencia_inicio: inicio,
    vigencia_termino: dataISO(texto(formData, "vigencia_termino")),
    valor_mensal: parseValorBR(texto(formData, "valor_mensal")),
    finalidade: texto(formData, "finalidade") || null,
    centro_custo_id: texto(formData, "centro_custo_id") || null,
    departamento_id: texto(formData, "departamento_id") || null,
    arquivo_contrato_url: arquivoUrl,
  })
  if (erro) return { erro }
  revalidatePath("/painel/veiculos/contratos")
  redirect(`/painel/veiculos/contratos/${id}?salvo=1`)
}

export async function finalizarContratoAction(
  _prev: EstadoForm,
  formData: FormData
): Promise<EstadoForm> {
  await requirePermissao("veiculos_gestao")
  const id = texto(formData, "contrato_id")
  if (!id) return { erro: "Contrato inválido." }
  const { erro } = await finalizarContrato(id)
  if (erro) return { erro }
  revalidatePath(`/painel/veiculos/contratos/${id}`)
  revalidatePath("/painel/veiculos/contratos")
  revalidatePath("/painel/veiculos")
  redirect(`/painel/veiculos/contratos/${id}?salvo=1`)
}

export async function gerarOrdemAluguelAction(
  _prev: EstadoForm,
  formData: FormData
): Promise<EstadoForm> {
  await requirePermissao("veiculos_gestao")
  const id = texto(formData, "contrato_id")
  const de = dataISO(texto(formData, "periodo_inicio"))
  const ate = dataISO(texto(formData, "periodo_fim"))
  const valor = parseValorBR(texto(formData, "valor"))
  if (!id) return { erro: "Contrato inválido." }
  if (!de || !ate) return { erro: "Informe o período cobrado (de/até)." }
  if (ate < de) return { erro: "O fim do período é anterior ao início." }
  if (valor === null || valor <= 0) return { erro: "Informe o valor da cobrança." }

  const br = (iso: string) => iso.split("-").reverse().join("/")
  const { erro } = await gerarOrdemAluguel(id, {
    periodo: `${br(de)} a ${br(ate)}`,
    valor,
    vencimento: dataISO(texto(formData, "vencimento")),
    fatura: arquivo(formData, "fatura"),
    boleto: arquivo(formData, "boleto"),
    linhaDigitavel: texto(formData, "linha_digitavel").replace(/\D/g, "") || null,
  })
  if (erro) return { erro }
  revalidatePath(`/painel/veiculos/contratos/${id}`)
  redirect(`/painel/veiculos/contratos/${id}?salvo=1`)
}

function revalidarOrdemAluguel(contratoId: string, ordemId: string) {
  revalidatePath(`/painel/veiculos/contratos/${contratoId}`)
  revalidatePath(`/painel/financeiro/ordens/${ordemId}`)
  revalidatePath("/painel/financeiro/ordens")
}

/**
 * Edita uma cobrança da locação (descrição, valor, vencimento) ainda não paga
 * nem em processamento — mesmas travas do contrato de Compras. Mudar o valor
 * de ordem autorizada a devolve para autorização.
 */
export async function editarOrdemAluguelAction(
  _prev: EstadoForm,
  formData: FormData
): Promise<EstadoForm> {
  await requirePermissao("veiculos_gestao")
  const contratoId = texto(formData, "contrato_id")
  const ordemId = texto(formData, "ordem_id")
  if (!contratoId || !ordemId) return { erro: "Ordem inválida." }
  const valorTexto = texto(formData, "valor")
  const valor = valorTexto ? parseValorBR(valorTexto) : null
  if (valorTexto && (valor === null || valor <= 0)) return { erro: "Valor inválido." }
  const vencimento = texto(formData, "vencimento")
  if (vencimento && !dataISO(vencimento)) return { erro: "Vencimento inválido." }
  const { erro, voltouParaAutorizacao } = await editarOrdemAluguel(
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
  revalidarOrdemAluguel(contratoId, ordemId)
  return {
    ok: voltouParaAutorizacao
      ? "Ordem alterada. Como o valor mudou, ela voltou para autorização."
      : "Ordem alterada — o antes e o depois ficaram no histórico.",
  }
}

/** Exclui UMA cobrança da locação que ainda não foi paga nem está em processamento. */
export async function excluirOrdemAluguelAction(
  _prev: EstadoForm,
  formData: FormData
): Promise<EstadoForm> {
  await requirePermissao("veiculos_gestao")
  const contratoId = texto(formData, "contrato_id")
  const ordemId = texto(formData, "ordem_id")
  if (!contratoId || !ordemId) return { erro: "Ordem inválida." }
  const { erro, codigo } = await excluirOrdemAluguel(contratoId, ordemId)
  if (erro) return { erro }
  revalidarOrdemAluguel(contratoId, ordemId)
  return { ok: `Ordem ${codigo ?? ""} excluída.` }
}

/** Corrige os dados cadastrais do contrato; motivo obrigatório, antes/depois no histórico. */
export async function editarContratoAction(
  _prev: EstadoForm,
  formData: FormData
): Promise<EstadoForm> {
  const sessao = await requirePermissao("veiculos_gestao")
  const id = texto(formData, "contrato_id")
  const numero = texto(formData, "numero")
  const fornecedorId = texto(formData, "fornecedor_id")
  const inicio = dataISO(texto(formData, "vigencia_inicio"))
  if (!id) return { erro: "Contrato inválido." }
  if (!numero) return { erro: "Informe o número do contrato na locadora." }
  if (!fornecedorId) return { erro: "Busque e selecione a locadora." }
  if (!inicio) return { erro: "Informe o início da vigência." }
  const valorTexto = texto(formData, "valor_mensal")
  const valorMensal = valorTexto ? parseValorBR(valorTexto) : null
  if (valorTexto && (valorMensal === null || valorMensal < 0)) return { erro: "Valor mensal inválido." }

  let arquivoUrl: string | null = null
  const novoArquivo = arquivo(formData, "arquivo_contrato")
  if (novoArquivo) {
    const { caminho, erro } = await subirArquivoVeiculos("contratos", novoArquivo)
    if (erro) return { erro }
    arquivoUrl = caminho ?? null
  }

  const { erro } = await editarContrato(
    id,
    {
      numero,
      fornecedor_id: fornecedorId,
      responsavel_id: texto(formData, "responsavel_id") || null,
      vigencia_inicio: inicio,
      vigencia_termino: dataISO(texto(formData, "vigencia_termino")),
      valor_mensal: valorMensal,
      finalidade: texto(formData, "finalidade") || null,
      centro_custo_id: texto(formData, "centro_custo_id") || null,
      departamento_id: texto(formData, "departamento_id") || null,
      arquivo_contrato_url: arquivoUrl,
    },
    sessao.usuario.id,
    texto(formData, "motivo")
  )
  if (erro) return { erro }
  revalidatePath(`/painel/veiculos/contratos/${id}`)
  revalidatePath("/painel/veiculos/contratos")
  revalidatePath("/painel/veiculos")
  return { ok: "Contrato alterado — o antes e o depois ficaram no histórico." }
}

/** Prorroga o contrato vigente: novo término, valor (se mudou) e aditivo. */
export async function prorrogarContratoAction(
  _prev: EstadoForm,
  formData: FormData
): Promise<EstadoForm> {
  const sessao = await requirePermissao("veiculos_gestao")
  const id = texto(formData, "contrato_id")
  const termino = dataISO(texto(formData, "novo_termino"))
  if (!id) return { erro: "Contrato inválido." }
  if (!termino) return { erro: "Informe o novo término da vigência." }
  const valorTexto = texto(formData, "novo_valor_mensal")
  const valorMensal = valorTexto ? parseValorBR(valorTexto) : null
  if (valorTexto && (valorMensal === null || valorMensal < 0)) return { erro: "Valor mensal inválido." }
  const { erro } = await prorrogarContrato(
    id,
    { termino, valorMensal, aditivo: arquivo(formData, "aditivo") },
    sessao.usuario.id,
    texto(formData, "motivo")
  )
  if (erro) return { erro }
  revalidatePath(`/painel/veiculos/contratos/${id}`)
  revalidatePath("/painel/veiculos/contratos")
  revalidatePath("/painel/veiculos")
  return { ok: "Contrato prorrogado — registrado no histórico." }
}

/** Anexa ou troca a fatura e/ou o boleto de uma cobrança ainda não paga nem em processamento. */
export async function anexarDocumentosOrdemAluguelAction(
  _prev: EstadoForm,
  formData: FormData
): Promise<EstadoForm> {
  await requirePermissao("veiculos_gestao")
  const contratoId = texto(formData, "contrato_id")
  const ordemId = texto(formData, "ordem_id")
  if (!contratoId || !ordemId) return { erro: "Ordem inválida." }
  const r = await anexarDocumentosOrdemAluguel(contratoId, ordemId, {
    fatura: arquivo(formData, "fatura"),
    boleto: arquivo(formData, "boleto"),
  })
  if (r.erro) return { erro: r.erro }
  revalidarOrdemAluguel(contratoId, ordemId)
  return { ok: r.ok }
}
