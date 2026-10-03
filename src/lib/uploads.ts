/**
 * CONFERÊNCIA DE ARQUIVOS ENVIADOS (onda 1, S11).
 *
 * Até 03/10/2026 cada um dos 46 pontos de upload confiava no tipo que o
 * navegador DECLARA (`arquivo.type`) e gravava esse tipo no Storage. Um HTML
 * renomeado para .pdf subia como "application/pdf" e, servido do bucket,
 * podia rodar script no navegador de quem abrisse.
 *
 * Agora o cliente de storage do `createAdminClient()` passa todo upload por
 * `conferirArquivo()`: lê os primeiros bytes, identifica o tipo pela
 * ASSINATURA (magic bytes), recusa conteúdo ativo (HTML, SVG, executáveis,
 * scripts) e grava o `contentType` detectado, não o declarado. Sem `server-only`
 * porque não toca em nada do servidor — mas é usado só lá.
 */

export type TipoDetectado =
  | "application/pdf"
  | "image/jpeg"
  | "image/png"
  | "image/gif"
  | "image/webp"
  | "video/mp4"
  | "application/zip"
  | "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
  | "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
  | "application/vnd.openxmlformats-officedocument.presentationml.presentation"
  | "application/msword"
  | "text/plain"
  | "text/csv"

export type ResultadoConferencia =
  | { ok: true; contentType: TipoDetectado }
  | { ok: false; erro: string }

const ERRO_TIPO =
  "Tipo de arquivo não aceito. Envie PDF, imagem (JPG, PNG, WebP, GIF), vídeo MP4, planilha, documento do Word ou texto."

function comeca(b: Uint8Array, assinatura: number[], deslocamento = 0): boolean {
  if (b.length < deslocamento + assinatura.length) return false
  return assinatura.every((v, i) => b[deslocamento + i] === v)
}

function textoDe(b: Uint8Array): string {
  let s = ""
  for (let i = 0; i < Math.min(b.length, 512); i++) s += String.fromCharCode(b[i])
  return s
}

/**
 * Identifica o tipo pelos primeiros bytes. `declarado` e `nome` só
 * desempatam entre tipos com a mesma assinatura (xlsx/docx/pptx são zip;
 * csv/txt são texto).
 */
export function detectarTipo(
  cabeca: Uint8Array,
  declarado?: string | null,
  nome?: string | null
): TipoDetectado | null {
  const ext = (nome ?? "").toLowerCase().split(".").pop() ?? ""
  if (comeca(cabeca, [0x25, 0x50, 0x44, 0x46])) return "application/pdf" // %PDF
  if (comeca(cabeca, [0xff, 0xd8, 0xff])) return "image/jpeg"
  if (comeca(cabeca, [0x89, 0x50, 0x4e, 0x47])) return "image/png"
  if (comeca(cabeca, [0x47, 0x49, 0x46, 0x38])) return "image/gif"
  if (comeca(cabeca, [0x52, 0x49, 0x46, 0x46]) && comeca(cabeca, [0x57, 0x45, 0x42, 0x50], 8)) return "image/webp"
  if (comeca(cabeca, [0x66, 0x74, 0x79, 0x70], 4)) return "video/mp4" // ....ftyp (mp4/mov/m4v)
  if (comeca(cabeca, [0x50, 0x4b, 0x03, 0x04])) {
    // Zip: os formatos Office modernos. Desempate pelo que foi declarado ou pela extensão.
    if (declarado?.includes("spreadsheetml") || ext === "xlsx") return "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    if (declarado?.includes("wordprocessingml") || ext === "docx") return "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
    if (declarado?.includes("presentationml") || ext === "pptx") return "application/vnd.openxmlformats-officedocument.presentationml.presentation"
    return "application/zip"
  }
  if (comeca(cabeca, [0xd0, 0xcf, 0x11, 0xe0])) return "application/msword" // OLE: doc/xls antigos
  // Texto: sem byte nulo e sem cara de HTML/SVG/script.
  const texto = textoDe(cabeca)
  const temNulo = Array.from(cabeca.slice(0, 512)).some((b) => b === 0)
  if (!temNulo && cabeca.length > 0) {
    const inicio = texto.replace(/^﻿/, "").trimStart().toLowerCase()
    if (/^(<!doctype|<html|<script|<svg|<\?xml)/.test(inicio) || /<script/i.test(texto)) return null
    // Controle: proporção de bytes imprimíveis
    let imprimiveis = 0
    for (const b of cabeca.slice(0, 512)) if (b === 9 || b === 10 || b === 13 || (b >= 32 && b < 127) || b >= 128) imprimiveis++
    if (imprimiveis / Math.min(cabeca.length, 512) > 0.95) {
      return ext === "csv" || declarado === "text/csv" ? "text/csv" : "text/plain"
    }
  }
  return null
}

/** Lê os primeiros bytes de um File/Blob/Buffer/ArrayBuffer/Uint8Array. */
async function cabecaDe(corpo: unknown): Promise<Uint8Array | null> {
  if (corpo instanceof Uint8Array) return corpo.subarray(0, 512)
  if (corpo instanceof ArrayBuffer) return new Uint8Array(corpo.slice(0, 512))
  if (typeof Blob !== "undefined" && corpo instanceof Blob) {
    return new Uint8Array(await corpo.slice(0, 512).arrayBuffer())
  }
  return null
}

/**
 * Confere o corpo de um upload. Devolve o tipo detectado (para gravar como
 * contentType) ou o erro a mostrar. Corpos de tipo desconhecido (streams,
 * strings) passam sem conferência.
 */
export async function conferirArquivo(
  corpo: unknown,
  opcoes: { declarado?: string | null; nome?: string | null; tiposAceitos?: TipoDetectado[] } = {}
): Promise<ResultadoConferencia | { ok: true; contentType: null }> {
  const cabeca = await cabecaDe(corpo)
  if (!cabeca) return { ok: true, contentType: null }
  if (cabeca.length === 0) return { ok: false, erro: "O arquivo está vazio." }
  const nome = opcoes.nome ?? (typeof File !== "undefined" && corpo instanceof File ? corpo.name : null)
  const tipo = detectarTipo(cabeca, opcoes.declarado, nome)
  if (!tipo) return { ok: false, erro: ERRO_TIPO }
  if (opcoes.tiposAceitos && !opcoes.tiposAceitos.includes(tipo)) return { ok: false, erro: ERRO_TIPO }
  return { ok: true, contentType: tipo }
}
