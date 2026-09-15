import { dadosImpressao } from "@/lib/db/oficios"
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
      "Content-Disposition": `${baixar ? "attachment" : "inline"}; filename="oficio-${numero}${envelope.assinatura.situacao === "assinado" ? "-assinado" : ""}.pdf"`,
      "Cache-Control": "no-store",
      "X-Robots-Tag": "noindex",
    },
  })
}
