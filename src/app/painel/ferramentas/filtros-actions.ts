"use server"

import { revalidatePath } from "next/cache"

import { requirePermissao } from "@/lib/auth"
import { type EstadoForm } from "@/lib/contas"
import { excluirFiltro, salvarFiltro } from "@/lib/db/filtros-salvos"
import { ehPaginaFiltro } from "@/lib/ferramentas-acompanhamento"

/** Filtros salvos de Tarefas e Demandas (Onda 4): quem vê a página salva os seus. */
export async function salvarFiltroAction(_prev: EstadoForm, formData: FormData): Promise<EstadoForm> {
  const sessao = await requirePermissao("ferramentas_tarefas", ["ferramentas_demandas"])
  const pagina = String(formData.get("pagina") ?? "")
  if (!ehPaginaFiltro(pagina)) return { erro: "Página inválida." }
  const { erro } = await salvarFiltro(String(sessao.usuario.id), {
    pagina,
    nome: String(formData.get("nome") ?? ""),
    consulta: String(formData.get("consulta") ?? ""),
    compartilhado: formData.get("compartilhado") === "1",
  })
  if (erro) return { erro }
  revalidatePath(`/painel/ferramentas/${pagina}`)
  return { ok: "Filtro salvo." }
}

export async function excluirFiltroAction(id: string): Promise<EstadoForm> {
  const sessao = await requirePermissao("ferramentas_tarefas", ["ferramentas_demandas"])
  const { erro, pagina } = await excluirFiltro(String(sessao.usuario.id), id)
  if (erro) return { erro }
  if (pagina) revalidatePath(`/painel/ferramentas/${pagina}`)
  return { ok: "Filtro apagado." }
}
