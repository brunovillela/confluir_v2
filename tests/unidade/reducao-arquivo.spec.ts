import { expect, test } from "playwright/test"
import sharp from "sharp"
import { PDFDocument } from "pdf-lib"

import { caminhoDeAssinado, pdfTemAssinatura, reduzirParaArmazenar } from "../../src/lib/reducao-arquivo"

/** Foto "de celular": 4000×3000 com ruído (não comprime fácil), JPEG 98. */
async function fotoGrande(): Promise<Buffer> {
  const w = 4000
  const h = 3000
  const px = Buffer.alloc(w * h * 3)
  for (let i = 0; i < px.length; i++) px[i] = (i * 7919 + ((i / w) | 0) * 13) % 256
  return sharp(px, { raw: { width: w, height: h, channels: 3 } }).jpeg({ quality: 98 }).toBuffer()
}

test("foto grande: reduz para 2560 px e continua JPEG", async () => {
  const original = await fotoGrande()
  const arquivo = new File([new Uint8Array(original)], "foto.jpg", { type: "image/jpeg" })
  const r = await reduzirParaArmazenar(arquivo, { tipo: "image/jpeg", caminho: "comprovantes/x.jpg" })
  expect(r.reduzido).toBe(true)
  if (!r.reduzido) return
  expect(r.corpo).toBeInstanceOf(File)
  const bytes = Buffer.from(await (r.corpo as File).arrayBuffer())
  const meta = await sharp(bytes).metadata()
  expect(meta.format).toBe("jpeg")
  expect(Math.max(meta.width!, meta.height!)).toBe(2560)
  expect(r.depois).toBeLessThan(r.antes * 0.9)
})

test("PNG grande: continua PNG e mantém a transparência", async () => {
  const w = 3200
  const h = 2400
  const px = Buffer.alloc(w * h * 4)
  for (let i = 0; i < px.length; i++) px[i] = i % 4 === 3 ? 128 : (i * 31) % 256
  const png = await sharp(px, { raw: { width: w, height: h, channels: 4 } }).png({ compressionLevel: 0 }).toBuffer()
  const r = await reduzirParaArmazenar(png, { tipo: "image/png", caminho: "logos/a.png" })
  expect(r.reduzido).toBe(true)
  if (!r.reduzido) return
  expect(Buffer.isBuffer(r.corpo)).toBe(true)
  const meta = await sharp(r.corpo as Buffer).metadata()
  expect(meta.format).toBe("png")
  expect(meta.hasAlpha).toBe(true)
})

test("imagem pequena fica como veio", async () => {
  const pequena = await sharp({ create: { width: 200, height: 200, channels: 3, background: "#fff" } }).jpeg().toBuffer()
  const r = await reduzirParaArmazenar(pequena, { tipo: "image/jpeg", caminho: "x.jpg" })
  expect(r).toMatchObject({ reduzido: false, motivo: "pequeno" })
  expect(r.corpo).toBe(pequena)
})

test("caminho de documento assinado nunca é tocado", async () => {
  expect(caminhoDeAssinado("rpa-assinados/1/2.pdf")).toBe(true)
  expect(caminhoDeAssinado("oficios/1/assinado-mao-ab.pdf")).toBe(true)
  expect(caminhoDeAssinado("comprovantes/1.pdf")).toBe(false)
  const foto = await fotoGrande()
  const r = await reduzirParaArmazenar(foto, { tipo: "image/jpeg", caminho: "rpa-assinados/1/foto.jpg" })
  expect(r).toMatchObject({ reduzido: false, motivo: "caminho-assinado" })
})

test("PDF com assinatura digital fica intacto", async () => {
  const doc = await PDFDocument.create()
  doc.addPage()
  const base = await doc.save({ useObjectStreams: false })
  const enchimento = " ".repeat(600 * 1024)
  const assinado = Buffer.concat([
    Buffer.from(base),
    Buffer.from(`\n% ${enchimento}\n1 0 obj << /Type /Sig /ByteRange [0 1 2 3] /SubFilter /adbe.pkcs7.detached >> endobj\n`, "latin1"),
  ])
  expect(pdfTemAssinatura(new Uint8Array(assinado))).toBe(true)
  const arquivo = new File([new Uint8Array(assinado)], "a.pdf", { type: "application/pdf" })
  const r = await reduzirParaArmazenar(arquivo, { tipo: "application/pdf", caminho: "documentos/a.pdf" })
  expect(r).toMatchObject({ reduzido: false, motivo: "assinado" })
  expect(r.corpo).toBe(arquivo)
})

test("PDF gerado pelo sistema (bytes) fica intacto", async () => {
  const bytes = new Uint8Array(700 * 1024)
  bytes.set(Buffer.from("%PDF-1.7\n"))
  const r = await reduzirParaArmazenar(bytes, { tipo: "application/pdf", caminho: "ferias/aviso.pdf" })
  expect(r).toMatchObject({ reduzido: false, motivo: "gerado-pelo-sistema" })
})

test("PDF enviado sem assinatura: regravado sem perda quando ganha", async () => {
  // Muitas páginas sem fluxo de objetos: a regravação compacta a estrutura.
  const doc = await PDFDocument.create()
  for (let i = 0; i < 1200; i++) doc.addPage().drawText(`Pagina ${i}`)
  const bytes = await doc.save({ useObjectStreams: false })
  const arquivo = new File([new Uint8Array(bytes)], "relatorio.pdf", { type: "application/pdf" })
  const r = await reduzirParaArmazenar(arquivo, { tipo: "application/pdf", caminho: "documentos/r.pdf" })
  expect(r.reduzido).toBe(true)
  if (!r.reduzido) return
  const relido = await PDFDocument.load(new Uint8Array(await (r.corpo as File).arrayBuffer()))
  expect(relido.getPageCount()).toBe(1200)
})

test("tipos que não são foto nem PDF passam direto", async () => {
  const corpo = Buffer.alloc(2 * 1024 * 1024)
  const r = await reduzirParaArmazenar(corpo, { tipo: "video/mp4", caminho: "slides/v.mp4" })
  expect(r).toMatchObject({ reduzido: false, motivo: "tipo" })
})
