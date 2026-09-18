import { requirePermissao } from "@/lib/auth"
import {
  assinaturasDoOficio,
  assinaturaVigente,
  renderizarPdfOficio,
} from "@/lib/db/oficios-assinatura"
import { dadosImpressao } from "@/lib/db/oficios"
import { podeVerOficio } from "@/lib/db/oficios-acesso"

export const runtime = "nodejs"

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  await requirePermissao("ferramentas_oficios")
  const { id } = await params
  if (!(await podeVerOficio(id))) return new Response("Não encontrado", { status: 404 })

  const [dados, assinaturas] = await Promise.all([dadosImpressao(id), assinaturasDoOficio(id)])
  if (!dados) return new Response("Não encontrado", { status: 404 })

  // Assinado leva QR, carimbo e certificado; enviado mostra "aguardando".
  const buffer = await renderizarPdfOficio(dados, assinaturaVigente(assinaturas))

  const numero =
    dados.oficio.numero != null
      ? `${dados.oficio.numero}-${dados.oficio.ano}`
      : id.slice(0, 8)
  return new Response(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="oficio-${numero}.pdf"`,
      "Cache-Control": "no-store",
    },
  })
}
