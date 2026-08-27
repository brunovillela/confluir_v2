import { createElement } from "react"
import { renderToBuffer } from "@react-pdf/renderer"

import { requirePermissao } from "@/lib/auth"
import { detalheOrdem } from "@/lib/db/financeiro"
import { obterOrganizacao } from "@/lib/db/organizacao"
import { formatarData, formatarDataHora, formatarMoeda } from "@/lib/formato"
import { ExtratoOrdemPDF, type ExtratoOrdemProps } from "@/lib/pdf/extrato-ordem"
import { createAdminClient } from "@/lib/supabase/admin"

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

/**
 * Resolve um arquivo para URL absoluta: URLs legadas do Bubble passam direto
 * (normalizando o protocolo-relativo `//`); caminhos novos são assinados no
 * bucket `comprovantes`.
 */
async function resolverArquivo(valor: unknown): Promise<string | null> {
  if (typeof valor !== "string" || !valor.trim()) return null
  if (/^https?:\/\//.test(valor)) return valor
  if (valor.startsWith("//")) return `https:${valor}`
  const admin = await createAdminClient()
  const { data } = await admin.storage
    .from("comprovantes")
    .createSignedUrl(valor, 3600)
  return data?.signedUrl ?? null
}

function txt(valor: unknown): string {
  return typeof valor === "string" && valor.trim() ? valor : ""
}

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  await requirePermissao("financeiro_pagamento", ["financeiro_leitura"])
  const { id } = await params

  const detalhe = await detalheOrdem(id)
  if (!detalhe) return new Response("Não encontrada", { status: 404 })

  const [org, notaFiscalUrl, boletoUrl, comprovanteUrl] = await Promise.all([
    obterOrganizacao(),
    resolverArquivo(detalhe.ordem.arquivo_nota_fiscal),
    resolverArquivo(detalhe.ordem.arquivo_boleto),
    resolverArquivo(detalhe.ordem.arquivo_pagamento),
  ])
  const logo = await logoDataUri(org?.logoUrl ?? null)

  const o = detalhe.ordem
  const centroTexto = (
    c: (typeof detalhe)["centroCustoDespesa"]
  ): string | null =>
    c ? [c.acesso, c.nome_da_conta ?? "(sem nome)"].filter(Boolean).join(" — ") : null

  const contrato = detalhe.contratoVinculado
  const autorizado = o.autorizacao_esta_autorizado === true

  const dados: ExtratoOrdemProps = {
    org: {
      nomeRazao: org?.nomeRazao ?? null,
      nomeFantasia: org?.nomeFantasia ?? null,
      cnpjCpf: org?.cnpjCpf ?? null,
    },
    logoDataUri: logo,
    geradoEm: formatarDataHora(new Date().toISOString()),
    ordem: {
      codigo: txt(o.codigo) || id.slice(0, 8),
      descricao: txt(o.descricao) || "—",
      tipo: txt(o.tipo) || "—",
      situacao: txt(o.situacao) || "—",
      favorecido: detalhe.favorecido ?? "—",
      valorCobrado: formatarMoeda(o.valor_inicial_cobranca as number | null),
      valorPago: formatarMoeda(o.valor_pago as number | null),
      vencimento: formatarData(o.vencimento as string | null),
      dataPagamento: formatarData(o.data_pagamento as string | null),
      formaPagamento: txt(o.forma_pagamento) || "—",
      pagador: detalhe.pagador ?? "—",
      autorizacao: autorizado ? "Autorizada" : "Sem autorização registrada",
      autorizador:
        (detalhe.autorizador ?? "—") +
        (o.autorizacao_data
          ? ` · ${formatarData(o.autorizacao_data as string)}`
          : ""),
      centroDespesa: centroTexto(detalhe.centroCustoDespesa),
      centroReceita: centroTexto(detalhe.centroCustoReceita),
      contrato: contrato
        ? {
            titulo:
              (contrato.codigo ? `${contrato.codigo} — ` : "") +
              (contrato.objeto ?? "(sem objeto)"),
            vigencia: `${formatarData(contrato.vigencia_inicio)} a ${formatarData(
              contrato.vigencia_termino
            )}`,
          }
        : null,
      compraObservacao: detalhe.compraObservacao,
      notaFiscalUrl,
      boletoUrl,
      comprovanteUrl,
    },
  }

  const elemento = createElement(
    ExtratoOrdemPDF,
    dados
  ) as Parameters<typeof renderToBuffer>[0]
  const buffer = await renderToBuffer(elemento)

  return new Response(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="extrato-ordem-${dados.ordem.codigo}.pdf"`,
      "Cache-Control": "no-store",
    },
  })
}
