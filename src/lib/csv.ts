/**
 * CSV mínimo para as importações do painel: detecta o delimitador (; ou ,),
 * respeita aspas duplas (campos com ; ou quebra de linha) e tolera os
 * formatos que o Excel pt-BR gera.
 */

/** Decodifica o arquivo: UTF-8 (com ou sem BOM); cai para windows-1252. */
export function decodificarCsv(bytes: ArrayBuffer): string {
  const utf8 = new TextDecoder("utf-8", { fatal: false }).decode(bytes)
  // Presença de U+FFFD indica que não era UTF-8 (Excel salva em ANSI).
  const texto = utf8.includes("�")
    ? new TextDecoder("windows-1252").decode(bytes)
    : utf8
  return texto.replace(new RegExp("^\\uFEFF"), "")
}

/** Divide o CSV em linhas/campos. Delimitador detectado pela 1ª linha. */
export function parseCsv(texto: string): string[][] {
  const primeiraLinha = texto.slice(0, texto.indexOf("\n") + 1 || undefined)
  const delim =
    (primeiraLinha.match(/;/g)?.length ?? 0) >=
    (primeiraLinha.match(/,/g)?.length ?? 0)
      ? ";"
      : ","

  const linhas: string[][] = []
  let campo = ""
  let linha: string[] = []
  let emAspas = false

  for (let i = 0; i < texto.length; i++) {
    const c = texto[i]
    if (emAspas) {
      if (c === '"') {
        if (texto[i + 1] === '"') {
          campo += '"'
          i++
        } else {
          emAspas = false
        }
      } else {
        campo += c
      }
      continue
    }
    if (c === '"') {
      emAspas = true
    } else if (c === delim) {
      linha.push(campo)
      campo = ""
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && texto[i + 1] === "\n") i++
      linha.push(campo)
      campo = ""
      linhas.push(linha)
      linha = []
    } else {
      campo += c
    }
  }
  if (campo !== "" || linha.length > 0) {
    linha.push(campo)
    linhas.push(linha)
  }
  // Descarta linhas totalmente vazias
  return linhas.filter((l) => l.some((v) => v.trim() !== ""))
}

/** 'a b-ç' → 'abc' — para casar cabeçalhos com tolerância. */
export function normalizarCabecalho(nome: string): string {
  const semAcentos = nome
    .normalize("NFD")
    .replace(new RegExp("[\\u0300-\\u036f]", "g"), "")
  return semAcentos.toLowerCase().replace(/[^a-z0-9]/g, "")
}

/** 'DD/MM/YYYY' ou 'YYYY-MM-DD' → 'YYYY-MM-DD' (ou null). */
export function normalizarDataCsv(valor: string): string | null {
  const v = valor.trim()
  if (!v) return null
  if (/^\d{4}-\d{2}-\d{2}$/.test(v)) return v
  const br = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(v)
  if (br) return `${br[3]}-${br[2]}-${br[1]}`
  return null
}
