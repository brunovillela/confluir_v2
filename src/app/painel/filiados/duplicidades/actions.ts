"use server"

import { revalidatePath } from "next/cache"
import { redirect } from "next/navigation"

import { requirePermissao } from "@/lib/auth"
import { type EstadoForm } from "@/lib/contas"
import { ignorarDuplicidade, mesclarCadastros, type TipoDuplicidade } from "@/lib/db/filiacao-duplicidades"
import type { Decisao } from "@/lib/mesclagem-cadastros"

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

  let decisao: Decisao
  try {
    decisao = { ...(JSON.parse(String(formData.get("decisao") ?? "")) as Decisao), principal }
  } catch {
    return { erro: "Não foi possível ler as escolhas. Recarregue a página e tente de novo." }
  }

  const r = await mesclarCadastros({
    decisao,
    ids: [principal, ...secundarios],
    usuarioId: sessao.usuario.id as string,
  })
  if (r.erro) return { erro: r.erro }

  revalidatePath("/painel/filiados")
  revalidatePath("/painel/filiados/duplicidades")
  revalidatePath("/painel/filiados/cadastros-pendentes")
  revalidatePath(`/painel/filiados/${principal}`)
  const pendentes = r.pendentes?.length ? `&pendentes=${encodeURIComponent(r.pendentes.join(","))}` : ""
  const vinculos = r.vinculosUnificados ? `&vinculos=${r.vinculosUnificados}` : ""
  const naoUnidos = r.vinculosNaoUnificados ? `&naoUnidos=${r.vinculosNaoUnificados}` : ""
  redirect(`/painel/filiados/${principal}?mesclado=${secundarios.length}${vinculos}${naoUnidos}${pendentes}`)
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
