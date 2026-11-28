"use server"

import { revalidatePath } from "next/cache"
import { redirect } from "next/navigation"

import { requirePermissao } from "@/lib/auth"
import { type EstadoForm } from "@/lib/contas"
import { aplicarHorasPagas, esquecerLeituras, interpretarAmbiguas, lerEscaneados } from "@/lib/db/ponto-horas-pagas"

/** Horas extras pagas lidas do contracheque (Ponto, Fase 2 — 28/11/2026). */
const exigir = () => requirePermissao("pessoal_gestao")
const t = (f: FormData, k: string) => String(f.get(k) ?? "").trim()
const caminho = (remessa: string) => `/painel/pessoal/ponto/${remessa}/horas-pagas`

export async function aplicarHorasPagasAction(_p: EstadoForm, f: FormData): Promise<EstadoForm> {
  await exigir()
  const remessa = t(f, "remessa_id")
  const cc = t(f, "cc")
  const ids = [...new Set(f.getAll("registro").map(String).filter(Boolean))]
  if (!remessa || !cc) return { erro: "Remessa inválida." }
  if (!ids.length) return { erro: "Marque ao menos um registro." }
  let r: Awaited<ReturnType<typeof aplicarHorasPagas>>
  try {
    r = await aplicarHorasPagas(remessa, cc, ids, f.get("recalcular") === "on")
  } catch (e) {
    return { erro: (e as Error).message }
  }
  if (r.erro) return { erro: r.erro }
  revalidatePath("/painel/pessoal/ponto", "layout")
  const q = new URLSearchParams({ cc, aplicados: String(r.aplicados ?? 0) })
  if (f.get("recalcular") === "on") q.set("recalculadas", (r.recalculadas ?? []).join("|"))
  if (r.paradas?.length) q.set("parada", r.paradas.join(", "))
  redirect(`${caminho(remessa)}?${q}`)
}

export async function interpretarAmbiguasAction(_p: EstadoForm, f: FormData): Promise<EstadoForm> {
  const sessao = await exigir()
  const remessa = t(f, "remessa_id")
  const cc = t(f, "cc")
  const r = await interpretarAmbiguas(remessa, cc, String(sessao.usuario.id))
  if (r.erro) return { erro: r.erro }
  revalidatePath(caminho(remessa))
  if (!r.resolvidas) return { ok: "A IA também não achou horas e valor nessas linhas (elas não trazem a referência). Digite as horas pagas no registro." }
  return { ok: `A IA interpretou ${r.resolvidas} linha(s). Confira antes de gravar.` }
}

export async function lerEscaneadosAction(_p: EstadoForm, f: FormData): Promise<EstadoForm> {
  const sessao = await exigir()
  const remessa = t(f, "remessa_id")
  const cc = t(f, "cc")
  const r = await lerEscaneados(remessa, cc, String(sessao.usuario.id))
  if (r.erro) return { erro: r.erro }
  revalidatePath(caminho(remessa))
  return { ok: `${r.lidos} contracheque(s) lido(s) por imagem${r.falhas ? `, ${r.falhas} com falha` : ""}. Confira antes de gravar.` }
}

export async function lerDeNovoAction(_p: EstadoForm, f: FormData): Promise<EstadoForm> {
  await exigir()
  const remessa = t(f, "remessa_id")
  const cc = t(f, "cc")
  if (!cc) return { erro: "Remessa inválida." }
  await esquecerLeituras(cc)
  revalidatePath(caminho(remessa))
  return { ok: "Leituras descartadas: os contracheques foram lidos de novo pelo texto." }
}
