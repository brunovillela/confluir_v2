/**
 * O que muda de banco para banco no CNAB 240 (onda 5, A2). O layout é o
 * padrão Febraban; cada banco fixa a versão do header de arquivo e de lote
 * que aceita. A versão cadastrada na conta vence a daqui. Sem imports.
 */

export type BancoCnab = {
  codigo: string
  nome: string
  versaoArquivo: string
  versaoLote: string
  /** Como o banco chama a identificação na remessa (ajuda na tela). */
  observacao?: string
}

export const BANCOS: BancoCnab[] = [
  { codigo: "001", nome: "Banco do Brasil", versaoArquivo: "103", versaoLote: "046", observacao: "Convênio de pagamentos do BB (até 9 dígitos)." },
  { codigo: "033", nome: "Santander", versaoArquivo: "060", versaoLote: "031" },
  { codigo: "041", nome: "Banrisul", versaoArquivo: "040", versaoLote: "020" },
  { codigo: "077", nome: "Inter", versaoArquivo: "103", versaoLote: "045" },
  { codigo: "104", nome: "Caixa Econômica Federal", versaoArquivo: "107", versaoLote: "046" },
  { codigo: "237", nome: "Bradesco", versaoArquivo: "089", versaoLote: "045" },
  { codigo: "341", nome: "Itaú", versaoArquivo: "080", versaoLote: "040" },
  { codigo: "422", nome: "Safra", versaoArquivo: "103", versaoLote: "045" },
  { codigo: "748", nome: "Sicredi", versaoArquivo: "081", versaoLote: "045" },
  { codigo: "756", nome: "Sicoob", versaoArquivo: "081", versaoLote: "040" },
]

export function bancoPorCodigo(codigo: string | null | undefined): BancoCnab | null {
  const c = (codigo ?? "").replace(/\D/g, "").padStart(3, "0")
  return BANCOS.find((b) => b.codigo === c) ?? null
}

/** Nome livre do cadastro ("iTAÚ", "SICOOB SUL", "Banco do Brasil") → código. */
export function codigoPorNome(nome: string | null | undefined): string | null {
  const n = (nome ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
  if (!n) return null
  const m = /^\s*(\d{3})\b/.exec(n)
  if (m) return m[1]
  const tabela: [RegExp, string][] = [
    [/banco do brasil|\bbb\b|brasil/, "001"],
    [/santander/, "033"],
    [/banrisul/, "041"],
    [/\binter\b/, "077"],
    [/caixa/, "104"],
    [/bradesco/, "237"],
    [/nubank|nu pagamentos/, "260"],
    [/itau/, "341"],
    [/safra/, "422"],
    [/sicredi/, "748"],
    [/sicoob|bancoob/, "756"],
    [/c6/, "336"],
    [/pagseguro|pagbank/, "290"],
    [/mercado pago/, "323"],
    [/stone/, "197"],
    [/original/, "212"],
    [/btg/, "208"],
    [/xp\b/, "102"],
    [/neon/, "655"],
  ]
  for (const [re, codigo] of tabela) if (re.test(n)) return codigo
  return null
}
