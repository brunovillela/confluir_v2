"use server"

import { revalidatePath } from "next/cache"

import { requirePermissao } from "@/lib/auth"
import { type EstadoForm } from "@/lib/contas"
import {
  excluirContatoEmergencia,
  lerContatoEmergencia,
  salvarContatoEmergencia,
  type PessoaFiliada,
} from "@/lib/db/filiacao-contatos-emergencia"
import { createAdminClient } from "@/lib/supabase/admin"
import { tenantAtual } from "@/lib/tenant"

/** Contatos de emergência na ficha do filiado — só a gestão da filiação edita. */

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

async function pessoaDoFormulario(formData: FormData): Promise<PessoaFiliada | null> {
  const filiadoId = String(formData.get("filiado_id") ?? "")
  if (!UUID.test(filiadoId)) return null
  const admin = await createAdminClient()
  const { data } = await admin
    .from("filiacoes")
    .select("id, cpf")
    .eq("id", filiadoId)
    .eq("emp_proprietaria_id", await tenantAtual())
    .maybeSingle()
  return data ? { filiadoId: String(data.id), cpf: data.cpf ? String(data.cpf) : null } : null
}

export async function salvarContatoEmergenciaAction(
  _prev: EstadoForm,
  formData: FormData
): Promise<EstadoForm> {
  const sessao = await requirePermissao("filiacao_gestao")
  const pessoa = await pessoaDoFormulario(formData)
  if (!pessoa) return { erro: "Filiado não encontrado." }
  const lido = lerContatoEmergencia(formData)
  if ("erro" in lido) return { erro: lido.erro }
  const id = String(formData.get("contato_id") ?? "")
  const { erro } = await salvarContatoEmergencia({
    pessoa,
    id: UUID.test(id) ? id : null,
    dados: lido.dados,
    origem: "painel",
    usuarioId: sessao.usuario.id,
  })
  if (erro) return { erro }
  revalidatePath(`/painel/filiados/${pessoa.filiadoId}`)
  return { ok: "Contato salvo." }
}

export async function excluirContatoEmergenciaAction(
  _prev: EstadoForm,
  formData: FormData
): Promise<EstadoForm> {
  await requirePermissao("filiacao_gestao")
  const pessoa = await pessoaDoFormulario(formData)
  if (!pessoa) return { erro: "Filiado não encontrado." }
  const id = String(formData.get("contato_id") ?? "")
  if (!UUID.test(id)) return { erro: "Contato inválido." }
  const { erro } = await excluirContatoEmergencia(pessoa, id)
  if (erro) return { erro }
  revalidatePath(`/painel/filiados/${pessoa.filiadoId}`)
  return { ok: "Contato excluído." }
}
