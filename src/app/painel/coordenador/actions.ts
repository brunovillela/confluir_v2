"use server"

import { revalidatePath } from "next/cache"

import { requireSessaoPainel } from "@/lib/auth"
import { type EstadoForm } from "@/lib/contas"
import { coordenaFuncionario } from "@/lib/db/coordenador"
import { avaliarSolicitacaoDiaria, buscarSolicitacaoDiaria } from "@/lib/db/diarias"
import { decidirFalta } from "@/lib/db/faltas"
import { definirAutorizacaoGozo } from "@/lib/db/ferias"
import { createAdminClient } from "@/lib/supabase/admin"
import { tenantAtual } from "@/lib/tenant"

/**
 * Decisões do coordenador sobre os pedidos da equipe. Não pedem permissão de
 * Pessoal: a autoridade vem de coordenar o departamento do funcionário
 * (`coordenaFuncionario`) — e ninguém decide o próprio pedido.
 */

const SEM_AUTORIDADE = "Só o coordenador do departamento do funcionário decide este pedido."

function revalidar() {
  revalidatePath("/painel")
  revalidatePath("/painel/pessoal/ferias")
  revalidatePath("/painel/pessoal/faltas")
  revalidatePath("/painel/pessoal/diarias")
}

export async function autorizarFeriasCoordenadorAction(
  _prev: EstadoForm,
  formData: FormData
): Promise<EstadoForm> {
  const sessao = await requireSessaoPainel()
  const gozoId = String(formData.get("id") ?? "")
  if (!gozoId) return { erro: "Pedido inválido." }
  const admin = await createAdminClient()
  const { data: g } = await admin
    .from("pessoal_ferias_gozo")
    .select("funcionario_id, autorizado")
    .eq("id", gozoId)
    .eq("emp_proprietaria_id", await tenantAtual())
    .maybeSingle()
  if (!g) return { erro: "Pedido de férias não encontrado." }
  if (g.autorizado === true) return { erro: "Estas férias já foram autorizadas." }
  if (!(await coordenaFuncionario(String(sessao.usuario.id), (g.funcionario_id as string | null) ?? null))) {
    return { erro: SEM_AUTORIDADE }
  }
  const { erro } = await definirAutorizacaoGozo(gozoId, String(sessao.usuario.id), true)
  if (erro) return { erro }
  revalidar()
  return { ok: "Férias autorizadas — o funcionário foi avisado." }
}

export async function decidirFaltaCoordenadorAction(
  _prev: EstadoForm,
  formData: FormData
): Promise<EstadoForm> {
  const sessao = await requireSessaoPainel()
  const id = String(formData.get("id") ?? "")
  const autorizar = String(formData.get("decisao") ?? "") === "autorizar"
  const motivo = String(formData.get("motivo") ?? "").trim() || null
  if (!id) return { erro: "Pedido inválido." }
  const admin = await createAdminClient()
  const { data: f } = await admin
    .from("pessoal_faltas_justificadas")
    .select("funcionario_id")
    .eq("id", id)
    .eq("emp_proprietaria_id", await tenantAtual())
    .maybeSingle()
  if (!f) return { erro: "Falta não encontrada." }
  if (!(await coordenaFuncionario(String(sessao.usuario.id), (f.funcionario_id as string | null) ?? null))) {
    return { erro: SEM_AUTORIDADE }
  }
  const { erro } = await decidirFalta(id, String(sessao.usuario.id), autorizar, motivo)
  if (erro) return { erro }
  revalidar()
  return { ok: autorizar ? "Falta justificada autorizada." : "Falta justificada recusada." }
}

export async function avaliarDiariaCoordenadorAction(
  _prev: EstadoForm,
  formData: FormData
): Promise<EstadoForm> {
  const sessao = await requireSessaoPainel()
  const id = String(formData.get("id") ?? "")
  const aprovar = String(formData.get("decisao") ?? "") === "aprovar"
  const observacao = String(formData.get("motivo") ?? "").trim() || null
  if (!id) return { erro: "Pedido inválido." }
  const d = await buscarSolicitacaoDiaria(id)
  if (!d) return { erro: "Diária não encontrada." }
  // Diária de diretor é da Diretoria (permissão própria), não da coordenação.
  if (d.beneficiarioTipo === "diretor") return { erro: "Diária de diretor é avaliada pela Diretoria." }
  if (!(await coordenaFuncionario(String(sessao.usuario.id), d.funcionario_id))) return { erro: SEM_AUTORIDADE }
  if (!aprovar && !observacao) return { erro: "Informe o motivo da reprovação." }
  const { erro } = await avaliarSolicitacaoDiaria(id, String(sessao.usuario.id), aprovar, observacao)
  if (erro) return { erro }
  revalidar()
  return { ok: aprovar ? "Diária aprovada." : "Diária reprovada." }
}
