"use server"

import { revalidatePath } from "next/cache"

import { requirePermissao } from "@/lib/auth"
import { type EstadoForm } from "@/lib/contas"
import { conferenciaDoMes, obterContratoSaude } from "@/lib/db/plano-saude"
import {
  apagarFatura,
  casarLinhaManual,
  lancarCopartDaFatura,
  lerEGravarFatura,
  marcarFaturaConferida,
  obterFatura,
} from "@/lib/db/plano-saude-fatura"
import { compararFatura } from "@/lib/plano-saude-fatura"

/** Fatura do plano de saúde (25/11/2026): só a gestão do Pessoal. */
const exigir = () => requirePermissao("pessoal_gestao")
const CAMINHO = "/painel/pessoal/plano-saude/fatura"
const t = (f: FormData, k: string) => String(f.get(k) ?? "").trim()
const mesValido = (m: string) => /^\d{4}-(0[1-9]|1[0-2])$/.test(m)

async function alvo(f: FormData): Promise<{ contratoId: string; competencia: string } | { erro: string }> {
  const contratoId = t(f, "contrato_id")
  const competencia = t(f, "competencia")
  if (!mesValido(competencia)) return { erro: "Mês inválido." }
  if (!contratoId || !(await obterContratoSaude(contratoId))) return { erro: "Contrato não encontrado." }
  return { contratoId, competencia }
}

export async function lerFaturaAction(_p: EstadoForm, f: FormData): Promise<EstadoForm> {
  const sessao = await exigir()
  const a = await alvo(f)
  if ("erro" in a) return a
  const arquivo = f.get("arquivo")
  if (!(arquivo instanceof File) || arquivo.size === 0) return { erro: "Escolha o arquivo da fatura.", campo: "arquivo" }
  if (arquivo.size > 4 * 1024 * 1024) return { erro: "Arquivo grande demais: até 4 MB.", campo: "arquivo" }
  const r = await lerEGravarFatura(a.contratoId, a.competencia, arquivo, String(sessao.usuario.id))
  if (r.erro) return { erro: r.erro }
  revalidatePath(CAMINHO)
  const aviso =
    r.competenciaLida && r.competenciaLida !== a.competencia
      ? ` Atenção: a fatura parece ser de ${r.competenciaLida.slice(5, 7)}/${r.competenciaLida.slice(0, 4)}.`
      : ""
  return { ok: `Fatura lida: ${r.linhas} linhas, ${r.casadas} casadas com beneficiários.${aviso}` }
}

export async function casarLinhaAction(_p: EstadoForm, f: FormData): Promise<EstadoForm> {
  await exigir()
  const indice = Number.parseInt(t(f, "indice"), 10)
  if (!Number.isInteger(indice) || indice < 0) return { erro: "Linha inválida." }
  const r = await casarLinhaManual(t(f, "fatura_id"), indice, t(f, "beneficiario_id") || null)
  if (r.erro) return { erro: r.erro }
  revalidatePath(CAMINHO)
  return { ok: "Linha casada." }
}

export async function lancarCopartAction(_p: EstadoForm, f: FormData): Promise<EstadoForm> {
  const sessao = await exigir()
  const a = await alvo(f)
  if ("erro" in a) return a
  const [{ fatura }, { contratos }] = await Promise.all([obterFatura(a.contratoId, a.competencia), conferenciaDoMes(a.competencia)])
  if (!fatura) return { erro: "Leia a fatura antes." }
  const mes = contratos.find((c) => c.contrato.id === a.contratoId)
  const comp = compararFatura(fatura.linhas, mes?.grupos ?? [], fatura.total)
  if (comp.copartPorTitular.size === 0) return { erro: "A fatura não tem coparticipação casada com titulares do mês." }
  const r = await lancarCopartDaFatura(a.contratoId, a.competencia, comp.copartPorTitular, String(sessao.usuario.id))
  if (r.erro) return { erro: r.erro }
  revalidatePath(CAMINHO)
  revalidatePath("/painel/pessoal/plano-saude/mes")
  return { ok: `Coparticipação lançada para ${r.lancados} titular${r.lancados === 1 ? "" : "es"}.` }
}

export async function conferirFaturaAction(_p: EstadoForm, f: FormData): Promise<EstadoForm> {
  const sessao = await exigir()
  const desfazer = t(f, "desfazer") === "1"
  const r = await marcarFaturaConferida(t(f, "fatura_id"), String(sessao.usuario.id), t(f, "observacao") || null, desfazer)
  if (r.erro) return { erro: r.erro }
  revalidatePath(CAMINHO)
  return { ok: desfazer ? "Conferência desfeita." : "Fatura marcada como conferida." }
}

export async function apagarFaturaAction(_p: EstadoForm, f: FormData): Promise<EstadoForm> {
  await exigir()
  const r = await apagarFatura(t(f, "fatura_id"))
  if (r.erro) return { erro: r.erro }
  revalidatePath(CAMINHO)
  return { ok: "Fatura apagada." }
}
