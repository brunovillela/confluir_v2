"use server"

import { revalidatePath } from "next/cache"
import { redirect } from "next/navigation"

import { requirePermissao } from "@/lib/auth"
import {
  DATA_AO_ENTRAR,
  processoDaCondicao,
  proximaCondicao,
} from "@/lib/filiacao"
import { invalidarCacheFontes } from "@/lib/db/fontes"
import { invalidarCacheProntuarios } from "@/lib/db/prontuario"
import { createAdminClient } from "@/lib/supabase/admin"
import { tenantAtual } from "@/lib/tenant"

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

function destino(formData: FormData, fallback: string): string {
  const raw = String(formData.get("redirect_to") ?? "")
  // Só caminhos internos do painel de filiados.
  return raw.startsWith("/painel/filiados/") ? raw : fallback
}

/**
 * Avança o filiado para a próxima condição da sua trilha (filiação ou
 * desfiliação), carimba a data do marco + `condicao_desde`, e registra um
 * apontamento no prontuário para auditoria. As condições finais (Ativo/Inativo)
 * também podem ser atingidas aqui; a conferência da remessa segue sendo o outro
 * caminho para elas.
 */
export async function avancarEtapa(formData: FormData): Promise<void> {
  const sessao = await requirePermissao("filiacao_gestao")

  const filiadoId = String(formData.get("filiado_id") ?? "")
  const volta = destino(formData, "/painel/filiados/acompanhamento")
  if (!UUID.test(filiadoId)) redirect(`${volta}?etapa=erro`)

  const admin = await createAdminClient()
  const emp = await tenantAtual()

  const { data: fil } = await admin
    .from("filiacoes")
    .select("id, filiacao_condicao")
    .eq("id", filiadoId)
    .eq("emp_proprietaria_id", emp)
    .maybeSingle()
  if (!fil) redirect(`${volta}?etapa=erro`)

  const atual = fil.filiacao_condicao as string | null
  const proxima = proximaCondicao(atual)
  if (!proxima) redirect(`${volta}?etapa=fim`)

  const agora = new Date().toISOString()
  const patch: Record<string, unknown> = {
    filiacao_condicao: proxima,
    condicao_desde: agora,
  }
  const colData = DATA_AO_ENTRAR[proxima]
  if (colData) patch[colData] = agora

  const { error } = await admin
    .from("filiacoes")
    .update(patch)
    .eq("id", filiadoId)
    .eq("emp_proprietaria_id", emp)
  if (error) redirect(`${volta}?etapa=erro`)

  // Trilha de auditoria no prontuário (best-effort — não bloqueia o avanço).
  await admin.from("filiacao_prontuario").insert({
    filiacao_id: filiadoId,
    data: agora,
    tipo:
      processoDaCondicao(proxima) === "desfiliacao"
        ? "Desfiliação"
        : "Filiação",
    descricao: `Etapa avançada: ${atual ?? "—"} → ${proxima}`,
    diretor_funcionario_id: sessao.usuario.id,
    emp_proprietaria_id: emp,
    created_at: agora,
    modified_at: agora,
  })

  invalidarCacheFontes()
  invalidarCacheProntuarios()
  revalidatePath("/painel/filiados")
  revalidatePath("/painel/filiados/acompanhamento")
  revalidatePath("/painel/filiados/lista")
  revalidatePath(`/painel/filiados/${filiadoId}`)
  redirect(`${volta}?etapa=ok`)
}
