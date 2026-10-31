import "server-only"

import { esquemaAusente, texto } from "@/lib/db/comum"
import { destinatariosPorFornecedor, type DestinatarioOrdemCompra } from "@/lib/db/ordem-compra"
import { registrarEvento } from "@/lib/db/ordens-ciclo"
import { urlArquivoOrdem } from "@/lib/db/ordens-extrato"
import { obterOrganizacao } from "@/lib/db/organizacao"
import { enviarEmail } from "@/lib/email"
import { escaparHtml, paragrafo, textoSuave, tituloEmail } from "@/lib/email-layout"
import { formatarData, formatarMoeda } from "@/lib/formato"
import { createAdminClient } from "@/lib/supabase/admin"
import { tenantAtual } from "@/lib/tenant"

/**
 * Comprovante de pagamento ao fornecedor: na tela do processo de compra, cada
 * ordem paga com comprovante anexado (arquivo_pagamento) mostra o link e o
 * botão "Enviar ao fornecedor" — como a ordem de compra —, com o arquivo
 * anexo. O envio fica na trilha da ordem (evento comprovante_enviado); o
 * último aparece ao lado do botão.
 *
 * Quem recebe (onda 4 do plano do RPA): os contatos marcados "Recebe os
 * comprovantes de pagamento"; sem nenhum marcado, o envio manual vai aos que
 * recebem a ordem de compra. Fornecedor com o envio automático ligado
 * (empresa.comprovante_automatico) recebe o comprovante sozinho, ao ser
 * anexado à ordem paga — só nos contatos marcados para comprovantes.
 */

export type ComprovanteDaOrdem = {
  url: string
  destinatarios: DestinatarioOrdemCompra[]
  fornecedorId: string | null
  enviado: { em: string; para: string | null } | null
}

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

/** O bucket vem do prefixo do caminho (como no extrato da ordem). */
function bucketDe(caminho: string): string {
  return /^(notas|boletos|rpa-assinados|formalizacoes|faturas-cartao|guias-tributos)\//.test(caminho)
    ? "compras"
    : "comprovantes"
}

/** Contatos marcados para receber comprovantes, por fornecedor (o principal primeiro). */
async function marcadosParaComprovante(fornIds: string[]): Promise<Map<string, DestinatarioOrdemCompra[]>> {
  const mapa = new Map<string, DestinatarioOrdemCompra[]>()
  if (!fornIds.length) return mapa
  const admin = await createAdminClient()
  const { data, error } = await admin
    .from("empresa_contatos")
    .select("empresa_id, nome, email")
    .in("empresa_id", fornIds)
    .eq("recebe_comprovante", true)
    .not("email", "is", null)
    .order("principal", { ascending: false })
    .order("nome", { ascending: true })
  if (error) {
    if (!esquemaAusente(error) && error.code !== "42703") console.error("comprovante (contatos):", error.message)
    return mapa
  }
  for (const c of (data ?? []) as Record<string, unknown>[]) {
    const email = texto(c.email)?.toLowerCase()
    if (!email || !EMAIL.test(email)) continue
    const id = String(c.empresa_id)
    const lista = mapa.get(id) ?? []
    if (!lista.some((d) => d.email === email)) lista.push({ nome: texto(c.nome) ?? "", email })
    mapa.set(id, lista)
  }
  return mapa
}

/** Para o envio manual: os marcados para comprovantes; sem nenhum, os que recebem a ordem de compra. */
async function destinatariosComprovante(fornIds: string[]): Promise<Map<string, DestinatarioOrdemCompra[]>> {
  const marcados = await marcadosParaComprovante(fornIds)
  const faltam = fornIds.filter((id) => !marcados.get(id)?.length)
  if (faltam.length) {
    const daOrdemDeCompra = await destinatariosPorFornecedor(faltam)
    for (const id of faltam) marcados.set(id, daOrdemDeCompra.get(id) ?? [])
  }
  return marcados
}

type LinhaOrdem = {
  id: string
  codigo: string | null
  arquivo: string | null
  fornecedorId: string | null
  valorPago: number | null
  dataPagamento: string | null
  descricao: string | null
}

/** As ordens (de um processo de compra, quando informado) com o fornecedor que recebe o comprovante. */
async function carregarOrdens(ordemIds: string[], processoId?: string): Promise<LinhaOrdem[]> {
  const ids = ordemIds.filter((v) => /^[0-9a-f-]{36}$/i.test(v))
  if (!ids.length) return []
  const admin = await createAdminClient()
  let q = admin.from("ordens_pagamento").select("*").eq("emp_proprietaria_id", await tenantAtual()).in("id", ids)
  if (processoId) q = q.eq("processo_compra_id", processoId)
  const { data } = await q
  const linhas = (data ?? []) as Record<string, unknown>[]
  // O fornecedor do fornecimento vale primeiro (no marketplace a ordem paga a plataforma).
  const fornecimentoIds = [...new Set(linhas.map((o) => texto(o.fornecimento_id)).filter((v): v is string => !!v))]
  const fornecedorDoFornecimento = new Map<string, string>()
  if (fornecimentoIds.length) {
    const { data: fs } = await admin.from("compras_fornecimentos").select("id, fornecedor_id").in("id", fornecimentoIds)
    for (const f of (fs ?? []) as Record<string, unknown>[]) {
      const forn = texto(f.fornecedor_id)
      if (forn) fornecedorDoFornecimento.set(String(f.id), forn)
    }
  }
  return linhas.map((o) => ({
    id: String(o.id),
    codigo: texto(o.codigo),
    arquivo: texto(o.arquivo_pagamento),
    fornecedorId:
      (texto(o.fornecimento_id) ? fornecedorDoFornecimento.get(String(o.fornecimento_id)) : undefined) ??
      texto(o.beneficiario_fornecedor_id) ??
      texto(o.fornecedor_id),
    valorPago: o.valor_pago == null ? null : Number(o.valor_pago),
    dataPagamento: texto(o.data_pagamento),
    descricao: texto(o.descricao),
  }))
}

/** Para a tela do processo: o comprovante de cada ordem que o tem, com quem pode recebê-lo e o último envio. */
export async function comprovantesDasOrdens(
  processoId: string,
  ordemIds: string[]
): Promise<Map<string, ComprovanteDaOrdem>> {
  const mapa = new Map<string, ComprovanteDaOrdem>()
  const ordens = (await carregarOrdens(ordemIds, processoId)).filter((o) => o.arquivo)
  if (!ordens.length) return mapa
  const admin = await createAdminClient()
  const fornIds = [...new Set(ordens.map((o) => o.fornecedorId).filter((v): v is string => !!v))]
  const [destinatarios, eventos, urls] = await Promise.all([
    destinatariosComprovante(fornIds),
    admin
      .from("ordens_pagamento_eventos")
      .select("ordem_id, dados, created_at")
      .eq("emp_proprietaria_id", await tenantAtual())
      .eq("tipo", "comprovante_enviado")
      .in(
        "ordem_id",
        ordens.map((o) => o.id)
      )
      .order("created_at", { ascending: false }),
    Promise.all(ordens.map((o) => urlArquivoOrdem(o.arquivo))),
  ])
  if (eventos.error && !esquemaAusente(eventos.error)) console.error("comprovante (envios):", eventos.error.message)
  const ultimoEnvio = new Map<string, { em: string; para: string | null }>()
  for (const e of (eventos.data ?? []) as Record<string, unknown>[]) {
    const id = String(e.ordem_id)
    if (ultimoEnvio.has(id)) continue
    const dados = (e.dados as Record<string, unknown> | null) ?? null
    ultimoEnvio.set(id, { em: String(e.created_at), para: texto(dados?.email) })
  }
  ordens.forEach((o, i) => {
    const url = urls[i]
    if (!url) return
    mapa.set(o.id, {
      url,
      destinatarios: o.fornecedorId ? (destinatarios.get(o.fornecedorId) ?? []) : [],
      fornecedorId: o.fornecedorId,
      enviado: ultimoEnvio.get(o.id) ?? null,
    })
  })
  return mapa
}

/** O e-mail com o comprovante anexo, e o registro na trilha da ordem. */
async function enviar(
  ordem: LinhaOrdem,
  contato: DestinatarioOrdemCompra,
  mensagem: string | null,
  usuarioId: string | null,
  automatico: boolean
): Promise<{ erro?: string }> {
  const admin = await createAdminClient()
  const { data: arquivo, error } = await admin.storage.from(bucketDe(ordem.arquivo!)).download(ordem.arquivo!)
  if (error || !arquivo) return { erro: "Não foi possível ler o comprovante anexado à ordem." }
  const extensao = /\.([a-z0-9]{2,5})$/i.exec(ordem.arquivo!)?.[1]?.toLowerCase() ?? "pdf"
  const nomeArquivo = `comprovante-${(ordem.codigo ?? ordem.id.slice(0, 8)).replace(/[^\w.-]+/g, "-")}.${extensao}`

  const org = await obterOrganizacao()
  const entidade = org?.nomeRazao ?? org?.nomeFantasia ?? "Entidade"
  const ok = await enviarEmail({
    email: contato.email,
    nome: contato.nome || contato.email,
    assunto: `Comprovante de pagamento${ordem.codigo ? ` — ordem ${ordem.codigo}` : ""} — ${entidade}`,
    html:
      tituloEmail("Comprovante de pagamento") +
      paragrafo(
        `${escaparHtml(entidade)} envia o <strong>comprovante do pagamento</strong>` +
          (ordem.valorPago != null ? ` de <strong>${escaparHtml(formatarMoeda(ordem.valorPago))}</strong>` : "") +
          (ordem.dataPagamento ? `, feito em ${escaparHtml(formatarData(ordem.dataPagamento))}` : "") +
          ". O comprovante segue em anexo."
      ) +
      (mensagem ? paragrafo(escaparHtml(mensagem).replace(/\n/g, "<br>")) : "") +
      (ordem.descricao ? textoSuave(`Referente a: ${escaparHtml(ordem.descricao)}`) : "") +
      textoSuave("Em caso de dúvida, responda a este e-mail."),
    anexos: [{ nome: nomeArquivo, base64: Buffer.from(await arquivo.arrayBuffer()).toString("base64") }],
  })
  if (!ok) return { erro: "O e-mail não saiu — confira o endereço e tente de novo." }

  await registrarEvento(
    ordem.id,
    "comprovante_enviado",
    usuarioId,
    `${automatico ? "Enviado automaticamente" : "Enviado"} para ${contato.email}.`,
    { email: contato.email, automatico }
  )
  return {}
}

/** Envio manual, pela tela do processo de compra (um contato escolhido). */
export async function enviarComprovanteAoFornecedor(
  processoId: string,
  ordemId: string,
  destino: { email: string; mensagem: string | null },
  usuarioId: string
): Promise<{ erro?: string }> {
  const email = destino.email.trim().toLowerCase()
  const [ordem] = await carregarOrdens([ordemId], processoId)
  if (!ordem) return { erro: "Ordem não encontrada neste processo." }
  if (!ordem.arquivo) return { erro: "Esta ordem ainda não tem o comprovante de pagamento anexado." }
  if (!ordem.fornecedorId) return { erro: "A ordem não tem fornecedor para receber o comprovante." }
  const destinatarios = (await destinatariosComprovante([ordem.fornecedorId])).get(ordem.fornecedorId) ?? []
  if (!destinatarios.length) {
    return {
      erro: "O fornecedor não tem contato com e-mail marcado para receber comprovantes — cadastre um na ficha dele.",
    }
  }
  const contato = destinatarios.find((d) => d.email === email)
  if (!contato) return { erro: "Escolha um dos contatos do fornecedor." }
  return enviar(ordem, contato, destino.mensagem, usuarioId, false)
}

/**
 * Envio automático, ao anexar o comprovante à ordem paga: só se o fornecedor
 * tem o envio automático ligado, e só aos contatos marcados para comprovantes.
 * Nunca derruba quem chamou — devolve quantos e-mails saíram.
 */
export async function enviarComprovanteAutomatico(ordemId: string, usuarioId: string | null): Promise<number> {
  try {
    const [ordem] = await carregarOrdens([ordemId])
    if (!ordem?.arquivo || !ordem.fornecedorId) return 0
    const admin = await createAdminClient()
    const { data: forn, error } = await admin
      .from("empresa")
      .select("comprovante_automatico")
      .eq("id", ordem.fornecedorId)
      .maybeSingle()
    if (error || forn?.comprovante_automatico !== true) return 0
    const contatos = (await marcadosParaComprovante([ordem.fornecedorId])).get(ordem.fornecedorId) ?? []
    let enviados = 0
    for (const c of contatos) {
      const { erro } = await enviar(ordem, c, null, usuarioId, true)
      if (erro) console.error("comprovante automático:", ordem.id, erro)
      else enviados++
    }
    return enviados
  } catch (e) {
    console.error("comprovante automático:", e)
    return 0
  }
}
