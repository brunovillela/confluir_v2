"use server"

import { revalidatePath } from "next/cache"
import { redirect } from "next/navigation"

import { requirePermissao } from "@/lib/auth"
import { type EstadoForm } from "@/lib/contas"
import {
  criarViagem,
  lerBeneficiarioDoForm,
  lerEventoDoForm,
  lerItensDoForm,
} from "@/lib/db/viagens"
import {
  avisarViajantePedidoPorOutro,
  concluirAtendimento,
  encerrarViagem,
  iniciarAtendimento,
  registrarReservaItem,
} from "@/lib/db/viagens-atendimento"

const CHAVE = "viagens_gestao"

/**
 * A equipe lança a viagem em nome de outra pessoa: diretor sem conta
 * (só 2 dos 35 têm login), funcionário, ou convidado de evento.
 */
export async function lancarViagem(
  _prev: EstadoForm,
  formData: FormData
): Promise<EstadoForm> {
  const sessao = await requirePermissao(CHAVE)

  const motivo = String(formData.get("motivo") ?? "").trim()
  if (!motivo) return { erro: "Descreva o motivo da viagem." }
  const lidos = lerItensDoForm(formData)
  if ("erro" in lidos) return { erro: lidos.erro }
  const evento = lerEventoDoForm(formData)
  if (formData.get("evento_id") === "__externo" && !evento.eventoExterno) {
    return { erro: "Informe o nome do evento externo." }
  }

  const quem = await lerBeneficiarioDoForm(formData)
  if ("erro" in quem) return { erro: quem.erro }

  const { erro, id } = await criarViagem({
    beneficiarioTipo: quem.beneficiarioTipo,
    beneficiarioUsuarioId: quem.beneficiarioUsuarioId,
    convidado: quem.convidado,
    solicitanteId: sessao.usuario.id as string,
    departamentoId:
      String(formData.get("departamento_id") ?? "").trim() || quem.departamentoDaPessoa,
    ...evento,
    motivo,
    itens: lidos.itens,
  })
  if (erro) return { erro }
  // Lançado pela gestão: quem viaja (com conta) fica sabendo.
  if (id) {
    await avisarViajantePedidoPorOutro(id).catch((e) =>
      console.error("Aviso a quem viaja:", e)
    )
  }

  revalidatePath("/painel/institucional/viagens", "layout")
  revalidatePath("/painel/perfil/viagens")
  redirect(`/painel/institucional/viagens/${id}?salvo=1`)
}

// ── Atendimento ────────────────────────────────────────────────────────────

function revalidarViagem(id: string) {
  revalidatePath("/painel/institucional/viagens", "layout")
  revalidatePath(`/painel/institucional/viagens/${id}`)
  revalidatePath("/painel/perfil/viagens")
  revalidatePath(`/painel/perfil/viagens/${id}`)
}

export async function iniciarAtendimentoAction(
  _prev: EstadoForm,
  formData: FormData
): Promise<EstadoForm> {
  const sessao = await requirePermissao(CHAVE)
  const id = String(formData.get("id") ?? "")
  const { erro } = await iniciarAtendimento(id, sessao.usuario.id as string)
  if (erro) return { erro }
  revalidarViagem(id)
  return { ok: "Atendimento iniciado." }
}

export async function salvarReservaAction(
  _prev: EstadoForm,
  formData: FormData
): Promise<EstadoForm> {
  const sessao = await requirePermissao(CHAVE)
  // "1.234,56" (com vírgula: ponto é milhar) ou "1234.56" (só ponto: decimal).
  const valorBruto = String(formData.get("valor") ?? "").replace(/\s|R\$/g, "")
  const valor = valorBruto
    ? Number(
        valorBruto.includes(",")
          ? valorBruto.replace(/\./g, "").replace(",", ".")
          : valorBruto
      )
    : null
  const voucher = formData.get("voucher")
  const { erro, viagemId } = await registrarReservaItem(
    String(formData.get("item_id") ?? ""),
    {
      fornecedorId: String(formData.get("fornecedor_id") ?? "").trim() || null,
      localizador: String(formData.get("localizador") ?? "").trim() || null,
      reservaDescricao: String(formData.get("reserva_descricao") ?? "").trim() || null,
      valor,
      voucher: voucher instanceof File ? voucher : null,
      removerVoucher: formData.get("remover_voucher") === "on",
    },
    sessao.usuario.id as string
  )
  if (erro) return { erro }
  if (viagemId) revalidarViagem(viagemId)
  return { ok: "Reserva gravada." }
}

export async function concluirAtendimentoAction(
  _prev: EstadoForm,
  formData: FormData
): Promise<EstadoForm> {
  const sessao = await requirePermissao(CHAVE)
  const id = String(formData.get("id") ?? "")
  const { erro, avisados } = await concluirAtendimento(id, sessao.usuario.id as string)
  if (erro) return { erro }
  revalidarViagem(id)
  return {
    ok: avisados
      ? `Viagem atendida — ${avisados} e-mail${avisados === 1 ? "" : "s"} de aviso enviado${avisados === 1 ? "" : "s"}.`
      : "Viagem atendida. Nenhum e-mail saiu — quem viaja não tem e-mail cadastrado.",
  }
}

export async function encerrarViagemAction(
  _prev: EstadoForm,
  formData: FormData
): Promise<EstadoForm> {
  const sessao = await requirePermissao(CHAVE)
  const id = String(formData.get("id") ?? "")
  const como = formData.get("como") === "recusada" ? "recusada" : "cancelada"
  const { erro } = await encerrarViagem(
    id,
    como,
    String(formData.get("motivo") ?? ""),
    sessao.usuario.id as string
  )
  if (erro) return { erro }
  revalidarViagem(id)
  return { ok: como === "recusada" ? "Pedido recusado e avisado." : "Viagem cancelada e avisada." }
}
