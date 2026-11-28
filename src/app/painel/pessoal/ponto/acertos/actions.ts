"use server"

import { revalidatePath } from "next/cache"
import { redirect } from "next/navigation"

import { requirePermissao } from "@/lib/auth"
import { type EstadoForm } from "@/lib/contas"
import { apagarAcerto, criarAcerto, salvarConfigAcerto } from "@/lib/db/ponto-acertos"
import { MOTIVOS_ACERTO, type AlcanceAcerto, type FaixasAcerto, type MotivoAcerto } from "@/lib/ponto-acertos"

/** Marcos de acerto do banco de horas (27/11/2026): só a gestão do Pessoal. */
const exigir = () => requirePermissao("pessoal_gestao")
const t = (f: FormData, k: string) => String(f.get(k) ?? "").trim()
const FAIXAS: FaixasAcerto[] = ["ambas", "faixa1", "faixa2"]

function faixasEMotivo(f: FormData): { faixas: FaixasAcerto; motivo: MotivoAcerto } | { erro: string; campo: string } {
  const faixas = t(f, "faixas") as FaixasAcerto
  if (!FAIXAS.includes(faixas)) return { erro: "Escolha as faixas zeradas.", campo: "faixas" }
  const motivo = t(f, "motivo") as MotivoAcerto
  if (!MOTIVOS_ACERTO.some((m) => m.chave === motivo)) return { erro: "Escolha o motivo.", campo: "motivo" }
  return { faixas, motivo }
}

export async function criarAcertoAction(_p: EstadoForm, f: FormData): Promise<EstadoForm> {
  const sessao = await exigir()
  const competencia = t(f, "competencia")
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(competencia)) return { erro: "Mês inválido." }
  const fm = faixasEMotivo(f)
  if ("erro" in fm) return fm
  const funcionarios = [...new Set(f.getAll("funcionario").map(String).filter(Boolean))]
  const elegiveis = Number.parseInt(t(f, "elegiveis"), 10) || 0
  const alcance: AlcanceAcerto = funcionarios.length === 1 ? "individual" : funcionarios.length >= elegiveis && elegiveis > 1 ? "massa" : "parcial"
  const observacao = t(f, "observacao") || null
  if (fm.motivo === "outro" && !observacao) return { erro: "Com o motivo Outro, explique na observação.", campo: "observacao" }
  const r = await criarAcerto({ competencia, ...fm, observacao, alcance }, funcionarios, String(sessao.usuario.id))
  if (r.erro || !r.id) return { erro: r.erro ?? "Falha ao gravar." }
  revalidatePath("/painel/pessoal/ponto")
  redirect(`/painel/pessoal/ponto/acertos/${r.id}?criado=1${r.avisos?.length ? `&avisos=${encodeURIComponent(r.avisos.join(" "))}` : ""}`)
}

export async function apagarAcertoAction(_p: EstadoForm, f: FormData): Promise<EstadoForm> {
  await exigir()
  const r = await apagarAcerto(t(f, "id"))
  if (r.erro) return { erro: r.erro }
  revalidatePath("/painel/pessoal/ponto")
  redirect(`/painel/pessoal/ponto?aba=acertos&desfeito=1`)
}

export async function salvarConfigAcertoAction(_p: EstadoForm, f: FormData): Promise<EstadoForm> {
  await exigir()
  const fm = faixasEMotivo(f)
  if ("erro" in fm) return fm
  const meses = [...new Set(f.getAll("mes").map((m) => Number(m)))].filter((m) => Number.isInteger(m) && m >= 1 && m <= 12).sort((a, b) => a - b)
  const r = await salvarConfigAcerto({ meses, ...fm })
  if (r.erro) return { erro: r.erro }
  revalidatePath("/painel/pessoal/ponto")
  return { ok: meses.length ? "Acerto recorrente salvo." : "Sem acerto recorrente." }
}
