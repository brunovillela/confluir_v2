"use server"

import { revalidatePath } from "next/cache"
import { redirect } from "next/navigation"

import { tenantAtual } from "@/lib/tenant"

import { requirePermissao } from "@/lib/auth"
import { type EstadoForm } from "@/lib/contas"
import {
  adicionarFonte,
  gerarResumo,
  removerFonte,
  salvarConfig,
  type Frequencia,
} from "@/lib/db/comunicacao"
import { gerarTextoIA, type ResultadoIA } from "@/lib/ia"

const AQUI = "/painel/comunicacao/resumo"
const FREQUENCIAS: Frequencia[] = ["diaria", "dias_uteis", "semanal", "horas"]

export async function salvarConfigAction(
  _prev: EstadoForm,
  formData: FormData
): Promise<EstadoForm> {
  await requirePermissao("noticias")

  const freqBruta = String(formData.get("frequencia") ?? "")
  const frequencia = (FREQUENCIAS as string[]).includes(freqBruta)
    ? (freqBruta as Frequencia)
    : "diaria"

  const horaBruta = String(formData.get("hora") ?? "")
  const hora = /^\d{2}:\d{2}$/.test(horaBruta) ? horaBruta : null

  const diaSemana = Number(formData.get("dia_semana"))
  const intervaloHoras = Number(formData.get("intervalo_horas"))
  const tamanho = Number(formData.get("tamanho"))
  const prompt = String(formData.get("prompt") ?? "").trim()

  if (prompt.length < 10) {
    return { erro: "Escreva o prompt que a IA vai usar no resumo." }
  }

  const { erro } = await salvarConfig({
    ativo: formData.get("ativo") === "on",
    frequencia,
    hora,
    diaSemana: Number.isInteger(diaSemana) && diaSemana >= 0 && diaSemana <= 6 ? diaSemana : null,
    intervaloHoras: Number.isInteger(intervaloHoras) && intervaloHoras > 0 ? intervaloHoras : null,
    tamanho: [1000, 2000, 3000].includes(tamanho) ? tamanho : 2000,
    prompt,
  })
  if (erro) return { erro }

  revalidatePath(AQUI)
  redirect(`${AQUI}?salvo=1`)
}

export async function adicionarFonteAction(
  _prev: EstadoForm,
  formData: FormData
): Promise<EstadoForm> {
  await requirePermissao("noticias")
  const url = String(formData.get("url") ?? "")
  const nome = String(formData.get("nome") ?? "")
  const { erro } = await adicionarFonte(url, nome)
  if (erro) return { erro }
  revalidatePath(AQUI)
  return { ok: "Site adicionado." }
}

export async function removerFonteAction(
  _prev: EstadoForm,
  formData: FormData
): Promise<EstadoForm> {
  await requirePermissao("noticias")
  const id = String(formData.get("id") ?? "")
  if (!id) return { erro: "Site inválido." }
  const { erro } = await removerFonte(id)
  if (erro) return { erro }
  revalidatePath(AQUI)
  return {}
}

export async function gerarAgoraAction(): Promise<{ erro?: string; ok?: string }> {
  await requirePermissao("noticias")
  const { erro } = await gerarResumo(await tenantAtual(), "manual")
  if (erro) return { erro }
  revalidatePath(AQUI)
  revalidatePath("/painel")
  return { ok: "Resumo gerado." }
}

const SISTEMA_MELHORAR = `Você aprimora PROMPTS de instrução dados a uma IA que gera um resumo de notícias para um sindicato.
Reescreva o prompt do usuário para ficar claro, específico e eficaz, mantendo a intenção e o idioma (português do Brasil).
Devolva APENAS o texto do prompt aprimorado — sem preâmbulo, aspas, títulos ou comentários.`

export async function melhorarPromptAction(input: {
  texto: string
}): Promise<ResultadoIA> {
  await requirePermissao("noticias")
  const t = (input.texto ?? "").trim()
  if (t.length < 10) return { erro: "Escreva o prompt antes de usar a IA." }
  return gerarTextoIA({ system: SISTEMA_MELHORAR, prompt: `Prompt atual:\n${t}` })
}
