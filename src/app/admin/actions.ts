"use server"

import { revalidatePath } from "next/cache"

import { type EstadoForm } from "@/lib/contas"
import { atualizarTenant, criarTenant } from "@/lib/db/plataforma"
import { requireSuperAdmin } from "@/lib/plataforma"

function texto(formData: FormData, campo: string): string {
  return String(formData.get(campo) ?? "").trim()
}

export type EstadoNovoTenant = {
  erro?: string
  ok?: string
  aviso?: string
  /** Link de definição de senha do admin — mostrar para compartilhar. */
  link?: string
  emailEnviado?: boolean
  tenantId?: string
}

export async function criarTenantAction(
  _prev: EstadoNovoTenant,
  formData: FormData
): Promise<EstadoNovoTenant> {
  await requireSuperAdmin()

  const res = await criarTenant({
    nome_razao: texto(formData, "nome_razao"),
    nome_fantasia: texto(formData, "nome_fantasia") || null,
    cnpj_cpf: texto(formData, "cnpj_cpf").replace(/\D/g, "") || null,
    slug: texto(formData, "slug"),
    plano: texto(formData, "plano") || null,
    status: texto(formData, "status") || "ativo",
    admin_nome: texto(formData, "admin_nome"),
    admin_email: texto(formData, "admin_email"),
  })
  if (res.erro) return { erro: res.erro }

  revalidatePath("/admin")
  return {
    ok: res.emailEnviado
      ? "Organização criada e convite enviado ao administrador por e-mail."
      : "Organização criada. Compartilhe o link de acesso com o administrador.",
    aviso: res.avisoConvite,
    link: res.link,
    emailEnviado: res.emailEnviado,
    tenantId: res.tenantId,
  }
}

export async function atualizarTenantAction(
  _prev: EstadoForm,
  formData: FormData
): Promise<EstadoForm> {
  await requireSuperAdmin()
  const id = texto(formData, "tenant_id")
  if (!id) return { erro: "Tenant inválido." }

  const { erro } = await atualizarTenant(id, {
    nome_razao: texto(formData, "nome_razao"),
    nome_fantasia: texto(formData, "nome_fantasia") || null,
    cnpj_cpf: texto(formData, "cnpj_cpf").replace(/\D/g, "") || null,
    slug: texto(formData, "slug"),
    plano: texto(formData, "plano") || null,
    status: texto(formData, "status") || "ativo",
  })
  if (erro) return { erro }

  revalidatePath("/admin")
  revalidatePath(`/admin/${id}`)
  return { ok: "Organização salva." }
}
