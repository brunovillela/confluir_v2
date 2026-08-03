"use server"

import { revalidatePath } from "next/cache"
import { redirect } from "next/navigation"

import { requirePermissao } from "@/lib/auth"
import { type EstadoForm } from "@/lib/contas"
import {
  avaliarInfracao,
  criarInfracao,
  gerarOrdemMulta,
  registrarJustificativa,
  subirArquivoVeiculos,
} from "@/lib/db/veiculos"
import { podeAcessar } from "@/lib/permissoes"
import { parseValorBR } from "@/lib/valores"
import { FORMAS_COBRANCA, type FormaCobranca } from "@/lib/veiculos-constantes"

function texto(formData: FormData, campo: string): string {
  return String(formData.get(campo) ?? "").trim()
}

function dataISO(valor: string): string | null {
  return /^\d{4}-\d{2}-\d{2}$/.test(valor) ? valor : null
}

function revalidar(id?: string) {
  revalidatePath("/painel/veiculos/infracoes")
  if (id) revalidatePath(`/painel/veiculos/infracoes/${id}`)
  revalidatePath("/painel/veiculos")
  revalidatePath("/painel/financeiro/multas")
}

export async function criarInfracaoAction(
  _prev: EstadoForm,
  formData: FormData
): Promise<EstadoForm> {
  const sessao = await requirePermissao("veiculos_gestao")
  const veiculoId = texto(formData, "veiculo_id")
  const condutorId = texto(formData, "condutor_usuario_id")
  const data = dataISO(texto(formData, "infracao_data"))
  const tipo = texto(formData, "infracao_tipo")
  const orgao = texto(formData, "orgao_autuador")
  const descricao = texto(formData, "descricao")
  if (!veiculoId) return { erro: "Escolha o veículo." }
  if (!condutorId) return { erro: "Informe o condutor infrator." }
  if (!data) return { erro: "Informe a data da infração." }
  if (!tipo) return { erro: "Informe a gravidade." }
  if (!orgao) return { erro: "Informe o órgão autuador." }
  if (!descricao) return { erro: "Descreva a infração." }

  let arquivoUrl: string | null = null
  const arquivo = formData.get("arquivo_notificacao")
  if (arquivo instanceof File && arquivo.size > 0) {
    const { caminho, erro } = await subirArquivoVeiculos(
      `infracoes/${veiculoId}`,
      arquivo
    )
    if (erro) return { erro }
    arquivoUrl = caminho ?? null
  }

  const { id, erro } = await criarInfracao({
    veiculo_id: veiculoId,
    condutor_usuario_id: condutorId,
    infracao_data: data,
    infracao_tipo: tipo,
    orgao_autuador: orgao,
    auto_de: texto(formData, "auto_de") || null,
    descricao,
    local: texto(formData, "local") || null,
    custo: parseValorBR(texto(formData, "custo")),
    arquivo_notificacao_url: arquivoUrl,
    registrado_por_id: sessao.usuario.id,
  })
  if (erro) return { erro }
  revalidar(id)
  redirect(`/painel/veiculos/infracoes/${id}?salvo=1`)
}

export async function justificarInfracaoAction(
  _prev: EstadoForm,
  formData: FormData
): Promise<EstadoForm> {
  const sessao = await requirePermissao("veiculos", ["veiculos_gestao"])
  const id = texto(formData, "infracao_id")
  const descricao = texto(formData, "descricao")
  if (!id) return { erro: "Infração inválida." }
  if (!descricao) return { erro: "Escreva a justificativa." }

  const gestor = podeAcessar(sessao.permissoes, "veiculos_gestao")
  const { erro } = await registrarJustificativa(
    id,
    sessao.usuario.id,
    descricao,
    !gestor
  )
  if (erro) return { erro }
  revalidar(id)
  redirect(`/painel/veiculos/infracoes/${id}?salvo=1`)
}

export async function avaliarInfracaoAction(
  _prev: EstadoForm,
  formData: FormData
): Promise<EstadoForm> {
  const sessao = await requirePermissao("veiculos_gestao")
  const id = texto(formData, "infracao_id")
  if (!id) return { erro: "Infração inválida." }
  const decisao = texto(formData, "decisao")
  if (decisao !== "sindical" && decisao !== "cobrar") {
    return { erro: "Escolha o resultado da avaliação." }
  }

  const formaBruta = texto(formData, "cobranca_forma")
  const forma = (FORMAS_COBRANCA as readonly string[]).includes(formaBruta)
    ? (formaBruta as FormaCobranca)
    : null

  const { erro } = await avaliarInfracao(id, sessao.usuario.id, {
    sindical: decisao === "sindical",
    cobranca_forma: decisao === "cobrar" ? forma : null,
    cobranca_valor:
      decisao === "cobrar" ? parseValorBR(texto(formData, "cobranca_valor")) : null,
    observacao: texto(formData, "observacao") || null,
  })
  if (erro) return { erro }
  revalidar(id)
  redirect(`/painel/veiculos/infracoes/${id}?salvo=1`)
}

export async function gerarOrdemMultaAction(
  _prev: EstadoForm,
  formData: FormData
): Promise<EstadoForm> {
  const sessao = await requirePermissao("veiculos_gestao")
  const id = texto(formData, "infracao_id")
  if (!id) return { erro: "Infração inválida." }

  let boletoUrl: string | null = null
  const boleto = formData.get("boleto")
  if (boleto instanceof File && boleto.size > 0) {
    const { caminho, erro } = await subirArquivoVeiculos(`boletos/${id}`, boleto)
    if (erro) return { erro }
    boletoUrl = caminho ?? null
  }

  const { erro } = await gerarOrdemMulta(
    id,
    { vencimento: dataISO(texto(formData, "vencimento")), boleto_url: boletoUrl },
    sessao.usuario.id
  )
  if (erro) return { erro }
  revalidar(id)
  redirect(`/painel/veiculos/infracoes/${id}?salvo=1`)
}
