"use server"

import { revalidatePath } from "next/cache"

import { requirePermissao } from "@/lib/auth"
import { type EstadoForm } from "@/lib/contas"
import { obterPaginaLinks } from "@/lib/db/comunicacao-links"
import { createAdminClient } from "@/lib/supabase/admin"
import { tenantAtual } from "@/lib/tenant"

/**
 * Comunicação › Página de links — escrita. Uma página por tenant (config em
 * comunicacao_links_config, upsert por emp) + links ordenados.
 */

function txt(fd: FormData, campo: string): string | null {
  const v = String(fd.get(campo) ?? "").trim()
  return v === "" ? null : v
}

function normalizarUrl(v: string | null): string | null {
  if (!v) return null
  const comProtocolo = /^https?:\/\//i.test(v) ? v : `https://${v}`
  try {
    const u = new URL(comProtocolo)
    if (u.protocol !== "http:" && u.protocol !== "https:") return null
    return u.toString()
  } catch {
    return null
  }
}

function revalidar() {
  revalidatePath("/painel/comunicacao/links")
  revalidatePath("/links")
}

// ── Configuração da página ───────────────────────────────────────────────────

export async function salvarConfigLinks(
  _prev: EstadoForm,
  fd: FormData
): Promise<EstadoForm> {
  await requirePermissao("noticias")
  const admin = await createAdminClient()
  const emp = await tenantAtual()
  const { error } = await admin.from("comunicacao_links_config").upsert(
    {
      emp_proprietaria_id: emp,
      titulo: txt(fd, "titulo"),
      bio: txt(fd, "bio"),
      publicada: fd.get("publicada") === "on",
      updated_at: new Date().toISOString(),
    },
    { onConflict: "emp_proprietaria_id" }
  )
  if (error) return { erro: `Não foi possível salvar: ${error.message}` }
  revalidar()
  return { ok: "Página salva." }
}

// ── Links ────────────────────────────────────────────────────────────────────

export async function adicionarLink(
  _prev: EstadoForm,
  fd: FormData
): Promise<EstadoForm> {
  const sessao = await requirePermissao("noticias")
  const titulo = txt(fd, "titulo")
  const url = normalizarUrl(txt(fd, "url"))
  if (!titulo) return { erro: "Dê um título ao link." }
  if (!url) return { erro: "Informe uma URL válida (ex.: https://…)." }
  const { links } = await obterPaginaLinks()
  const ordem = links.reduce((m, l) => Math.max(m, l.ordem), 0) + 1
  const admin = await createAdminClient()
  const { error } = await admin.from("comunicacao_links").insert({
    emp_proprietaria_id: await tenantAtual(),
    titulo,
    descricao: txt(fd, "descricao"),
    url,
    ordem,
    ativo: true,
    criado_por: sessao.usuario.id,
  })
  if (error) return { erro: `Não foi possível adicionar: ${error.message}` }
  revalidar()
  return { ok: "Link adicionado." }
}

export async function atualizarLink(
  _prev: EstadoForm,
  fd: FormData
): Promise<EstadoForm> {
  await requirePermissao("noticias")
  const id = txt(fd, "id")
  const titulo = txt(fd, "titulo")
  const url = normalizarUrl(txt(fd, "url"))
  if (!id) return { erro: "Link inválido." }
  if (!titulo) return { erro: "Dê um título ao link." }
  if (!url) return { erro: "Informe uma URL válida (ex.: https://…)." }
  const admin = await createAdminClient()
  const { error, count } = await admin
    .from("comunicacao_links")
    .update(
      {
        titulo,
        descricao: txt(fd, "descricao"),
        url,
        updated_at: new Date().toISOString(),
      },
      { count: "exact" }
    )
    .eq("id", id)
    .eq("emp_proprietaria_id", await tenantAtual())
  if (error) return { erro: `Não foi possível salvar: ${error.message}` }
  if (count === 0) return { erro: "Link não encontrado." }
  revalidar()
  return { ok: "Link salvo." }
}

export async function alternarAtivoLink(
  _prev: EstadoForm,
  fd: FormData
): Promise<EstadoForm> {
  await requirePermissao("noticias")
  const id = txt(fd, "id")
  const ativar = fd.get("ativar") === "1"
  if (!id) return { erro: "Link inválido." }
  const admin = await createAdminClient()
  const { error } = await admin
    .from("comunicacao_links")
    .update({ ativo: ativar, updated_at: new Date().toISOString() })
    .eq("id", id)
    .eq("emp_proprietaria_id", await tenantAtual())
  if (error) return { erro: `Não foi possível alterar: ${error.message}` }
  revalidar()
  return { ok: ativar ? "Link reativado na página." : "Link oculto da página." }
}

/** Sobe/desce o link trocando a `ordem` com o vizinho. */
export async function moverLink(
  _prev: EstadoForm,
  fd: FormData
): Promise<EstadoForm> {
  await requirePermissao("noticias")
  const id = txt(fd, "id")
  const direcao = txt(fd, "direcao") // subir | descer
  if (!id || (direcao !== "subir" && direcao !== "descer")) {
    return { erro: "Movimento inválido." }
  }
  const { links } = await obterPaginaLinks()
  const i = links.findIndex((l) => l.id === id)
  if (i < 0) return { erro: "Link não encontrado." }
  const j = direcao === "subir" ? i - 1 : i + 1
  if (j < 0 || j >= links.length) return {} // já está na ponta
  const admin = await createAdminClient()
  // normaliza pela posição atual (cobre ordens duplicadas do legado)
  const novaOrdem = links.map((l, k) => ({ id: l.id, ordem: k + 1 }))
  const tmp = novaOrdem[i].ordem
  novaOrdem[i].ordem = novaOrdem[j].ordem
  novaOrdem[j].ordem = tmp
  for (const l of novaOrdem) {
    const { error } = await admin
      .from("comunicacao_links")
      .update({ ordem: l.ordem })
      .eq("id", l.id)
    if (error) return { erro: `Não foi possível reordenar: ${error.message}` }
  }
  revalidar()
  return {}
}

export async function excluirLink(
  _prev: EstadoForm,
  fd: FormData
): Promise<EstadoForm> {
  await requirePermissao("noticias")
  const id = txt(fd, "id")
  if (!id) return { erro: "Link inválido." }
  const admin = await createAdminClient()
  const { error } = await admin
    .from("comunicacao_links")
    .delete()
    .eq("id", id)
    .eq("emp_proprietaria_id", await tenantAtual())
  if (error) return { erro: `Não foi possível excluir: ${error.message}` }
  revalidar()
  return { ok: "Link excluído." }
}
