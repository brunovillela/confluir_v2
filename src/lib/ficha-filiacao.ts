/**
 * Regras puras da ficha de filiação online (07/11/2026): os passos, o que cada
 * um exige e as conferências do começo pelo CPF. Usadas pela tela (para não
 * deixar avançar) e pelo servidor (que é quem decide). Ver
 * lib/db/filiacao-publica.ts.
 */

export const PASSOS_FICHA = [
  { numero: 1, titulo: "Seus dados" },
  { numero: 2, titulo: "Contato e endereço" },
  { numero: 3, titulo: "Seu trabalho" },
  { numero: 4, titulo: "Autorizações" },
  { numero: 5, titulo: "Assinar no gov.br" },
] as const

/** Dias que o link do e-mail vale enquanto a ficha não é concluída. */
export const VALIDADE_LINK_DIAS = 7

/** Dias parada (sem concluir ou sem assinar) para a gestão ser avisada. */
export const DIAS_PARADA = 3

export const SEXOS_FICHA = ["Feminino", "Masculino", "Outro", "Prefiro não informar"] as const

export type DadosFicha = {
  nome_completo?: string | null
  nome_social?: string | null
  nascimento?: string | null
  sexo?: string | null
  telefone_1?: string | null
  telefone_1_whatsapp?: boolean
  telefone_2?: string | null
  endereco_cep?: string | null
  endereco_logradouro?: string | null
  endereco_numero?: string | null
  endereco_complemento?: string | null
  endereco_bairro?: string | null
  endereco_cidade?: string | null
  endereco_estado?: string | null
  empregador_id?: string | null
  matricula?: string | null
  cargo?: string | null
  lotacao?: string | null
}

type Exigencia = { campo: keyof DadosFicha; mensagem: string; valido?: (v: string) => boolean }

const digitos = (v: string) => v.replace(/\D/g, "")

const EXIGIDOS: Record<1 | 2 | 3, Exigencia[]> = {
  1: [
    { campo: "nome_completo", mensagem: "Informe o seu nome completo.", valido: (v) => v.trim().split(/\s+/).length >= 2 },
    { campo: "nascimento", mensagem: "Informe a data de nascimento.", valido: (v) => dataValida(v) },
    { campo: "sexo", mensagem: "Escolha uma opção em Sexo (pode ser \"Prefiro não informar\")." },
  ],
  2: [
    { campo: "telefone_1", mensagem: "Informe um telefone com DDD.", valido: (v) => [10, 11].includes(digitos(v).length) },
    { campo: "endereco_cep", mensagem: "Informe o CEP.", valido: (v) => digitos(v).length === 8 },
    { campo: "endereco_logradouro", mensagem: "Informe a rua (logradouro)." },
    { campo: "endereco_numero", mensagem: "Informe o número (se não tiver, escreva s/n)." },
    { campo: "endereco_bairro", mensagem: "Informe o bairro." },
    { campo: "endereco_cidade", mensagem: "Informe a cidade." },
    { campo: "endereco_estado", mensagem: "Informe a UF (duas letras).", valido: (v) => /^[A-Za-z]{2}$/.test(v.trim()) },
  ],
  3: [
    { campo: "empregador_id", mensagem: "Escolha a empresa onde você trabalha." },
    { campo: "matricula", mensagem: "Informe a sua matrícula na empresa." },
  ],
}

/** O que falta para concluir um passo (o primeiro problema), ou null. */
export function faltaNoPasso(passo: 1 | 2 | 3, d: DadosFicha): { campo: string; erro: string } | null {
  for (const e of EXIGIDOS[passo]) {
    const v = d[e.campo]
    const texto = typeof v === "string" ? v.trim() : ""
    if (!texto || (e.valido && !e.valido(texto))) return { campo: e.campo, erro: e.mensagem }
  }
  return null
}

/** A ficha inteira está completa? Devolve o primeiro passo com falta. */
export function primeiroPassoIncompleto(d: DadosFicha): 1 | 2 | 3 | null {
  for (const p of [1, 2, 3] as const) if (faltaNoPasso(p, d)) return p
  return null
}

/** AAAA-MM-DD de verdade, entre 1900 e hoje. */
export function dataValida(v: string | null | undefined): boolean {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(v ?? "")
  if (!m) return false
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]))
  return (
    d.getFullYear() === Number(m[1]) &&
    d.getMonth() === Number(m[2]) - 1 &&
    d.getDate() === Number(m[3]) &&
    Number(m[1]) >= 1900 &&
    d.getTime() <= Date.now()
  )
}

/** A data de nascimento informada é a do cadastro? (Só o dia importa.) */
export function mesmoNascimento(informado: string | null | undefined, doCadastro: string | null | undefined): boolean {
  if (!informado || !doCadastro) return false
  return informado.slice(0, 10) === doCadastro.slice(0, 10)
}

/** E-mail com cara de e-mail (o link é que confirma de verdade). */
export function emailValido(v: string | null | undefined): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test((v ?? "").trim())
}

/** Dias inteiros desde a data (para "parou há N dias"). */
export function diasDesde(iso: string | null | undefined, agora = Date.now()): number {
  if (!iso) return 0
  return Math.max(0, Math.floor((agora - new Date(iso).getTime()) / 86_400_000))
}

/** Link do WhatsApp para um telefone brasileiro (só dígitos, com DDD). */
export function linkWhatsapp(telefone: string | null | undefined): string | null {
  const d = digitos(telefone ?? "")
  if (d.length !== 10 && d.length !== 11) return null
  return `https://wa.me/55${d}`
}

/** Onde a pessoa parou, em palavras (lista de paradas e página da ficha). */
export function ondeParou(situacao: string, passo: number): string {
  if (situacao === "aguardando_verificacao") return "Não abriu o link do e-mail"
  if (situacao === "aguardando_assinatura") return "Falta assinar no gov.br"
  const proximo = PASSOS_FICHA[Math.min(passo, 3)]
  return `Parou em "${proximo?.titulo ?? "preencher"}"`
}
