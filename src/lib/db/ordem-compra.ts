import "server-only"

import { createElement } from "react"
import { renderToBuffer } from "@react-pdf/renderer"

import { esquemaAusente, nomesDosUsuarios, texto } from "@/lib/db/comum"
import { listarSedes, obterOrganizacao, enderecoDaSede } from "@/lib/db/organizacao"
import { enviarEmail } from "@/lib/email"
import { escaparHtml, paragrafo, textoSuave, tituloEmail } from "@/lib/email-layout"
import { formatarData, formatarMoeda } from "@/lib/formato"
import { OrdemCompraPDF } from "@/lib/pdf/ordem-compra"
import { createAdminClient } from "@/lib/supabase/admin"
import { tenantAtual } from "@/lib/tenant"

/**
 * Ordem de compra: o pedido formal ao fornecedor, um por fornecimento do
 * processo (cada fornecedor recebe a sua). Diz o que comprar, quanto, como
 * e quando pagar, onde e até quando entregar e para quem faturar. Sai em PDF
 * e pode ir por e-mail ao fornecedor, com o PDF anexo.
 * SQL do registro de envio: supabase/compras-ordem-compra.sql.
 */

export type DadosOrdemCompra = {
  numero: string
  emitidaEm: string
  entidade: {
    nome: string
    cnpj: string | null
    endereco: string | null
    telefones: string | null
    email: string | null
    logo: string | null
  }
  fornecedor: { nome: string; razao: string | null; documento: string | null; endereco: string | null; email: string | null }
  processoCodigo: string | null
  tipo: "Bem / produto" | "Prestação de serviço" | null
  descricao: string | null
  quantidade: string | null
  departamento: string | null
  valor: number | null
  formaPagamento: string | null
  /** Parcelas já lançadas (valor e vencimento), quando houver. */
  pagamentos: { valor: number | null; vencimento: string | null }[]
  entrega: { noAto: boolean; local: string | null; ate: string | null; prevista: string | null }
  proposta: { valor: number | null; data: string | null } | null
  comprador: string | null
  dataCompra: string | null
  enviada: { em: string; para: string | null; porNome: string | null } | null
}

/** Logo da organização (png/jpg) como data URI; ignora SVG e falhas. */
async function logoDataUri(url: string | null): Promise<string | null> {
  if (!url) return null
  try {
    const r = await fetch(url)
    if (!r.ok) return null
    const tipo = r.headers.get("content-type") ?? ""
    if (!/image\/(png|jpe?g)/.test(tipo)) return null
    return `data:${tipo};base64,${Buffer.from(await r.arrayBuffer()).toString("base64")}`
  } catch {
    return null
  }
}

export async function dadosOrdemCompra(
  processoId: string,
  fornecimentoId: string
): Promise<DadosOrdemCompra | null> {
  const admin = await createAdminClient()
  const emp = await tenantAtual()
  const [{ data: p }, { data: fs }] = await Promise.all([
    admin.from("compras_solicitacoes").select("*").eq("id", processoId).eq("emp_proprietaria_id", emp).maybeSingle(),
    admin.from("compras_fornecimentos").select("*").eq("processo_id", processoId).order("created_at", { ascending: true }),
  ])
  if (!p) return null
  const lista = (fs ?? []) as Record<string, unknown>[]
  const indice = lista.findIndex((f) => String(f.id) === fornecimentoId)
  if (indice < 0) return null
  const f = lista[indice]

  const fornecedorId = texto(f.fornecedor_id)
  const [org, sedes, fornecedor, enderecos, proposta, depto, ordens, nomes] = await Promise.all([
    obterOrganizacao(),
    listarSedes().catch(() => ({ disponivel: false, sedes: [] })),
    fornecedorId
      ? admin.from("empresa").select("nome_fantasia, nome_razao, cnpj_cpf, email_contato").eq("id", fornecedorId).maybeSingle()
      : Promise.resolve({ data: null }),
    fornecedorId
      ? admin.from("enderecos").select("logradouro, numero, complemento, bairro, cidade, estado, cep").eq("empresa_id", fornecedorId).limit(1)
      : Promise.resolve({ data: [] }),
    texto(f.proposta_id)
      ? admin.from("compras_propostas").select("valor_proposta, created_at").eq("id", String(f.proposta_id)).maybeSingle()
      : Promise.resolve({ data: null }),
    texto(p.solicitacao_departamento_id)
      ? admin.from("empresa_departamentos").select("departamento").eq("id", String(p.solicitacao_departamento_id)).maybeSingle()
      : Promise.resolve({ data: null }),
    admin
      .from("ordens_pagamento")
      .select("valor_inicial_cobranca, vencimento, situacao")
      .eq("fornecimento_id", fornecimentoId)
      .not("excluido", "is", true)
      .order("vencimento", { ascending: true }),
    nomesDosUsuarios(
      [texto(f.comprador_id), texto(p.comprado_por_id), texto(f.oc_enviada_por_id)].filter((v): v is string => !!v)
    ),
  ])
  const sede = sedes.sedes[0] ?? null
  const e = (enderecos.data ?? [])[0] as Record<string, unknown> | undefined
  const enderecoFornecedor = e
    ? [
        [texto(e.logradouro), texto(e.numero), texto(e.complemento)].filter(Boolean).join(", "),
        texto(e.bairro),
        [texto(e.cidade), texto(e.estado)].filter(Boolean).join("/"),
        texto(e.cep) ? `CEP ${texto(e.cep)}` : null,
      ]
        .filter(Boolean)
        .join(" — ") || null
    : null
  const forn = fornecedor.data as Record<string, unknown> | null
  const nomeForn = texto(forn?.nome_fantasia) ?? texto(forn?.nome_razao) ?? "(fornecedor não informado)"
  const compradorId = texto(f.comprador_id) ?? texto(p.comprado_por_id)

  return {
    numero: `${texto(p.codigo) ?? processoId.slice(0, 8)}-${indice + 1}`,
    emitidaEm: new Date().toISOString(),
    entidade: {
      nome: org?.nomeRazao ?? org?.nomeFantasia ?? "Entidade",
      cnpj: org?.cnpjCpf ?? null,
      endereco: sede ? enderecoDaSede(sede) : null,
      telefones: sede?.telefones ?? null,
      email: org?.emailContato ?? null,
      logo: await logoDataUri(org?.logoUrl ?? null),
    },
    fornecedor: {
      nome: nomeForn,
      razao: texto(forn?.nome_razao) !== nomeForn ? texto(forn?.nome_razao) : null,
      documento: texto(forn?.cnpj_cpf),
      endereco: enderecoFornecedor,
      email: texto(forn?.email_contato),
    },
    processoCodigo: texto(p.codigo),
    tipo: p.solicitacao_e_produto === true ? "Bem / produto" : p.solicitacao_e_produto === false ? "Prestação de serviço" : null,
    descricao: texto(p.solicitacao_produto),
    quantidade: p.quantidade != null && String(p.quantidade).trim() ? String(p.quantidade) : null,
    departamento: texto((depto.data as Record<string, unknown> | null)?.departamento),
    valor: f.valor == null ? null : Number(f.valor),
    formaPagamento: texto(f.forma_pagamento),
    pagamentos: ((ordens.data ?? []) as Record<string, unknown>[])
      .filter((o) => o.situacao !== "Cancelada")
      .map((o) => ({ valor: o.valor_inicial_cobranca == null ? null : Number(o.valor_inicial_cobranca), vencimento: texto(o.vencimento) })),
    entrega: {
      noAto: p.solicitacao_entrega_no_ato === true,
      local: texto(p.solicitacao_local),
      ate: texto(p.solicitacao_data_limite),
      prevista: texto(f.previsao_entrega),
    },
    proposta: proposta.data
      ? {
          valor: (proposta.data as Record<string, unknown>).valor_proposta == null ? null : Number((proposta.data as Record<string, unknown>).valor_proposta),
          data: texto((proposta.data as Record<string, unknown>).created_at),
        }
      : null,
    comprador: compradorId ? (nomes.get(compradorId) ?? null) : null,
    dataCompra: texto(f.data_compra) ?? texto(p.compra_data),
    enviada: texto(f.oc_enviada_em)
      ? {
          em: String(f.oc_enviada_em),
          para: texto(f.oc_enviada_para),
          porNome: texto(f.oc_enviada_por_id) ? (nomes.get(String(f.oc_enviada_por_id)) ?? null) : null,
        }
      : null,
  }
}

export async function renderizarPdfOrdemCompra(dados: DadosOrdemCompra): Promise<Buffer> {
  return renderToBuffer(createElement(OrdemCompraPDF, { dados }) as Parameters<typeof renderToBuffer>[0])
}

export function nomeArquivoOrdemCompra(dados: DadosOrdemCompra): string {
  return `ordem-de-compra-${dados.numero.replace(/[^\w.-]+/g, "-")}.pdf`
}

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

/** Envia a ordem de compra (PDF anexo) ao fornecedor e registra o envio. */
export async function enviarOrdemCompra(
  processoId: string,
  fornecimentoId: string,
  destino: { email: string; mensagem: string | null },
  usuarioId: string
): Promise<{ erro?: string }> {
  const email = destino.email.trim().toLowerCase()
  if (!EMAIL.test(email)) return { erro: "Informe um e-mail válido do fornecedor." }
  const dados = await dadosOrdemCompra(processoId, fornecimentoId)
  if (!dados) return { erro: "Fornecimento não encontrado neste processo." }
  const pdf = await renderizarPdfOrdemCompra(dados)
  const ok = await enviarEmail({
    email,
    nome: dados.fornecedor.nome,
    assunto: `Ordem de compra nº ${dados.numero} — ${dados.entidade.nome}`,
    html:
      tituloEmail(`Ordem de compra nº ${dados.numero}`) +
      paragrafo(
        `${escaparHtml(dados.entidade.nome)} envia a <strong>ordem de compra nº ${escaparHtml(dados.numero)}</strong>` +
          (dados.valor != null ? `, no valor de <strong>${escaparHtml(formatarMoeda(dados.valor))}</strong>` : "") +
          ". O documento completo segue em anexo (PDF)."
      ) +
      (destino.mensagem ? paragrafo(escaparHtml(destino.mensagem).replace(/\n/g, "<br>")) : "") +
      (dados.descricao ? textoSuave(`Objeto: ${escaparHtml(dados.descricao)}`) : "") +
      (dados.entrega.ate && !dados.entrega.noAto
        ? textoSuave(`Entregar até ${escaparHtml(formatarData(dados.entrega.ate))}${dados.entrega.local ? ` em ${escaparHtml(dados.entrega.local)}` : ""}.`)
        : "") +
      textoSuave("Em caso de dúvida, responda a este e-mail."),
    anexos: [{ nome: nomeArquivoOrdemCompra(dados), base64: Buffer.from(pdf).toString("base64") }],
  })
  if (!ok) return { erro: "O e-mail não saiu — confira o endereço e tente de novo." }

  const admin = await createAdminClient()
  const { error } = await admin
    .from("compras_fornecimentos")
    .update({ oc_enviada_em: new Date().toISOString(), oc_enviada_para: email, oc_enviada_por_id: usuarioId })
    .eq("id", fornecimentoId)
    .eq("processo_id", processoId)
  if (error && !esquemaAusente(error) && error.code !== "PGRST204") {
    console.error("ordem de compra (registro do envio):", error.message)
  }
  return {}
}

/** Para a tela do processo: e-mail do fornecedor e o último envio, por fornecimento. */
export async function situacaoOrdensCompra(
  fornecimentoIds: string[]
): Promise<Map<string, { emailFornecedor: string | null; enviadaEm: string | null; enviadaPara: string | null }>> {
  const mapa = new Map<string, { emailFornecedor: string | null; enviadaEm: string | null; enviadaPara: string | null }>()
  const ids = fornecimentoIds.filter((v) => /^[0-9a-f-]{36}$/i.test(v))
  if (!ids.length) return mapa
  const admin = await createAdminClient()
  const completo = await admin
    .from("compras_fornecimentos")
    .select("id, fornecedor_id, oc_enviada_em, oc_enviada_para")
    .in("id", ids)
  // Sem supabase/compras-ordem-compra.sql: só o e-mail do fornecedor.
  const linhas = (
    completo.error
      ? (await admin.from("compras_fornecimentos").select("id, fornecedor_id").in("id", ids)).data
      : completo.data
  ) as Record<string, unknown>[] | null ?? []
  const fornIds = [...new Set(linhas.map((l) => texto(l.fornecedor_id)).filter((v): v is string => !!v))]
  const { data: emps } = fornIds.length
    ? await admin.from("empresa").select("id, email_contato").in("id", fornIds)
    : { data: [] }
  const emailDe = new Map((emps ?? []).map((e) => [String(e.id), texto(e.email_contato)]))
  for (const l of linhas) {
    mapa.set(String(l.id), {
      emailFornecedor: texto(l.fornecedor_id) ? (emailDe.get(String(l.fornecedor_id)) ?? null) : null,
      enviadaEm: texto(l.oc_enviada_em),
      enviadaPara: texto(l.oc_enviada_para),
    })
  }
  return mapa
}
