"use server"

import { revalidatePath } from "next/cache"
import { redirect } from "next/navigation"

import { requireSessaoPortal } from "@/lib/auth"
import { type EstadoForm } from "@/lib/contas"
import { cpfConfiavel } from "@/lib/cpf"
import { definirComunicados } from "@/lib/db/comunicacao-descadastro"
import { atualizarRegistrosDoCpf } from "@/lib/db/filiado-portal"
import { tenantAtual } from "@/lib/tenant"

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

/** Liga ou desliga os comunicados da mala direta (todos os registros do CPF). */
export async function alterarComunicadosPortal(
  _prev: EstadoForm,
  formData: FormData
): Promise<EstadoForm> {
  const { filiado } = await requireSessaoPortal()
  const cpf = cpfConfiavel(filiado.cpf)
  if (!cpf) return { erro: "Cadastro sem CPF: fale com a secretaria." }
  const r = await definirComunicados(
    { emp: await tenantAtual(), cpf },
    formData.get("receber") === "1",
    "portal"
  )
  if (r.erro) return { erro: r.erro }
  revalidatePath("/portal/lgpd")
  redirect("/portal/lgpd?salvo=comunicados")
}
