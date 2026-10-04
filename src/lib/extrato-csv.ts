import { numeroOfx, type ExtratoLido, type LancamentoExtrato } from "@/lib/ofx"

/**
 * Leitor de extrato em CSV (onda 5, A1): o que o internet banking exporta
 * quando não há OFX. Descobre o separador (; , ou tab), acha as colunas pelo
 * nome (data, histórico/descrição, valor — ou crédito e débito separados,
 * ou valor + tipo C/D) e aceita datas dd/mm/aaaa e aaaa-mm-dd. Linhas sem
 * data ou valor (saldo, cabeçalho repetido, rodapé) são ignoradas.
 */

function dividir(linha: string, sep: string): string[] {
  const saida: string[] = []
  let atual = ""
  let aspas = false
  for (let i = 0; i < linha.length; i++) {
    const c = linha[i]
    if (c === '"') {
      if (aspas && linha[i + 1] === '"') {
        atual += '"'
        i++
      } else aspas = !aspas
    } else if (c === sep && !aspas) {
      saida.push(atual)
      atual = ""
    } else atual += c
  }
  saida.push(atual)
  return saida.map((v) => v.trim())
}

function normalizar(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]/g, "")
}

export function dataCsv(bruto: string): string | null {
  const t = bruto.trim()
  let m = /^(\d{2})[\/.-](\d{2})[\/.-](\d{4})/.exec(t)
  if (m) return `${m[3]}-${m[2]}-${m[1]}`
  m = /^(\d{4})-(\d{2})-(\d{2})/.exec(t)
  if (m) return `${m[1]}-${m[2]}-${m[3]}`
  return null
}

export function lerExtratoCsv(bytes: Uint8Array): ExtratoLido {
  let texto = new TextDecoder("utf-8", { fatal: false }).decode(bytes)
  if (texto.includes("�")) texto = new TextDecoder("windows-1252").decode(bytes)
  const linhas = texto.split(/\r?\n/).filter((l) => l.trim() !== "")
  const amostra = linhas.slice(0, 10).join("\n")
  const sep = [";", ",", "\t"].map((s) => ({ s, n: (amostra.match(new RegExp(s === "\t" ? "\t" : `\\${s}`, "g")) ?? []).length })).sort((a, b) => b.n - a.n)[0].s

  // Cabeçalho: a primeira linha que tenha "data" e algo de valor.
  let iCab = -1
  let colunas: string[] = []
  for (let i = 0; i < Math.min(linhas.length, 15); i++) {
    const cols = dividir(linhas[i], sep).map(normalizar)
    if (cols.some((c) => c.startsWith("data")) && cols.some((c) => /valor|credito|debito|montante|quantia/.test(c))) {
      iCab = i
      colunas = cols
      break
    }
  }
  const idx = (pred: (c: string) => boolean) => colunas.findIndex(pred)
  const iData = iCab >= 0 ? idx((c) => c.startsWith("data") && !c.includes("balanc")) : 0
  const iDesc = iCab >= 0 ? idx((c) => /historico|descricao|lancamento|memo|detalhe|titulo/.test(c)) : 1
  const iValor = iCab >= 0 ? idx((c) => c === "valor" || c.startsWith("valor") || /montante|quantia/.test(c)) : 2
  const iCred = iCab >= 0 ? idx((c) => /credito|entrada/.test(c)) : -1
  const iDeb = iCab >= 0 ? idx((c) => /debito|saida/.test(c)) : -1
  const iTipo = iCab >= 0 ? idx((c) => c === "tipo" || c === "cd" || /naturez|operacao/.test(c)) : -1
  const iDoc = iCab >= 0 ? idx((c) => /documento|numdoc|identificador|codigo|id$/.test(c)) : -1

  const lancamentos: LancamentoExtrato[] = []
  for (let i = iCab + 1; i < linhas.length; i++) {
    const cols = dividir(linhas[i], sep)
    const data = iData >= 0 ? dataCsv(cols[iData] ?? "") : null
    if (!data) continue
    let valor: number | null = null
    if (iCred >= 0 || iDeb >= 0) {
      const c = iCred >= 0 ? numeroOfx(cols[iCred]) : null
      const d = iDeb >= 0 ? numeroOfx(cols[iDeb]) : null
      if (c !== null && c !== 0) valor = Math.abs(c)
      else if (d !== null && d !== 0) valor = -Math.abs(d)
      else if (iValor >= 0) valor = numeroOfx(cols[iValor])
    } else if (iValor >= 0) {
      valor = numeroOfx(cols[iValor])
      const tipo = iTipo >= 0 ? (cols[iTipo] ?? "").trim().toUpperCase() : ""
      if (valor !== null && /^(D|DEB|DEBITO|SAIDA)/.test(tipo) && valor > 0) valor = -valor
    }
    if (valor === null || valor === 0) continue
    const descricao = iDesc >= 0 ? (cols[iDesc] ?? "").trim() || null : null
    lancamentos.push({ data, valor, descricao, documento: iDoc >= 0 ? (cols[iDoc] ?? "").trim() || null : null, tipo: iTipo >= 0 ? (cols[iTipo] ?? "").trim() || null : null })
  }
  const datas = lancamentos.map((l) => l.data).sort()
  return { banco: null, agencia: null, conta: null, periodoDe: datas[0] ?? null, periodoAte: datas[datas.length - 1] ?? null, saldoFinal: null, lancamentos }
}
