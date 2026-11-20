"use server"

import { revalidatePath } from "next/cache"

import { getSessaoPainel } from "@/lib/auth"
import { motivoDeHoje, salvarMotivoDeHoje, salvarMotivoDoDia } from "@/lib/db/uso-fora-expediente"
import { rotuloMotivoUso, type JustificativaUso } from "@/lib/uso-fora-expediente"

export type MotivoDeHoje =
  | { estado: "indisponivel" }
  | { estado: "vazio" }
  | { estado: "informado"; motivo: JustificativaUso; rotulo: string }

/** O motivo do uso fora do horário que a pessoa já informou hoje. */
export async function motivoDeHojeAction(): Promise<MotivoDeHoje> {
  const sessao = await getSessaoPainel()
  if (!sessao) return { estado: "indisponivel" }
  const m = await motivoDeHoje(String(sessao.usuario.id))
  if (m === "indisponivel") return { estado: "indisponivel" }
  return m ? { estado: "informado", motivo: m, rotulo: rotuloMotivoUso(m) } : { estado: "vazio" }
}

export type EstadoMotivo = { ok?: string; erro?: string; rotulo?: string }

/** Grava (ou troca) o motivo de hoje — informado pelo próprio funcionário na faixa amarela. */
export async function salvarMotivoUsoAction(_prev: EstadoMotivo, formData: FormData): Promise<EstadoMotivo> {
  const sessao = await getSessaoPainel()
  if (!sessao) return { erro: "Sessão encerrada. Entre de novo." }
  const motivo = String(formData.get("motivo") ?? "")
  const detalhe = String(formData.get("detalhe") ?? "")
  const erro = await salvarMotivoDeHoje(String(sessao.usuario.id), motivo, detalhe)
  if (erro) return { erro }
  const rotulo = rotuloMotivoUso({ motivo: motivo as JustificativaUso["motivo"], detalhe: detalhe.trim().slice(0, 300) || null })
  return { ok: "Motivo registrado.", rotulo }
}

/** Meu perfil → Ponto: o motivo de um dia anterior (ou de hoje), dentro da janela. */
export async function salvarMotivoDoDiaAction(_prev: EstadoMotivo, formData: FormData): Promise<EstadoMotivo> {
  const sessao = await getSessaoPainel()
  if (!sessao) return { erro: "Sessão encerrada. Entre de novo." }
  const data = String(formData.get("data") ?? "")
  const motivo = String(formData.get("motivo") ?? "")
  const detalhe = String(formData.get("detalhe") ?? "")
  const erro = await salvarMotivoDoDia(String(sessao.usuario.id), data, motivo, detalhe)
  if (erro) return { erro }
  revalidatePath("/painel/perfil/ponto")
  const rotulo = rotuloMotivoUso({ motivo: motivo as JustificativaUso["motivo"], detalhe: detalhe.trim().slice(0, 300) || null })
  return { ok: "Motivo registrado.", rotulo }
}
