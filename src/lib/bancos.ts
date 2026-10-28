import { limparCpf, validarCnpj, validarCpf } from "@/lib/cpf"

/**
 * BANCOS E VALIDAÇÃO DE DADOS BANCÁRIOS (27/10/2026) — seguro para o client.
 *
 * O banco era texto livre ("BANCO BRASIL", "B BRASIL", "BB"…) e agência,
 * conta e chave Pix entravam como viessem, o que gerou contas repetidas e
 * dados que a remessa não lê. Aqui ficam: a lista dos bancos mais usados
 * (código COMPE), o nome padronizado a partir do código ou do apelido, a
 * validação de agência, conta e chave Pix por tipo, e a chave de comparação
 * que diz se duas contas são a mesma (sem zeros à esquerda nem pontuação).
 * Banco fora da lista continua aceito como digitado.
 */

export type Banco = { codigo: string; nome: string; apelidos?: string[] }

export const BANCOS: readonly Banco[] = [
  { codigo: "001", nome: "Banco do Brasil", apelidos: ["bb", "brasil", "banco brasil", "b brasil", "bco brasil"] },
  { codigo: "003", nome: "Banco da Amazônia", apelidos: ["basa"] },
  { codigo: "004", nome: "Banco do Nordeste", apelidos: ["bnb"] },
  { codigo: "021", nome: "Banestes" },
  { codigo: "033", nome: "Santander" },
  { codigo: "037", nome: "Banpará" },
  { codigo: "041", nome: "Banrisul" },
  { codigo: "047", nome: "Banese" },
  { codigo: "070", nome: "BRB" },
  { codigo: "077", nome: "Banco Inter", apelidos: ["inter"] },
  { codigo: "085", nome: "Ailos" },
  { codigo: "102", nome: "XP Investimentos", apelidos: ["xp"] },
  { codigo: "104", nome: "Caixa Econômica Federal", apelidos: ["caixa", "cef", "caixa economica"] },
  { codigo: "136", nome: "Unicred" },
  { codigo: "197", nome: "Stone" },
  { codigo: "208", nome: "BTG Pactual", apelidos: ["btg"] },
  { codigo: "212", nome: "Banco Original", apelidos: ["original"] },
  { codigo: "237", nome: "Bradesco" },
  { codigo: "260", nome: "Nubank", apelidos: ["nu pagamentos", "nu bank"] },
  { codigo: "290", nome: "PagBank", apelidos: ["pagseguro"] },
  { codigo: "318", nome: "Banco BMG", apelidos: ["bmg"] },
  { codigo: "323", nome: "Mercado Pago" },
  { codigo: "336", nome: "C6 Bank", apelidos: ["c6", "banco c6"] },
  { codigo: "341", nome: "Itaú Unibanco", apelidos: ["itau", "itau unibanco", "banco itau"] },
  { codigo: "364", nome: "Efí", apelidos: ["gerencianet"] },
  { codigo: "380", nome: "PicPay" },
  { codigo: "389", nome: "Banco Mercantil do Brasil", apelidos: ["mercantil"] },
  { codigo: "403", nome: "Cora" },
  { codigo: "422", nome: "Banco Safra", apelidos: ["safra"] },
  { codigo: "461", nome: "Asaas" },
  { codigo: "536", nome: "Neon" },
  { codigo: "623", nome: "Banco Pan", apelidos: ["pan"] },
  { codigo: "633", nome: "Banco Rendimento", apelidos: ["rendimento"] },
  { codigo: "655", nome: "Banco BV", apelidos: ["bv", "votorantim"] },
  { codigo: "707", nome: "Banco Daycoval", apelidos: ["daycoval"] },
  { codigo: "748", nome: "Sicredi" },
  { codigo: "756", nome: "Sicoob", apelidos: ["bancoob"] },
]

const simples = (v: string) =>
  v
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/\b(s\.?a\.?|sa)\b/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()

/** Rótulo da opção na lista (o que o seletor mostra e devolve). */
export const rotuloBanco = (b: Banco) => `${b.codigo} - ${b.nome}`

export function bancoPorCodigo(codigo: string | null | undefined): Banco | null {
  const c = (codigo ?? "").replace(/\D/g, "").padStart(3, "0")
  return c === "000" ? null : (BANCOS.find((b) => b.codigo === c) ?? null)
}

function bancoPorNome(nome: string): Banco | null {
  const n = simples(nome).replace(/^(banco|bco) /, "")
  if (!n) return null
  return BANCOS.find((b) => simples(b.nome).replace(/^banco /, "") === n || (b.apelidos ?? []).includes(n)) ?? null
}

/**
 * Nome e código padronizados: pelo código quando é conhecido, senão pelo nome
 * ou apelido; "341 - Itaú Unibanco" (a opção da lista) também serve. Banco
 * fora da lista fica como veio.
 */
export function normalizarBanco(banco: string | null | undefined, codigo?: string | null): { banco: string | null; codigo: string | null } {
  const texto = (banco ?? "").replace(/\s+/g, " ").trim()
  const daOpcao = texto.match(/^(\d{3})\s*[-–]\s*(.+)$/)
  const achado = bancoPorCodigo(daOpcao?.[1] ?? codigo) ?? (texto ? bancoPorNome(daOpcao?.[2] ?? texto) : null)
  if (achado) return { banco: achado.nome, codigo: achado.codigo }
  const cod = (codigo ?? "").replace(/\D/g, "")
  return { banco: daOpcao?.[2] ?? (texto || null), codigo: cod ? cod.padStart(3, "0") : null }
}

/** Agência: até 5 dígitos e, opcional, o dígito (1234 ou 1234-5). */
export function validarAgencia(v: string | null | undefined): { valor: string | null; erro?: string } {
  const s = (v ?? "").replace(/[\s.]/g, "").toUpperCase()
  if (!s) return { valor: null }
  if (!/^\d{1,5}(-?[\dX])?$/.test(s) || s.replace(/\D/g, "").length < 1) {
    return { valor: null, erro: "Agência inválida: use só números e, se houver, o dígito (ex.: 1234-5)." }
  }
  return { valor: s }
}

/** Conta: números e o dígito (12345-6); X vale como dígito. */
export function validarConta(v: string | null | undefined): { valor: string | null; erro?: string } {
  const s = (v ?? "").replace(/[\s.]/g, "").toUpperCase()
  if (!s) return { valor: null }
  if (!/^\d{2,13}(-?[\dX])?$/.test(s)) {
    return { valor: null, erro: "Conta inválida: use só números e o dígito (ex.: 12345-6)." }
  }
  return { valor: s }
}

/** Chave Pix conferida pelo tipo; devolve a forma padronizada. */
export function validarChavePix(tipo: string | null | undefined, v: string | null | undefined): { valor: string | null; erro?: string } {
  const s = (v ?? "").trim()
  if (!s) return { valor: null }
  switch (tipo) {
    case "CNPJ / CPF": {
      const d = limparCpf(s)
      if (d.length === 11 ? validarCpf(d) : d.length === 14 ? validarCnpj(d) : false) return { valor: d }
      return { valor: null, erro: "Chave Pix: CPF/CNPJ inválido." }
    }
    case "Telefone": {
      let d = s.replace(/\D/g, "")
      if (d.length === 13 && d.startsWith("55")) d = d.slice(2)
      if (d.length === 12 && d.startsWith("55")) d = d.slice(2)
      if (d.length !== 10 && d.length !== 11) return { valor: null, erro: "Chave Pix: telefone com DDD (ex.: 22 99999-0000)." }
      return { valor: `+55${d}` }
    }
    case "E-mail":
      return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s) ? { valor: s.toLowerCase() } : { valor: null, erro: "Chave Pix: e-mail inválido." }
    case "Chave aleatória": {
      const h = s.toLowerCase().replace(/[^0-9a-f]/g, "")
      if (h.length !== 32) return { valor: null, erro: "Chave Pix aleatória: são 32 caracteres (letras de a a f e números)." }
      return { valor: `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}` }
    }
    default:
      return { valor: s }
  }
}

/** Chave de comparação: a mesma agência e conta, sem zeros à esquerda nem pontuação. */
export function chaveDaConta(agencia: string | null | undefined, conta: string | null | undefined): string | null {
  const limpo = (v: string | null | undefined) => (v ?? "").toUpperCase().replace(/[^0-9X]/g, "").replace(/^0+/, "")
  const c = limpo(conta)
  return c ? `${limpo(agencia)}|${c}` : null
}

/** Chave de comparação da chave Pix (sem pontuação, minúscula; telefone sem +55). */
export function chaveDoPix(pix: string | null | undefined): string | null {
  const s = (pix ?? "").trim().toLowerCase()
  if (!s) return null
  if (s.includes("@")) return s
  const d = s.replace(/[\s.()/+-]/g, "")
  return /^55\d{10,11}$/.test(d) ? d.slice(2) : d
}

/** O titular da conta como foi conferido (documento|nome): se mudar, a conferência deixa de valer. */
export function assinaturaTitular(documento: unknown, nome: unknown): string {
  const d = String(documento ?? "").replace(/\D/g, "")
  const n = String(nome ?? "").trim().replace(/\s+/g, " ").toLowerCase()
  return `${d}|${n}`
}

/** A conta foi marcada como conferida em Contas bancárias e o titular não mudou desde então. */
export function contaConferida(c: { conferida_em?: unknown; conferida_titular?: unknown; titular_documento?: unknown; favorecido?: unknown } | null | undefined): boolean {
  if (!c?.conferida_em) return false
  return c.conferida_titular === assinaturaTitular(c.titular_documento, c.favorecido)
}
