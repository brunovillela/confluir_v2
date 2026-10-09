"use server"

import { revalidatePath } from "next/cache"

import { requirePermissao } from "@/lib/auth"
import { invalidarCacheCadastrosPendentes } from "@/lib/db/filiacao-cadastros-pendentes"
import { salvarConfigSaudeCadastros } from "@/lib/db/organizacao"
import { normalizarConfigSaude } from "@/lib/saude-cadastros"

export async function salvarConfigSaudeAction(
  bruto: unknown
): Promise<{ ok?: string; erro?: string }> {
  await requirePermissao("filiacao_gestao")
  const { erro } = await salvarConfigSaudeCadastros(normalizarConfigSaude(bruto))
  if (erro) return { erro }
  invalidarCacheCadastrosPendentes()
  revalidatePath("/painel/filiados")
  revalidatePath("/painel/filiados/cadastros-pendentes")
  revalidatePath("/painel/filiados/saude-cadastros/configuracao")
  return { ok: "Configuração salva — a saúde dos cadastros já foi recalculada." }
}
