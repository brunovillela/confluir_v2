"use server"

import { revalidatePath } from "next/cache"
import { redirect } from "next/navigation"

import { requirePermissao, requireSessaoPainel } from "@/lib/auth"
import { type EstadoForm } from "@/lib/contas"
import {
  atenderAgendamento,
  cancelarAgendamento,
  criarAgendamento,
  editarAgendamento,
  negarAgendamento,
  registrarDevolucao,
  registrarRetirada,
} from "@/lib/db/veiculos"
import { parseValorBR } from "@/lib/valores"

/**
 * Quem faz o quê (decisão do Bruno, 2026-09-10):
 * • CONDUTOR — solicita, edita e cancela a própria solicitação no painel
 *   inicial. Basta a sessão: a aptidão (cadastro autorizado, CNH em dia) é
 *   checada na camada de dados, não por permissão do módulo.
 * • RECEPÇÃO (`veiculos_recepcao`, ou gestão) — atende/transfere veículo,
 *   nega, cancela qualquer solicitação e registra SAÍDA e ENTRADA do veículo
 *   na página do veículo.
 */

function texto(formData: FormData, campo: string): string {
  return String(formData.get(campo) ?? "").trim()
}

function dataISO(valor: string): string | null {
  return /^\d{4}-\d{2}-\d{2}$/.test(valor) ? valor : null
}

const UUID = /^[0-9a-f-]{36}$/i

/** Para onde voltar depois de salvar — só caminhos internos do painel. */
function destino(formData: FormData, padrao: string): string {
  const v = texto(formData, "voltar")
  return v.startsWith("/painel") ? v : padrao
}

function comSalvo(caminho: string): string {
  return `${caminho}${caminho.includes("?") ? "&" : "?"}salvo=1`
}

function revalidar(veiculoId?: string) {
  revalidatePath("/painel")
  revalidatePath("/painel/veiculos")
  revalidatePath("/painel/veiculos/agendamentos")
  if (veiculoId) revalidatePath(`/painel/veiculos/${veiculoId}`)
}

// ── Condutor ───────────────────────────────────────────────────────────────

export async function solicitarVeiculoAction(
  _prev: EstadoForm,
  formData: FormData
): Promise<EstadoForm> {
  const sessao = await requireSessaoPainel()
  const motivo = texto(formData, "motivo")
  const destinoViagem = texto(formData, "destino")
  const dataRetirada = dataISO(texto(formData, "data_retirada"))
  const sede = texto(formData, "sede")
  if (!motivo) return { erro: "Informe o motivo." }
  if (!destinoViagem) return { erro: "Informe o destino." }
  if (!dataRetirada) return { erro: "Informe a data de retirada." }
  if (!sede) return { erro: "Informe a sede de retirada." }

  const { erro } = await criarAgendamento({
    condutor_usuario_id: sessao.usuario.id,
    motivo,
    destino: destinoViagem,
    data_retirada: dataRetirada,
    data_retorno: dataISO(texto(formData, "data_retorno")),
    sede_retirada: sede,
  })
  if (erro) return { erro }
  revalidar()
  redirect(comSalvo(destino(formData, "/painel")))
}

export async function editarAgendamentoAction(
  _prev: EstadoForm,
  formData: FormData
): Promise<EstadoForm> {
  const sessao = await requireSessaoPainel()
  const id = texto(formData, "agendamento_id")
  const motivo = texto(formData, "motivo")
  const destinoViagem = texto(formData, "destino")
  const dataRetirada = dataISO(texto(formData, "data_retirada"))
  const sede = texto(formData, "sede")
  if (!UUID.test(id)) return { erro: "Solicitação inválida." }
  if (!motivo) return { erro: "Informe o motivo." }
  if (!destinoViagem) return { erro: "Informe o destino." }
  if (!dataRetirada) return { erro: "Informe a data de retirada." }
  if (!sede) return { erro: "Informe a sede de retirada." }

  const { erro } = await editarAgendamento(id, sessao.usuario.id, {
    motivo,
    destino: destinoViagem,
    data_retirada: dataRetirada,
    data_retorno: dataISO(texto(formData, "data_retorno")),
    sede_retirada: sede,
  })
  if (erro) return { erro }
  revalidar()
  redirect(comSalvo(destino(formData, "/painel")))
}

/** O condutor cancela a própria solicitação (fica como cancelada). */
export async function cancelarAgendamentoAction(
  _prev: EstadoForm,
  formData: FormData
): Promise<EstadoForm> {
  const sessao = await requireSessaoPainel()
  const id = texto(formData, "agendamento_id")
  if (!UUID.test(id)) return { erro: "Solicitação inválida." }
  const { erro } = await cancelarAgendamento(id, sessao.usuario.id)
  if (erro) return { erro }
  revalidar()
  redirect(comSalvo(destino(formData, "/painel")))
}

// ── Recepção ───────────────────────────────────────────────────────────────

const RECEPCAO = ["veiculos_gestao"]

/** Atende (vincula veículo) ou transfere o veículo de uma solicitação. */
export async function atenderAgendamentoAction(
  _prev: EstadoForm,
  formData: FormData
): Promise<EstadoForm> {
  const sessao = await requirePermissao("veiculos_recepcao", RECEPCAO)
  const id = texto(formData, "agendamento_id")
  const veiculoId = texto(formData, "veiculo_id")
  if (!UUID.test(id)) return { erro: "Solicitação inválida." }
  if (!UUID.test(veiculoId)) return { erro: "Escolha o veículo." }
  const { erro } = await atenderAgendamento(id, veiculoId, sessao.usuario.id)
  if (erro) return { erro }
  revalidar(veiculoId)
  redirect(comSalvo(destino(formData, "/painel/veiculos/agendamentos")))
}

export async function negarAgendamentoAction(
  _prev: EstadoForm,
  formData: FormData
): Promise<EstadoForm> {
  const sessao = await requirePermissao("veiculos_recepcao", RECEPCAO)
  const id = texto(formData, "agendamento_id")
  const motivo = texto(formData, "motivo")
  if (!UUID.test(id)) return { erro: "Solicitação inválida." }
  if (!motivo) return { erro: "Informe o motivo da negativa." }
  const { erro } = await negarAgendamento(id, sessao.usuario.id, motivo)
  if (erro) return { erro }
  revalidar()
  redirect(comSalvo(destino(formData, "/painel/veiculos/agendamentos")))
}

/** A recepção cancela qualquer solicitação em aberto; o condutor é avisado. */
export async function cancelarAgendamentoRecepcaoAction(
  _prev: EstadoForm,
  formData: FormData
): Promise<EstadoForm> {
  const sessao = await requirePermissao("veiculos_recepcao", RECEPCAO)
  const id = texto(formData, "agendamento_id")
  if (!UUID.test(id)) return { erro: "Solicitação inválida." }
  const { erro } = await cancelarAgendamento(id, sessao.usuario.id, {
    gestao: true,
    motivo: texto(formData, "motivo") || null,
  })
  if (erro) return { erro }
  revalidar()
  redirect(comSalvo(destino(formData, "/painel/veiculos/agendamentos")))
}

/** SAÍDA do veículo — registrada pela recepção na página do veículo. */
export async function registrarSaidaAction(
  _prev: EstadoForm,
  formData: FormData
): Promise<EstadoForm> {
  const sessao = await requirePermissao("veiculos_recepcao", RECEPCAO)
  const veiculoId = texto(formData, "veiculo_id")
  const condutorId = texto(formData, "condutor_usuario_id")
  const agendamentoId = texto(formData, "agendamento_id")
  const hodometro = parseValorBR(texto(formData, "hodometro"))
  const sede = texto(formData, "sede")
  if (!UUID.test(veiculoId)) return { erro: "Veículo inválido." }
  if (!UUID.test(condutorId)) return { erro: "Escolha o condutor." }
  if (hodometro === null || hodometro < 0) {
    return { erro: "Informe o hodômetro na saída." }
  }
  if (!sede) return { erro: "Informe a sede de saída." }
  const previsao = texto(formData, "previsao_retorno")
  if (previsao && !dataISO(previsao)) {
    return { erro: "Previsão de retorno inválida." }
  }

  const { erro } = await registrarRetirada({
    agendamento_id: UUID.test(agendamentoId) ? agendamentoId : null,
    veiculo_id: veiculoId,
    condutor_usuario_id: condutorId,
    hodometro,
    sede,
    motivo: texto(formData, "motivo") || null,
    destino: texto(formData, "destino") || null,
    previsao_retorno: previsao || null,
    registrado_por_id: sessao.usuario.id,
  })
  if (erro) return { erro }
  revalidar(veiculoId)
  redirect(comSalvo(destino(formData, `/painel/veiculos/${veiculoId}`)))
}

/** ENTRADA (devolução) do veículo — registrada pela recepção. */
export async function registrarEntradaAction(
  _prev: EstadoForm,
  formData: FormData
): Promise<EstadoForm> {
  await requirePermissao("veiculos_recepcao", RECEPCAO)
  const movimentacaoId = texto(formData, "movimentacao_id")
  const veiculoId = texto(formData, "veiculo_id")
  const hodometro = parseValorBR(texto(formData, "hodometro"))
  const sede = texto(formData, "sede")
  if (!UUID.test(movimentacaoId)) return { erro: "Movimentação inválida." }
  if (hodometro === null || hodometro < 0) {
    return { erro: "Informe o hodômetro na entrada." }
  }
  if (!sede) return { erro: "Informe a sede de entrada." }

  const { erro } = await registrarDevolucao({
    movimentacao_id: movimentacaoId,
    hodometro,
    sede,
    observacao: texto(formData, "observacao") || null,
  })
  if (erro) return { erro }
  revalidar(UUID.test(veiculoId) ? veiculoId : undefined)
  redirect(
    comSalvo(
      destino(
        formData,
        UUID.test(veiculoId) ? `/painel/veiculos/${veiculoId}` : "/painel/veiculos/agendamentos"
      )
    )
  )
}
