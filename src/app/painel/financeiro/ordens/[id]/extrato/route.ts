import { createElement } from "react"
import { renderToBuffer } from "@react-pdf/renderer"

import { requirePermissao } from "@/lib/auth"
import { extratoDaOrdem, textoCentro } from "@/lib/db/ordens-extrato"
import { obterOrganizacao } from "@/lib/db/organizacao"
import { formatarData, formatarDataHora, formatarMoeda } from "@/lib/formato"
import { ExtratoOrdemPDF, type ExtratoOrdemProps } from "@/lib/pdf/extrato-ordem"

export const runtime = "nodejs"

/** Baixa o logo (png/jpg) como data URI; ignora SVG e falhas de rede. */
async function logoDataUri(url: string | null): Promise<string | null> {
  if (!url) return null
  try {
    const r = await fetch(url)
    if (!r.ok) return null
    const tipo = r.headers.get("content-type") ?? ""
    if (!/image\/(png|jpe?g)/.test(tipo)) return null
    const buf = Buffer.from(await r.arrayBuffer())
    return `data:${tipo};base64,${buf.toString("base64")}`
  } catch {
    return null
  }
}

function txt(valor: unknown): string {
  return typeof valor === "string" && valor.trim() ? valor : ""
}

/** Link interno vira absoluto para funcionar no PDF. */
function absoluto(url: string | null, origem: string): string | null {
  if (!url) return null
  return url.startsWith("/") ? `${origem}${url}` : url
}

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  await requirePermissao("financeiro_pagamento", ["financeiro_leitura", "aquisicoes_avaliacoes"])
  const { id } = await params

  const x = await extratoDaOrdem(id)
  if (!x) return new Response("Não encontrada", { status: 404 })
  const org = await obterOrganizacao()
  const logo = await logoDataUri(org?.logoUrl ?? null)
  const url = new URL(req.url)
  const origem = url.origin
  // ?simples=1: extrato sem as verificações da criação e a auditoria automática.
  const simplificado = url.searchParams.get("simples") === "1"

  const o = x.detalhe.ordem as Record<string, unknown>
  const pr = x.procedencia
  const pessoas = [pr.solicitante, ...pr.envolvidos]
    .filter((p): p is NonNullable<typeof p> => Boolean(p?.nome))
    .map((p) => ({ papel: p.papel, nome: p.nome as string }))
  const r = pr.recebimento
  const pago = o.situacao === "Paga" || Boolean(o.data_pagamento)

  const dados: ExtratoOrdemProps = {
    org: {
      nomeRazao: org?.nomeRazao ?? null,
      nomeFantasia: org?.nomeFantasia ?? null,
      cnpjCpf: org?.cnpjCpf ?? null,
    },
    logoDataUri: logo,
    geradoEm: formatarDataHora(new Date().toISOString()),
    codigoVerificacao: x.codigoVerificacao,
    ordem: {
      codigo: txt(o.codigo) || id.slice(0, 8),
      descricao: txt(o.descricao) || "—",
      tipo: txt(o.tipo) || "—",
      situacao: txt(o.situacao) || "—",
      valorCobrado: formatarMoeda(o.valor_inicial_cobranca as number | null),
      vencimento: formatarData(o.vencimento as string | null),
      formaPagamento: txt(o.forma_pagamento) || "—",
      pagoCom: x.pagoCom,
      pixCodigo: txt(o.pix_codigo) || null,
      projeto: x.detalhe.projetoVinculado?.descricao ?? null,
    },
    procedencia: { origem: pr.origem, titulo: pr.titulo, linhas: pr.linhas, pessoas, detalhamento: pr.detalhamento ?? null },
    favorecido: {
      nome: x.favorecido.nome ?? "—",
      documento: x.favorecido.documento,
      tipo: x.favorecido.tipo,
    },
    classificacao: {
      despesa: textoCentro(x.detalhe.centroCustoDespesa),
      debito: textoCentro(x.detalhe.centroCustoReceita),
      rateio: x.rateio.map((l) => ({
        conta: l.centroCustoNome ?? "Sem conta definida",
        descricao: l.descricao,
        valor: formatarMoeda(l.valor),
      })),
    },
    autorizacao: {
      texto: x.autorizacao.texto,
      observacao:
        x.autorizacao.situacao === "autorizada" ? txt(o.autorizacao_observacao) || null : null,
      cancelamento:
        o.situacao === "Cancelada"
          ? `${txt(o.cancelamento_motivo) || "Sem motivo registrado"}${o.cancelado_em ? ` (${formatarDataHora(String(o.cancelado_em))})` : ""}`
          : null,
    },
    recebimento: r
      ? r.recebido
        ? `Recebido${r.data ? ` em ${formatarData(r.data)}` : ""}${r.por ? ` por ${r.por}` : ""}${r.deAcordo === false ? " — com ressalva" : r.deAcordo ? " — de acordo" : ""}${r.observacao ? `. ${r.observacao}` : "."}`
        : "Ainda não recebido."
      : null,
    pagamento: {
      registrado: pago,
      valorPago: formatarMoeda(o.valor_pago as number | null),
      data: formatarData(o.data_pagamento as string | null),
      pagador: x.detalhe.pagador ?? "—",
      comprovanteUrl: x.arquivos.comprovante,
    },
    documentos: [
      { rotulo: o.tipo === "Folha de pagamento" ? "Contracheque" : "Nota fiscal / documento fiscal", url: x.arquivos.notaFiscal },
      // Boleto só entra quando é a forma da ordem (ou há arquivo): em Pix/TED
      // "Não anexado" parecia pendência, e não é.
      ...(/boleto/i.test(String(o.forma_pagamento ?? "")) || x.arquivos.boleto
        ? [{ rotulo: "Boleto", url: x.arquivos.boleto }]
        : []),
      { rotulo: "Comprovante de pagamento", url: x.arquivos.comprovante },
      ...(x.arquivos.orcamento ? [{ rotulo: "Orçamento", url: x.arquivos.orcamento }] : []),
      ...pr.documentos.map((d) => ({ rotulo: d.rotulo, url: absoluto(d.url, origem) })),
      // Contrato, custeio, remessa… aberto no sistema (para quem tem acesso).
      ...(pr.href ? [{ rotulo: `Registro de origem no sistema — ${pr.titulo ?? pr.origem}`, url: absoluto(pr.href, origem) }] : []),
    ],
    auditoria: {
      geral: x.auditoria.geral,
      itens: x.auditoria.itens.map((i) => ({ status: i.status, rotulo: i.rotulo, detalhe: i.detalhe })),
    },
    verificacoes: x.verificacoes.map((v) => ({
      status: v.status === "alerta" ? "alerta" : v.status === "ok" ? "ok" : "na",
      rotulo: v.titulo,
      detalhe: v.detalhe ?? "",
    })),
    historico: x.eventos.map((e) => ({
      quando: formatarDataHora(e.quando),
      rotulo: e.rotulo,
      usuario: e.usuario,
      descricao: e.descricao,
    })),
    simplificado,
  }

  const elemento = createElement(ExtratoOrdemPDF, dados) as Parameters<typeof renderToBuffer>[0]
  const buffer = await renderToBuffer(elemento)

  return new Response(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="extrato${simplificado ? "-simplificado" : ""}-ordem-${dados.ordem.codigo}.pdf"`,
      "Cache-Control": "no-store",
    },
  })
}
