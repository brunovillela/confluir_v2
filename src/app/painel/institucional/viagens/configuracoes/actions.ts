"use server"

import { revalidatePath } from "next/cache"

import { requirePermissao } from "@/lib/auth"
import { type EstadoForm } from "@/lib/contas"
import { salvarConfigViagens, separarEmails } from "@/lib/db/viagens"

export async function salvarConfigViagensAction(
  _prev: EstadoForm,
  formData: FormData
): Promise<EstadoForm> {
  const sessao = await requirePermissao("viagens_gestao")
  const antecedencia = String(formData.get("antecedencia_dias") ?? "").trim()
  const { erro } = await salvarConfigViagens(
    {
      emailsAviso: separarEmails(String(formData.get("emails_aviso") ?? "")),
      antecedenciaDias: antecedencia ? Number(antecedencia) : null,
      orientacoes: String(formData.get("orientacoes") ?? "").trim() || null,
    },
    sessao.usuario.id as string
  )
  if (erro) return { erro }
  revalidatePath("/painel/institucional/viagens", "layout")
  revalidatePath("/painel/perfil/viagens")
  return { ok: "Configurações salvas." }
}
