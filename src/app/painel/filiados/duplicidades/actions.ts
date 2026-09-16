"use server"

import { revalidatePath } from "next/cache"
import { redirect } from "next/navigation"

import { requirePermissao } from "@/lib/auth"
import { type EstadoForm } from "@/lib/contas"
import {
  CAMPOS_MESCLAGEM,
  ignorarDuplicidade,
  mesclarCadastros,
  type TipoDuplicidade,
} from "@/lib/db/filiacao-duplicidades"

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export async function mesclarAction(_prev: EstadoForm, formData: FormData): Promise<EstadoForm> {
  const sessao = await requirePermissao("filiacao_gestao")
  const principal = String(formData.get("principal") ?? "")
  const secundarios = String(formData.get("secundarios") ?? "")
    .split(",")
    .filter((id) => UUID.test(id) && id !== principal)
  if (!UUID.test(principal) || secundarios.length === 0) {
    return { erro: "Escolha o cadastro principal e ao menos um para incorporar." }
  }
  if (formData.get("confirmar") !== "on") {
    return { erro: "Confirme que conferiu que é a mesma pessoa." }
  }

  const campos: Record<string, string | null> = {}
  for (const { campo } of CAMPOS_MESCLAGEM) {
    if (!formData.has(`campo_${campo}`)) continue
    const valor = String(formData.get(`campo_${campo}`) ?? "")
    campos[campo] = valor === "" ? null : valor
  }

  const r = await mesclarCadastros({
    principal,
    secundarios,
    campos,
    usuarioId: sessao.usuario.id as string,
  })
  if (r.erro) return { erro: r.erro }

  revalidatePath("/painel/filiados")
  revalidatePath("/painel/filiados/duplicidades")
  revalidatePath("/painel/filiados/cadastros-pendentes")
  revalidatePath(`/painel/filiados/${principal}`)
  const pendentes = r.pendentes?.length ? `&pendentes=${encodeURIComponent(r.pendentes.join(","))}` : ""
  const vinculos = r.vinculosUnificados ? `&vinculos=${r.vinculosUnificados}` : ""
  redirect(`/painel/filiados/${principal}?mesclado=${secundarios.length}${vinculos}${pendentes}`)
}

export async function ignorarAction(_prev: EstadoForm, formData: FormData): Promise<EstadoForm> {
  const sessao = await requirePermissao("filiacao_gestao")
  const tipo = String(formData.get("tipo") ?? "") as TipoDuplicidade
  if (!["cpf", "matricula", "nome"].includes(tipo)) return { erro: "Grupo inválido." }
  const cadastros = String(formData.get("cadastros") ?? "").split(",").filter((id) => UUID.test(id))
  const { erro } = await ignorarDuplicidade({
    tipo,
    chave: String(formData.get("chave") ?? ""),
    cadastros,
    motivo: String(formData.get("motivo") ?? "").trim() || null,
    usuarioId: sessao.usuario.id as string,
  })
  if (erro) return { erro }
  revalidatePath("/painel/filiados/duplicidades")
  return { ok: "Grupo marcado como não duplicado." }
}
