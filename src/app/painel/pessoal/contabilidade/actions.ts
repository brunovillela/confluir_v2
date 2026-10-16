"use server"

import { revalidatePath } from "next/cache"

import { requirePermissao } from "@/lib/auth"
import { type EstadoForm } from "@/lib/contas"
import { avisarQuemPode, depoisDaResposta } from "@/lib/db/avisos"
import {
  competenciaValida,
  enviarCompetencia,
  receberCompetencia,
  rotuloCompetencia,
} from "@/lib/db/folha-movimento"

function revalidar(competencia: string) {
  revalidatePath("/painel/pessoal/contabilidade")
  revalidatePath(`/painel/pessoal/contabilidade/${competencia}`)
}

/** Quem confere envia a competência: grava a fotografia e avisa a contabilidade. */
export async function enviarCompetenciaAction(_prev: EstadoForm, formData: FormData): Promise<EstadoForm> {
  const sessao = await requirePermissao("pessoal_contabilidade_envio")
  const competencia = String(formData.get("competencia") ?? "")
  if (!competenciaValida(competencia)) return { erro: "Competência inválida." }
  const observacao = String(formData.get("observacao") ?? "").trim() || null
  const r = await enviarCompetencia(competencia, sessao.usuario.id as string, observacao)
  if (r.erro) return { erro: r.erro }
  const rotulo = rotuloCompetencia(competencia)
  depoisDaResposta(() =>
    avisarQuemPode("pessoal_contabilidade", [], {
      evento: "pendencia_contabilidade",
      texto: `Movimento da folha de ${rotulo} enviado: ${r.total} item(ns) para conferir.`,
      assunto: `Movimento da folha — ${rotulo}`,
      link: `/painel/pessoal/contabilidade/${competencia}`,
      exceto: sessao.usuario.id as string,
    })
  )
  revalidar(competencia)
  return { ok: `Competência ${rotulo} enviada à contabilidade com ${r.total} item(ns).` }
}

/** A contabilidade confirma o recebimento; quem enviou é avisado. */
export async function receberCompetenciaAction(_prev: EstadoForm, formData: FormData): Promise<EstadoForm> {
  const sessao = await requirePermissao("pessoal_contabilidade")
  const competencia = String(formData.get("competencia") ?? "")
  if (!competenciaValida(competencia)) return { erro: "Competência inválida." }
  const r = await receberCompetencia(competencia, sessao.usuario.id as string)
  if (r.erro) return { erro: r.erro }
  const rotulo = rotuloCompetencia(competencia)
  depoisDaResposta(() =>
    avisarQuemPode("pessoal_contabilidade_envio", [], {
      evento: "pendencia_contabilidade",
      texto: `A contabilidade confirmou o recebimento do movimento da folha de ${rotulo}.`,
      link: `/painel/pessoal/contabilidade/${competencia}`,
      exceto: sessao.usuario.id as string,
    })
  )
  revalidar(competencia)
  return { ok: `Recebimento de ${rotulo} registrado.` }
}
