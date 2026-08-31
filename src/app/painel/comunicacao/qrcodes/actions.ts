"use server"

import { randomBytes } from "node:crypto"

import { revalidatePath } from "next/cache"
import { redirect } from "next/navigation"

import { requirePermissao } from "@/lib/auth"
import { type EstadoForm } from "@/lib/contas"
import { createAdminClient } from "@/lib/supabase/admin"
import { tenantAtual } from "@/lib/tenant"

/**
 * Comunicação › QR Codes — escrita. QR dinâmico: o slug é o código da URL
 * curta /q/<slug>; trocar o destino ou desativar vale na hora, inclusive para
 * peças já impressas.
 */

function txt(fd: FormData, campo: string): string | null {
  const v = String(fd.get(campo) ?? "").trim()
  return v === "" ? null : v
}

/** URL de destino válida (exige http/https; aceita sem protocolo → https). */
function normalizarDestino(v: string | null): string | null {
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

/** Slug curto e legível (sem 0/O/1/l/I) — 7 chars, ~10^12 combinações. */
function gerarSlug(): string {
  const alfabeto = "abcdefghjkmnpqrstuvwxyz23456789"
  const bytes = randomBytes(7)
  let s = ""
  for (const b of bytes) s += alfabeto[b % alfabeto.length]
  return s
}

export async function criarQrCode(
  _prev: EstadoForm,
  fd: FormData
): Promise<EstadoForm> {
  const sessao = await requirePermissao("noticias")
  const titulo = txt(fd, "titulo")
  const finalidade = txt(fd, "finalidade")
  const destino = normalizarDestino(txt(fd, "destino_url"))
  if (!titulo) return { erro: "Dê um título ao QR Code." }
  if (!finalidade) return { erro: "Informe a finalidade (onde será aplicado)." }
  if (!destino) return { erro: "Informe uma URL de destino válida (ex.: https://…)." }

  const admin = await createAdminClient()
  const emp = await tenantAtual()

  // até 3 tentativas de slug (colisão é raríssima)
  let qrId: string | null = null
  let ultimoErro = ""
  for (let i = 0; i < 3 && !qrId; i++) {
    const { data, error } = await admin
      .from("comunicacao_qrcodes")
      .insert({
        emp_proprietaria_id: emp,
        slug: gerarSlug(),
        titulo,
        finalidade,
        destino_url: destino,
        ativo: true,
        criado_por: sessao.usuario.id,
      })
      .select("id")
      .single()
    if (data) qrId = data.id as string
    else ultimoErro = error?.message ?? ""
  }
  if (!qrId) return { erro: `Não foi possível criar: ${ultimoErro}` }
  revalidatePath("/painel/comunicacao/qrcodes")
  redirect(`/painel/comunicacao/qrcodes/${qrId}?salvo=1`)
}

export async function atualizarQrCode(
  _prev: EstadoForm,
  fd: FormData
): Promise<EstadoForm> {
  await requirePermissao("noticias")
  const id = txt(fd, "id")
  const titulo = txt(fd, "titulo")
  const finalidade = txt(fd, "finalidade")
  const destino = normalizarDestino(txt(fd, "destino_url"))
  if (!id) return { erro: "QR Code inválido." }
  if (!titulo) return { erro: "Dê um título ao QR Code." }
  if (!finalidade) return { erro: "Informe a finalidade." }
  if (!destino) return { erro: "Informe uma URL de destino válida (ex.: https://…)." }
  const admin = await createAdminClient()
  const { error, count } = await admin
    .from("comunicacao_qrcodes")
    .update(
      {
        titulo,
        finalidade,
        destino_url: destino,
        updated_at: new Date().toISOString(),
      },
      { count: "exact" }
    )
    .eq("id", id)
    .eq("emp_proprietaria_id", await tenantAtual())
  if (error) return { erro: `Não foi possível salvar: ${error.message}` }
  if (count === 0) return { erro: "QR Code não encontrado." }
  revalidatePath(`/painel/comunicacao/qrcodes/${id}`)
  revalidatePath("/painel/comunicacao/qrcodes")
  return { ok: "QR Code salvo. A imagem não muda — só o destino do link." }
}

export async function alternarAtivoQrCode(
  _prev: EstadoForm,
  fd: FormData
): Promise<EstadoForm> {
  await requirePermissao("noticias")
  const id = txt(fd, "id")
  const ativar = fd.get("ativar") === "1"
  if (!id) return { erro: "QR Code inválido." }
  const admin = await createAdminClient()
  const { error } = await admin
    .from("comunicacao_qrcodes")
    .update({ ativo: ativar, updated_at: new Date().toISOString() })
    .eq("id", id)
    .eq("emp_proprietaria_id", await tenantAtual())
  if (error) return { erro: `Não foi possível alterar: ${error.message}` }
  revalidatePath(`/painel/comunicacao/qrcodes/${id}`)
  revalidatePath("/painel/comunicacao/qrcodes")
  return {
    ok: ativar
      ? "QR Code ativado — o link volta a redirecionar."
      : "QR Code desativado — quem escanear verá a página de aviso.",
  }
}

export async function excluirQrCode(
  _prev: EstadoForm,
  fd: FormData
): Promise<EstadoForm> {
  await requirePermissao("noticias")
  const id = txt(fd, "id")
  if (!id) return { erro: "QR Code inválido." }
  const admin = await createAdminClient()
  const { error } = await admin
    .from("comunicacao_qrcodes")
    .delete()
    .eq("id", id)
    .eq("emp_proprietaria_id", await tenantAtual())
  if (error) return { erro: `Não foi possível excluir: ${error.message}` }
  revalidatePath("/painel/comunicacao/qrcodes")
  redirect("/painel/comunicacao/qrcodes?excluido=1")
}
