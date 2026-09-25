"use server"

import { revalidatePath } from "next/cache"
import { redirect } from "next/navigation"

import { requirePermissao } from "@/lib/auth"
import { type EstadoForm } from "@/lib/contas"
import { diretoresParaDiaria } from "@/lib/db/diarias-diretoria"
import { funcionariosParaSelecao } from "@/lib/db/pessoal"
import { criarViagem, lerItensDoForm } from "@/lib/db/viagens"
import {
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

  const tipo = String(formData.get("beneficiario_tipo") ?? "")
  if (tipo !== "diretor" && tipo !== "funcionario" && tipo !== "convidado") {
    return { erro: "Escolha quem vai viajar." }
  }
  const motivo = String(formData.get("motivo") ?? "").trim()
  if (!motivo) return { erro: "Descreva o motivo da viagem." }
  const lidos = lerItensDoForm(formData)
  if ("erro" in lidos) return { erro: lidos.erro }

  let beneficiarioUsuarioId: string | null = null
  let convidado: Parameters<typeof criarViagem>[0]["convidado"]
  let departamentoDaPessoa: string | null = null

  if (tipo === "convidado") {
    const nome = String(formData.get("convidado_nome") ?? "").trim()
    const email = String(formData.get("convidado_email") ?? "").trim()
    if (!nome) return { erro: "Informe o nome do convidado." }
    if (!email || !email.includes("@")) {
      return { erro: "Informe o e-mail do convidado — é por ele que vai o aviso das reservas." }
    }
    const cpf = String(formData.get("convidado_cpf") ?? "").replace(/\D/g, "")
    if (cpf && cpf.length !== 11) return { erro: "O CPF do convidado deve ter 11 dígitos." }
    convidado = {
      nome,
      email,
      cpf: cpf || null,
      nascimento: String(formData.get("convidado_nascimento") ?? "").trim() || null,
      telefone: String(formData.get("convidado_telefone") ?? "").trim() || null,
    }
  } else {
    beneficiarioUsuarioId = String(formData.get("beneficiario_usuario_id") ?? "").trim() || null
    if (!beneficiarioUsuarioId) return { erro: "Escolha quem vai viajar." }
    // Confere que a pessoa é mesmo do quadro escolhido.
    if (tipo === "diretor") {
      const diretor = (await diretoresParaDiaria()).find(
        (d) => d.usuarioId === beneficiarioUsuarioId
      )
      if (!diretor) return { erro: "Esta pessoa não é diretor(a) em exercício." }
      departamentoDaPessoa = diretor.departamentoId
    } else {
      const funcionarios = await funcionariosParaSelecao()
      if (!funcionarios.some((f) => f.usuarioId === beneficiarioUsuarioId)) {
        return { erro: "Esta pessoa não é funcionário(a) com vínculo em vigor." }
      }
    }
  }

  const { erro, id } = await criarViagem({
    beneficiarioTipo: tipo,
    beneficiarioUsuarioId,
    convidado,
    solicitanteId: sessao.usuario.id as string,
    departamentoId:
      String(formData.get("departamento_id") ?? "").trim() || departamentoDaPessoa,
    eventoId: String(formData.get("evento_id") ?? "").trim() || null,
    motivo,
    itens: lidos.itens,
  })
  if (erro) return { erro }

  revalidatePath("/painel/viagens")
  revalidatePath("/painel/perfil/viagens")
  redirect(`/painel/viagens/${id}?salvo=1`)
}

// ── Atendimento ────────────────────────────────────────────────────────────

function revalidarViagem(id: string) {
  revalidatePath("/painel/viagens")
  revalidatePath(`/painel/viagens/${id}`)
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
