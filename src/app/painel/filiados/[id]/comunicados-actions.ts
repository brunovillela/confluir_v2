"use server"

import { revalidatePath } from "next/cache"

import { requirePermissao } from "@/lib/auth"
import { cpfConfiavel } from "@/lib/cpf"
import { definirComunicados } from "@/lib/db/comunicacao-descadastro"
import { createAdminClient } from "@/lib/supabase/admin"
import { tenantAtual } from "@/lib/tenant"

/**
 * A secretaria marca (ou desfaz) o pedido de não receber a mala direta — por
 * exemplo, quando o filiado pede por telefone. Vale para todos os registros do CPF.
 */
export async function alterarComunicadosFichaAction(fd: FormData): Promise<void> {
  await requirePermissao("filiacao_gestao", ["comunicacao_mensagens"])
  const id = String(fd.get("filiacao_id") ?? "")
  const emp = await tenantAtual()
  const admin = await createAdminClient()
  const { data } = await admin.from("filiacoes").select("id, cpf").eq("id", id).eq("emp_proprietaria_id", emp).maybeSingle()
  if (!data) throw new Error("Cadastro não encontrado.")
  const cpf = cpfConfiavel(typeof data.cpf === "string" ? data.cpf : null) ?? `id:${data.id}`
  const r = await definirComunicados({ emp, cpf }, fd.get("receber") === "1", "secretaria", admin)
  if (r.erro) throw new Error(r.erro)
  revalidatePath(`/painel/filiados/${id}`)
}
