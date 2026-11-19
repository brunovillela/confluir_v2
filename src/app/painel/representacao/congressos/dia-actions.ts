"use server"

import { createElement } from "react"
import { revalidatePath } from "next/cache"
import { renderToBuffer } from "@react-pdf/renderer"
import QRCode from "qrcode"

import { requirePermissao } from "@/lib/auth"
import { obterCongresso, type Congresso } from "@/lib/db/congressos"
import {
  buscarNaMesa,
  codigoDaSalaAgora,
  crachasEmLote,
  credenciar,
  desfazerCredenciamento,
  desfazerTroca,
  presencaPorTexto,
  registrarPresenca,
  registrarSaida,
  segundaVia,
  substituir,
  type DadosCracha,
  type PessoaMesa,
  type ResultadoPresenca,
} from "@/lib/db/congressos-dia"
import { obterOrganizacao } from "@/lib/db/organizacao"
import { CrachasPDF } from "@/lib/pdf/cracha-congresso"

/**
 * Congressos — ações do dia do evento: mesa de credenciamento, crachás,
 * troca de suplente, porta das sessões e código da sala. Valem para quem
 * opera a mesa (`congressos_credenciamento`) e para a gestão.
 */

async function operador() {
  return requirePermissao("congressos_credenciamento", ["congressos_gestao"])
}

async function congresso(id: string): Promise<Congresso> {
  const c = await obterCongresso(id)
  if (!c) throw new Error("Congresso não encontrado.")
  return c
}

function nomeCongresso(c: Congresso) {
  return `${c.edicao ? `${c.edicao}º ` : ""}${c.nome}`
}

async function pdfDosCrachas(c: Congresso, crachas: DadosCracha[], emLote: boolean): Promise<string> {
  const org = await obterOrganizacao().catch(() => null)
  const comQr = await Promise.all(
    crachas.map(async (x) => ({
      ...x,
      qrDataUri: await QRCode.toDataURL(`CGRC:${x.codigo}`, { errorCorrectionLevel: "M", margin: 1, width: 300 }),
    }))
  )
  const buf = await renderToBuffer(
    createElement(CrachasPDF, {
      crachas: comQr,
      entidade: org?.nomeFantasia ?? org?.nomeRazao ?? null,
      congresso: nomeCongresso(c),
      emLote,
    }) as Parameters<typeof renderToBuffer>[0]
  )
  return Buffer.from(buf).toString("base64")
}

function revalidar(id: string) {
  revalidatePath(`/painel/representacao/congressos/${id}`)
}

// ── Mesa ─────────────────────────────────────────────────────────────────────

export async function buscarMesaAction(d: { congressoId: string; termo: string }): Promise<{ pessoas?: PessoaMesa[]; aviso?: string; erro?: string }> {
  await operador()
  try {
    return await buscarNaMesa(await congresso(d.congressoId), d.termo)
  } catch (e) {
    return { erro: e instanceof Error ? e.message : "Falha na busca." }
  }
}

export async function credenciarAction(d: {
  congressoId: string
  participanteId: string
  documento: boolean
  modalidade: "presencial" | "distancia"
  justificativa: string | null
}): Promise<{ erro?: string; pdf?: string; jaTinhaCracha?: boolean }> {
  const sessao = await operador()
  const c = await congresso(d.congressoId)
  const r = await credenciar(c, d.participanteId, { documentoConferido: d.documento, modalidade: d.modalidade, justificativa: d.justificativa }, sessao.usuario.id)
  if (r.erro) return { erro: r.erro }
  revalidar(c.id)
  if (r.cracha) return { pdf: await pdfDosCrachas(c, [r.cracha], false) }
  return { jaTinhaCracha: r.jaTinhaCracha }
}

export async function segundaViaAction(d: { congressoId: string; participanteId: string; motivo: string }): Promise<{ erro?: string; pdf?: string }> {
  const sessao = await operador()
  const c = await congresso(d.congressoId)
  const r = await segundaVia(c, d.participanteId, d.motivo, sessao.usuario.id)
  if (r.erro || !r.cracha) return { erro: r.erro ?? "Falha ao emitir." }
  return { pdf: await pdfDosCrachas(c, [r.cracha], false) }
}

export async function desfazerCredenciamentoAction(d: { congressoId: string; participanteId: string; motivo: string }): Promise<{ erro?: string }> {
  const sessao = await operador()
  if (!d.motivo.trim()) return { erro: "Informe o motivo." }
  const c = await congresso(d.congressoId)
  const r = await desfazerCredenciamento(c, d.participanteId, d.motivo, sessao.usuario.id)
  revalidar(c.id)
  return r
}

export async function crachasLoteAction(d: { congressoId: string }): Promise<{ erro?: string; pdf?: string; quantidade?: number }> {
  const sessao = await requirePermissao("congressos_gestao")
  const c = await congresso(d.congressoId)
  const r = await crachasEmLote(c, sessao.usuario.id)
  if (!r.crachas.length) return { erro: r.erro ?? "Todos os confirmados presenciais já têm crachá." }
  return { pdf: await pdfDosCrachas(c, r.crachas, true), quantidade: r.crachas.length, erro: r.erro }
}

// ── Troca de suplente ────────────────────────────────────────────────────────

export async function substituirAction(d: {
  congressoId: string
  titularId: string
  suplenteId: string
  autorizadoPor: string | null
  motivo: string | null
}): Promise<{ erro?: string; ok?: string }> {
  const sessao = await operador()
  const c = await congresso(d.congressoId)
  const r = await substituir(c, d.titularId, d.suplenteId, d.autorizadoPor, d.motivo, sessao.usuario.id)
  if (r.erro) return { erro: r.erro }
  revalidar(c.id)
  return { ok: "Troca registrada: o suplente passa a votar no lugar do titular." }
}

export async function desfazerTrocaAction(d: { congressoId: string; trocaId: string }): Promise<{ erro?: string }> {
  const sessao = await operador()
  const c = await congresso(d.congressoId)
  const r = await desfazerTroca(c, d.trocaId, sessao.usuario.id)
  revalidar(c.id)
  return r
}

// ── Porta e chamada ──────────────────────────────────────────────────────────

export async function presencaAction(d: {
  congressoId: string
  sessaoId: string
  texto?: string
  participanteId?: string
  metodo?: "porta" | "chamada"
  entradaEm?: string
}): Promise<ResultadoPresenca & { candidatos?: PessoaMesa[] }> {
  const sessao = await operador()
  const c = await congresso(d.congressoId)
  if (d.participanteId) {
    return registrarPresenca(c, d.sessaoId, d.participanteId, { metodo: d.metodo ?? "porta", nivel: "B" }, sessao.usuario.id, d.entradaEm)
  }
  return presencaPorTexto(c, d.sessaoId, d.texto ?? "", sessao.usuario.id, d.entradaEm)
}

export async function saidaAction(d: { congressoId: string; sessaoId: string; participanteId: string }): Promise<{ erro?: string }> {
  await operador()
  const c = await congresso(d.congressoId)
  return registrarSaida(c, d.sessaoId, d.participanteId)
}

// ── Código da sala (telão) ───────────────────────────────────────────────────

export async function codigoSalaAction(d: { congressoId: string; sessaoId: string }): Promise<{ erro?: string; qr?: string; codigo?: string; validoAte?: number }> {
  await operador()
  const c = await congresso(d.congressoId)
  const r = await codigoDaSalaAgora(c, d.sessaoId)
  if (!r) return { erro: "Sessão não encontrada." }
  const qr = await QRCode.toDataURL(r.texto, { errorCorrectionLevel: "M", margin: 1, width: 640 })
  return { qr, codigo: r.codigo, validoAte: r.validoAte }
}
