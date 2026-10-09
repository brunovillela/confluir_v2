import { dadosImpressao } from "@/lib/db/oficios"
import { envelopeMinutaPorToken } from "@/lib/db/minuta-assinatura"
import { certificacaoDoRpa, envelopeRpaPorToken, renderizarPdfRpa } from "@/lib/db/rpa-assinatura"
import { renderizarPdfMinuta } from "@/lib/db/minuta-pdf"
import { envelopePorToken, renderizarPdfOficio } from "@/lib/db/oficios-assinatura"

export const runtime = "nodejs"

/**
 * PDF do ofício para o assinante, sem login: o token do e-mail é a chave.
 * Pendente mostra "Aguardando assinatura"; assinado, o documento final.
 * Envio cancelado não mostra mais o documento.
 */
export async function GET(
  req: Request,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params
  const baixarMinuta = new URL(req.url).searchParams.get("baixar") === "1"

  // RPA: o prestador vê o recibo; assinado pelo link, com o certificado.
  const rpa = await envelopeRpaPorToken(token)
  if (rpa) {
    const a = rpa.assinatura
    if (a.situacao !== "pendente" && a.situacao !== "assinado") {
      return new Response("Documento indisponível", { status: 404 })
    }
    const certificacao =
      a.situacao === "assinado" && a.hashDocumento ? await certificacaoDoRpa(rpa.rpa.id, a.hashDocumento) : null
    const pdf = await renderizarPdfRpa(rpa.rpa, {
      certificacao,
      dataDocumento: a.situacao === "assinado" ? a.assinadoEm : a.enviadoEm,
    })
    return new Response(new Uint8Array(pdf), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `${baixarMinuta ? "attachment" : "inline"}; filename="rpa-${rpa.rpa.numero ?? "recibo"}${a.situacao === "assinado" ? "-assinado" : ""}.pdf"`,
        "Cache-Control": "no-store",
        "X-Robots-Tag": "noindex",
      },
    })
  }

  // Minuta de contrato: o assinante vê o texto com a certificação até aqui.
  const minuta = await envelopeMinutaPorToken(token)
  if (minuta) {
    if (minuta.assinatura.situacao === "cancelado") {
      return new Response("Documento indisponível", { status: 404 })
    }
    const r = await renderizarPdfMinuta(minuta.minutaId, minuta.emp)
    if (!r) return new Response("Documento indisponível", { status: 404 })
    return new Response(new Uint8Array(r.pdf), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `${baixarMinuta ? "attachment" : "inline"}; filename="${r.nome}"`,
        "Cache-Control": "no-store",
        "X-Robots-Tag": "noindex",
      },
    })
  }

  const envelope = await envelopePorToken(token)
  if (!envelope || envelope.assinatura.situacao === "cancelado") {
    return new Response("Documento indisponível", { status: 404 })
  }
  const dados = await dadosImpressao(envelope.oficio.id)
  if (!dados) return new Response("Documento indisponível", { status: 404 })

  const buffer = await renderizarPdfOficio(dados, envelope.assinatura)
  const numero =
    envelope.oficio.numero != null ? `${envelope.oficio.numero}-${envelope.oficio.ano}` : "oficio"
  const baixar = new URL(req.url).searchParams.get("baixar") === "1"
  return new Response(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `${baixar ? "attachment" : "inline"}; filename="oficio-${numero}${envelope.assinatura.situacao === "assinado" ? "-assinado" : ""}${envelope.oficio.situacao === "Cancelado" ? "-cancelado" : ""}.pdf"`,
      "Cache-Control": "no-store",
      "X-Robots-Tag": "noindex",
    },
  })
}
