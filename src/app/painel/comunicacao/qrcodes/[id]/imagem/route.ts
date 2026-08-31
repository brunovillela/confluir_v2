import { NextRequest, NextResponse } from "next/server"
import QRCode from "qrcode"

import { requirePermissao } from "@/lib/auth"
import { buscarQrCode } from "@/lib/db/comunicacao-qrcodes"
import { origemAtual } from "@/lib/tenant-url"

/**
 * Imagem do QR Code para download/preview.
 *
 * GET /painel/comunicacao/qrcodes/<id>/imagem?formato=png&tamanho=1024
 *   - formato: png (padrão) | svg (vetor — ideal para impressão em qualquer
 *     tamanho, gráficas pedem vetor)
 *   - tamanho: 256 | 512 | 1024 | 2048 (px, só para png)
 *   - download=1: força download com nome de arquivo amigável
 *
 * O conteúdo codificado é SEMPRE a URL curta do tenant (/q/<slug>) — por isso
 * a imagem nunca precisa ser regerada quando o destino muda.
 */

const TAMANHOS_PNG = [256, 512, 1024, 2048] as const

export async function GET(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> }
) {
  await requirePermissao("noticias")
  const { id } = await ctx.params
  const qr = await buscarQrCode(id)
  if (!qr) return new NextResponse("QR Code não encontrado.", { status: 404 })

  const url = `${await origemAtual()}/q/${qr.slug}`
  const sp = req.nextUrl.searchParams
  const formato = sp.get("formato") === "svg" ? "svg" : "png"
  const tamanhoBruto = Number(sp.get("tamanho") ?? 1024)
  const tamanho = (TAMANHOS_PNG as readonly number[]).includes(tamanhoBruto)
    ? tamanhoBruto
    : 1024
  const download = sp.get("download") === "1"

  const base = (qr.titulo ?? qr.slug)
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-zA-Z0-9-_ ]/g, "")
    .trim()
    .replace(/\s+/g, "-")
    .toLowerCase() || qr.slug

  // margem 4 módulos (quiet zone padrão); correção M equilibra densidade/robustez
  if (formato === "svg") {
    const svg = await QRCode.toString(url, {
      type: "svg",
      errorCorrectionLevel: "M",
      margin: 4,
    })
    return new NextResponse(svg, {
      headers: {
        "Content-Type": "image/svg+xml; charset=utf-8",
        "Cache-Control": "private, max-age=300",
        ...(download
          ? { "Content-Disposition": `attachment; filename="qr-${base}.svg"` }
          : {}),
      },
    })
  }

  const png = await QRCode.toBuffer(url, {
    type: "png",
    width: tamanho,
    errorCorrectionLevel: "M",
    margin: 4,
  })
  return new NextResponse(new Uint8Array(png), {
    headers: {
      "Content-Type": "image/png",
      "Cache-Control": "private, max-age=300",
      ...(download
        ? {
            "Content-Disposition": `attachment; filename="qr-${base}-${tamanho}px.png"`,
          }
        : {}),
    },
  })
}
