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
 * botão "Enviar ao fornecedor" — como a ordem de compra. Vai aos mesmos
 * contatos (com e-mail, marcados para receber a ordem de compra), com o
 * arquivo anexo. O envio fica na trilha da ordem (evento comprovante_enviado);
 * o último aparece ao lado do botão.
 */

export type ComprovanteDaOrdem = {
  url: string
  destinatarios: DestinatarioOrdemCompra[]
  fornecedorId: string | null
  enviado: { em: string; para: string | null } | null
}

/** O bucket vem do prefixo do caminho (como no extrato da ordem). */
function bucketDe(caminho: string): string {
  return /^(notas|boletos|rpa-assinados|formalizacoes|faturas-cartao|guias-tributos)\//.test(caminho)
    ? "compras"
    : "comprovantes"
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

async function ordensDoProcesso(processoId: string, ordemIds: string[]): Promise<LinhaOrdem[]> {
  const ids = ordemIds.filter((v) => /^[0-9a-f-]{36}$/i.test(v))
  if (!ids.length) return []
  const admin = await createAdminClient()
  const { data } = await admin
    .from("ordens_pagamento")
    .select("*")
    .eq("emp_proprietaria_id", await tenantAtual())
    .eq("processo_compra_id", processoId)
    .in("id", ids)
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
  const ordens = (await ordensDoProcesso(processoId, ordemIds)).filter((o) => o.arquivo)
  if (!ordens.length) return mapa
  const admin = await createAdminClient()
  const fornIds = [...new Set(ordens.map((o) => o.fornecedorId).filter((v): v is string => !!v))]
  const [destinatarios, eventos, urls] = await Promise.all([
    destinatariosPorFornecedor(fornIds),
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

/** Envia o comprovante (anexo) ao fornecedor e registra o envio na trilha da ordem. */
export async function enviarComprovanteAoFornecedor(
  processoId: string,
  ordemId: string,
  destino: { email: string; mensagem: string | null },
  usuarioId: string
): Promise<{ erro?: string }> {
  const email = destino.email.trim().toLowerCase()
  const [ordem] = await ordensDoProcesso(processoId, [ordemId])
  if (!ordem) return { erro: "Ordem não encontrada neste processo." }
  if (!ordem.arquivo) return { erro: "Esta ordem ainda não tem o comprovante de pagamento anexado." }
  if (!ordem.fornecedorId) return { erro: "A ordem não tem fornecedor para receber o comprovante." }
  const destinatarios = (await destinatariosPorFornecedor([ordem.fornecedorId])).get(ordem.fornecedorId) ?? []
  if (!destinatarios.length) {
    return {
      erro: "O fornecedor não tem contato com e-mail marcado para receber a ordem de compra — cadastre um na ficha dele.",
    }
  }
  const contato = destinatarios.find((d) => d.email === email)
  if (!contato) return { erro: "Escolha um dos contatos do fornecedor." }

  const admin = await createAdminClient()
  const { data: arquivo, error } = await admin.storage.from(bucketDe(ordem.arquivo)).download(ordem.arquivo)
  if (error || !arquivo) return { erro: "Não foi possível ler o comprovante anexado à ordem." }
  const extensao = /\.([a-z0-9]{2,5})$/i.exec(ordem.arquivo)?.[1]?.toLowerCase() ?? "pdf"
  const nomeArquivo = `comprovante-${(ordem.codigo ?? ordem.id.slice(0, 8)).replace(/[^\w.-]+/g, "-")}.${extensao}`

  const org = await obterOrganizacao()
  const entidade = org?.nomeRazao ?? org?.nomeFantasia ?? "Entidade"
  const ok = await enviarEmail({
    email,
    nome: contato.nome || email,
    assunto: `Comprovante de pagamento${ordem.codigo ? ` — ordem ${ordem.codigo}` : ""} — ${entidade}`,
    html:
      tituloEmail("Comprovante de pagamento") +
      paragrafo(
        `${escaparHtml(entidade)} envia o <strong>comprovante do pagamento</strong>` +
          (ordem.valorPago != null ? ` de <strong>${escaparHtml(formatarMoeda(ordem.valorPago))}</strong>` : "") +
          (ordem.dataPagamento ? `, feito em ${escaparHtml(formatarData(ordem.dataPagamento))}` : "") +
          ". O comprovante segue em anexo."
      ) +
      (destino.mensagem ? paragrafo(escaparHtml(destino.mensagem).replace(/\n/g, "<br>")) : "") +
      (ordem.descricao ? textoSuave(`Referente a: ${escaparHtml(ordem.descricao)}`) : "") +
      textoSuave("Em caso de dúvida, responda a este e-mail."),
    anexos: [{ nome: nomeArquivo, base64: Buffer.from(await arquivo.arrayBuffer()).toString("base64") }],
  })
  if (!ok) return { erro: "O e-mail não saiu — confira o endereço e tente de novo." }

  await registrarEvento(ordem.id, "comprovante_enviado", usuarioId, `Enviado para ${email}.`, { email })
  return {}
}
