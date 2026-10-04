/**
 * Leitor de OFX (onda 5, A1). Todo internet banking brasileiro exporta OFX,
 * quase sempre na forma SGML (OFX 1.x: tags sem fechamento) e às vezes em
 * XML (OFX 2.x). Este leitor não depende de biblioteca: percorre as tags
 * <STMTTRN> e lê os campos que importam para conciliar. Sem imports de
 * servidor — serve também para testes puros.
 */

export type LancamentoExtrato = {
  data: string
  /** Com sinal: débito negativo, crédito positivo. */
  valor: number
  descricao: string | null
  /** Identificador do banco (FITID) ou número do documento. */
  documento: string | null
  tipo: string | null
}

export type ExtratoLido = {
  banco: string | null
  agencia: string | null
  conta: string | null
  periodoDe: string | null
  periodoAte: string | null
  saldoFinal: number | null
  lancamentos: LancamentoExtrato[]
}

/** "20260904120000[-3:BRT]" → "2026-09-04". */
export function dataOfx(bruto: string | null | undefined): string | null {
  const m = /^(\d{4})(\d{2})(\d{2})/.exec((bruto ?? "").trim())
  return m ? `${m[1]}-${m[2]}-${m[3]}` : null
}

/** "-1.234,56", "-1234.56", "1234,56" → número. */
export function numeroOfx(bruto: string | null | undefined): number | null {
  const t = (bruto ?? "").trim().replace(/\s/g, "")
  if (!t) return null
  // Vírgula como decimal quando é o último separador.
  const normalizado = t.includes(",") && t.lastIndexOf(",") > t.lastIndexOf(".") ? t.replace(/\./g, "").replace(",", ".") : t.replace(/,/g, "")
  const n = Number(normalizado)
  return Number.isFinite(n) ? Math.round(n * 100) / 100 : null
}

function campo(bloco: string, tag: string): string | null {
  // SGML: <TAG>valor até a próxima tag; XML: <TAG>valor</TAG>.
  const re = new RegExp(`<${tag}>([^<\\r\\n]*)`, "i")
  const m = re.exec(bloco)
  if (!m) return null
  const v = m[1].trim()
  return v === "" ? null : v
}

function decodificar(bytes: Uint8Array): string {
  const utf8 = new TextDecoder("utf-8", { fatal: false }).decode(bytes)
  // Cabeçalho SGML declara CHARSET:1252; se o UTF-8 gerou "�", lê como latin1.
  if (/CHARSET:1252/i.test(utf8.slice(0, 400)) || utf8.includes("�")) {
    return new TextDecoder("windows-1252").decode(bytes)
  }
  return utf8
}

export function lerOfx(bytes: Uint8Array): ExtratoLido {
  const texto = decodificar(bytes)
  const lancamentos: LancamentoExtrato[] = []
  const blocos = texto.split(/<STMTTRN>/i).slice(1)
  for (const b of blocos) {
    const bloco = b.split(/<\/STMTTRN>/i)[0]
    const data = dataOfx(campo(bloco, "DTPOSTED"))
    const valor = numeroOfx(campo(bloco, "TRNAMT"))
    if (!data || valor === null) continue
    const memo = campo(bloco, "MEMO")
    const nome = campo(bloco, "NAME")
    lancamentos.push({
      data,
      valor,
      descricao: [nome, memo].filter((v): v is string => !!v).filter((v, i, a) => a.indexOf(v) === i).join(" · ") || null,
      documento: campo(bloco, "FITID") ?? campo(bloco, "CHECKNUM") ?? campo(bloco, "REFNUM"),
      tipo: campo(bloco, "TRNTYPE"),
    })
  }
  return {
    banco: campo(texto, "BANKID") ?? campo(texto, "ORG"),
    agencia: campo(texto, "BRANCHID"),
    conta: campo(texto, "ACCTID"),
    periodoDe: dataOfx(campo(texto, "DTSTART")),
    periodoAte: dataOfx(campo(texto, "DTEND")),
    saldoFinal: numeroOfx(campo(texto.split(/<LEDGERBAL>/i)[1] ?? "", "BALAMT")),
    lancamentos,
  }
}
