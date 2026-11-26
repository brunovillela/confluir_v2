/**
 * REDUÇÃO DE ARQUIVOS ANTES DE GUARDAR NO STORAGE (26/11/2026).
 *
 * Todo `.upload()`/`.update()` do `createAdminClient()` passa por aqui depois
 * da conferência de tipo (lib/supabase/admin.ts → `storageConferido`). O
 * objetivo é não encher o Storage com arquivos maiores do que precisam ser,
 * com a menor perda possível:
 *
 * - FOTO (JPEG/WEBP): lado maior até 2560 px, orientação do EXIF aplicada,
 *   metadados retirados (inclusive GPS), qualidade 85 (mozjpeg) — a olho não
 *   se vê diferença num documento, comprovante ou retrato.
 * - PNG: redimensiona do mesmo jeito e recompacta SEM perda (continua PNG,
 *   transparência preservada).
 * - PDF enviado por alguém (File/Blob): regravado sem perda (fluxos de
 *   objetos), só se ganhar ≥ 10 %. O conteúdo e as imagens internas ficam
 *   iguais.
 * - Fica SEMPRE como veio: PDF com assinatura digital ou certificado
 *   (/ByteRange, /Sig, /DocMDP, PKCS#7, CAdES), PDF cifrado, PDF gerado pelo
 *   próprio sistema (chega como bytes — muitos têm hash registrado),
 *   qualquer arquivo de caminho com "assinad" (recibos, cartas, ofícios e
 *   minutas assinados), GIF, vídeo, planilhas, Word e afins.
 *
 * Mantém o formato (o caminho já tem a extensão e é gravado pelo chamador) e
 * só troca o arquivo quando o resultado fica ao menos 10 % menor. Qualquer
 * falha ou demora devolve o original: reduzir nunca impede um envio.
 *
 * Sem `server-only` para os testes de unidade importarem — mas é usado só no
 * servidor (sharp e pdf-lib carregados sob demanda).
 */

export const LADO_MAXIMO_SERVIDOR = 2560
const QUALIDADE_JPEG = 85
const QUALIDADE_WEBP = 85
/** Abaixo disto não compensa mexer. */
const MINIMO_IMAGEM = 300 * 1024
const MINIMO_PDF = 500 * 1024
/** PDF muito grande: regravar custaria tempo demais na função. */
const MAXIMO_PDF = 25 * 1024 * 1024
/** O resultado precisa ficar ao menos 10 % menor. */
const GANHO_MINIMO = 0.9
const TEMPO_MAXIMO_MS = 8_000

export type MotivoMantido =
  | "pequeno"
  | "tipo"
  | "assinado"
  | "caminho-assinado"
  | "gerado-pelo-sistema"
  | "cifrado"
  | "animado"
  | "sem-ganho"
  | "falha"

export type ResultadoReducao =
  | { reduzido: true; corpo: unknown; antes: number; depois: number }
  | { reduzido: false; corpo: unknown; motivo: MotivoMantido }

/** Marcas de assinatura digital / certificação num PDF (bytes em latin1). */
const MARCAS_ASSINATURA = [
  "/ByteRange",
  "/Type /Sig",
  "/Type/Sig",
  "/FT /Sig",
  "/FT/Sig",
  "/DocMDP",
  "/Perms",
  "adbe.pkcs7",
  "ETSI.CAdES",
  "ETSI.RFC3161",
]

/** O PDF traz assinatura digital, certificação ou carimbo de tempo? */
export function pdfTemAssinatura(bytes: Uint8Array): boolean {
  const texto = Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength).toString("latin1")
  return MARCAS_ASSINATURA.some((m) => texto.includes(m))
}

/** O PDF é cifrado (senha de abertura ou de permissões)? */
export function pdfCifrado(bytes: Uint8Array): boolean {
  const texto = Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength).toString("latin1")
  return texto.includes("/Encrypt")
}

/** Caminho de documento assinado (rpa-assinados/, assinados/, assinado-externo…). */
export function caminhoDeAssinado(caminho: string): boolean {
  return /assinad/i.test(caminho)
}

async function bytesDe(corpo: unknown): Promise<Uint8Array | null> {
  if (corpo instanceof Uint8Array) return corpo // Buffer também é Uint8Array
  if (corpo instanceof ArrayBuffer) return new Uint8Array(corpo)
  if (typeof Blob !== "undefined" && corpo instanceof Blob) return new Uint8Array(await corpo.arrayBuffer())
  return null
}

/** Devolve o resultado no mesmo "formato" do corpo original (File continua File). */
function mesmoFormato(original: unknown, bytes: Uint8Array, tipo: string): unknown {
  // Cópia num ArrayBuffer próprio: o BlobPart não aceita SharedArrayBuffer.
  const copia = new Uint8Array(bytes.byteLength)
  copia.set(bytes)
  if (typeof File !== "undefined" && original instanceof File) {
    return new File([copia], original.name, { type: tipo, lastModified: original.lastModified })
  }
  if (typeof Blob !== "undefined" && original instanceof Blob) return new Blob([copia], { type: tipo })
  if (Buffer.isBuffer(original)) return Buffer.from(copia)
  if (original instanceof ArrayBuffer) return copia.buffer
  return copia
}

async function comTempo<T>(p: Promise<T>): Promise<T | null> {
  let relogio: ReturnType<typeof setTimeout> | undefined
  const limite = new Promise<null>((ok) => {
    relogio = setTimeout(() => ok(null), TEMPO_MAXIMO_MS)
  })
  try {
    return await Promise.race([p, limite])
  } finally {
    clearTimeout(relogio)
  }
}

async function reduzirImagem(bytes: Uint8Array, tipo: string): Promise<Uint8Array | "animado" | null> {
  const sharp = (await import("sharp")).default
  const base = sharp(bytes, { failOn: "none" })
  const meta = await base.metadata()
  if ((meta.pages ?? 1) > 1) return "animado"
  let img = base.rotate() // aplica a orientação do EXIF antes de tirar os metadados
  const lado = Math.max(meta.width ?? 0, meta.height ?? 0)
  if (lado > LADO_MAXIMO_SERVIDOR) {
    img = img.resize({ width: LADO_MAXIMO_SERVIDOR, height: LADO_MAXIMO_SERVIDOR, fit: "inside", withoutEnlargement: true })
  }
  if (tipo === "image/jpeg") img = img.jpeg({ quality: QUALIDADE_JPEG, mozjpeg: true })
  else if (tipo === "image/png") img = img.png({ compressionLevel: 9, adaptiveFiltering: true, effort: 10 })
  else if (tipo === "image/webp") img = img.webp({ quality: QUALIDADE_WEBP })
  else return null
  return new Uint8Array(await img.toBuffer())
}

async function regravarPdf(bytes: Uint8Array): Promise<Uint8Array> {
  const { PDFDocument } = await import("pdf-lib")
  const doc = await PDFDocument.load(bytes, { updateMetadata: false })
  return doc.save({ useObjectStreams: true })
}

/**
 * Reduz o corpo de um upload, se valer a pena e se puder. `tipo` é o tipo
 * DETECTADO pela conferência (lib/uploads.ts), não o declarado.
 */
export async function reduzirParaArmazenar(
  corpo: unknown,
  { tipo, caminho }: { tipo: string | null; caminho: string }
): Promise<ResultadoReducao> {
  const manter = (motivo: MotivoMantido): ResultadoReducao => ({ reduzido: false, corpo, motivo })
  const ehImagem = tipo === "image/jpeg" || tipo === "image/png" || tipo === "image/webp"
  const ehPdf = tipo === "application/pdf"
  if (!ehImagem && !ehPdf) return manter("tipo")
  if (caminhoDeAssinado(caminho)) return manter("caminho-assinado")
  // PDF gerado aqui (react-pdf, pdf-lib, ofício/aviso/carta assinados) chega
  // como bytes; o que alguém escolheu num formulário chega como File/Blob.
  if (ehPdf && !(typeof Blob !== "undefined" && corpo instanceof Blob)) return manter("gerado-pelo-sistema")

  try {
    const bytes = await bytesDe(corpo)
    if (!bytes) return manter("tipo")
    if (bytes.byteLength < (ehPdf ? MINIMO_PDF : MINIMO_IMAGEM)) return manter("pequeno")

    let saida: Uint8Array | null
    if (ehPdf) {
      if (bytes.byteLength > MAXIMO_PDF) return manter("pequeno")
      if (pdfTemAssinatura(bytes)) return manter("assinado")
      if (pdfCifrado(bytes)) return manter("cifrado")
      saida = await comTempo(regravarPdf(bytes))
    } else {
      const r = await comTempo(reduzirImagem(bytes, tipo!))
      if (r === "animado") return manter("animado")
      saida = r
    }
    if (!saida) return manter("falha")
    if (saida.byteLength > bytes.byteLength * GANHO_MINIMO) return manter("sem-ganho")
    return { reduzido: true, corpo: mesmoFormato(corpo, saida, tipo!), antes: bytes.byteLength, depois: saida.byteLength }
  } catch (e) {
    console.warn("redução do arquivo (segue o original):", caminho, e instanceof Error ? e.message : e)
    return manter("falha")
  }
}
