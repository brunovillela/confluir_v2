"use server"

import { revalidatePath } from "next/cache"

import { validarAssinaturasPdf } from "@/lib/assinatura-pdf"
import { requirePermissao } from "@/lib/auth"
import { type EstadoForm } from "@/lib/contas"
import { texto } from "@/lib/db/comum"
import { createAdminClient } from "@/lib/supabase/admin"
import { tenantAtual } from "@/lib/tenant"

/** Baixa o PDF assinado do Storage e grava o resultado da validação na solicitação. */
export async function reverificarAssinaturaAction(_prev: EstadoForm, fd: FormData): Promise<EstadoForm> {
  await requirePermissao("filiacao_gestao")
  const id = String(fd.get("solicitacao_id") ?? "").trim()
  if (!/^[0-9a-f-]{36}$/i.test(id)) return { erro: "Solicitação inválida." }
  const admin = await createAdminClient()
  const emp = await tenantAtual()
  const { data: s } = await admin.from("filiacao_solicitacoes").select("id, cpf, documento_assinado_url").eq("id", id).eq("emp_proprietaria_id", emp).maybeSingle()
  if (!s?.documento_assinado_url) return { erro: "Esta solicitação não tem PDF assinado." }
  const { data: arquivo, error } = await admin.storage.from("filiacao").download(String(s.documento_assinado_url))
  if (error || !arquivo) return { erro: `Não foi possível ler o PDF: ${error?.message ?? "?"}` }
  const validacao = validarAssinaturasPdf(new Uint8Array(await arquivo.arrayBuffer()), texto(s.cpf))
  const { error: e2 } = await admin.from("filiacao_solicitacoes").update({ assinatura_validacao: validacao, updated_at: new Date().toISOString() }).eq("id", id).eq("emp_proprietaria_id", emp)
  if (e2) return { erro: e2.code === "42703" || e2.code === "PGRST204" ? "Falta rodar o SQL supabase/assinatura-validacao.sql." : e2.message }
  revalidatePath(`/painel/filiados/solicitacoes/${id}`)
  return { ok: validacao.resumo }
}
