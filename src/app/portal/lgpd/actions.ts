"use server"

import { revalidatePath } from "next/cache"
import { redirect } from "next/navigation"

import { requireSessaoPortal } from "@/lib/auth"
import { type EstadoForm } from "@/lib/contas"
import { atualizarRegistrosDoCpf } from "@/lib/db/filiado-portal"

/** Registra o aceite do termo LGPD (data de hoje em todos os registros do CPF). */
export async function registrarAceiteLgpd(
  _prev: EstadoForm,
  formData: FormData
): Promise<EstadoForm> {
  const { filiado } = await requireSessaoPortal()

  if (formData.get("li_e_aceito") !== "on") {
    return { erro: "Marque a caixa confirmando a leitura do termo." }
  }

  const hoje = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
  }).format(new Date())

  const erro = await atualizarRegistrosDoCpf(filiado.cpf, {
    tl_lgpd_data: hoje,
  })
  if (erro) return { erro }

  revalidatePath("/portal/lgpd")
  redirect("/portal/lgpd?salvo=1")
}
