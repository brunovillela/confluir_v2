/**
 * Comunicação › Mensagens aos filiados — constantes e utilitários puros,
 * compartilhados entre client (prévia, botão do WhatsApp) e server (envio).
 */

export const PADRAO_ANIVERSARIO = {
  assunto: "Feliz aniversário, {primeiro_nome}!",
  mensagem:
    "Olá, {primeiro_nome}!\n\nHoje é o seu dia, e a {entidade} não podia deixar de lembrar. Desejamos um aniversário cheio de saúde, alegria e conquistas, ao lado de quem você gosta.\n\nConte sempre com a gente.\n\nUm abraço,\n{entidade}",
  textoWhatsapp:
    "Olá, {primeiro_nome}! A {entidade} deseja um feliz aniversário, com muita saúde e alegria. Conte sempre com a gente!",
}

export const VARIAVEIS_MENSAGEM = [
  { chave: "{primeiro_nome}", rotulo: "primeiro nome" },
  { chave: "{nome}", rotulo: "nome completo" },
  { chave: "{entidade}", rotulo: "nome da entidade" },
] as const

/** Horário do envio automático (o agendador roda às 12:00 UTC). */
export const HORA_ENVIO_AUTOMATICO = "9h"

export type SituacaoEmail = "pendente" | "enviado" | "sem_email" | "descadastrado" | "duplicado" | "falha"

export const ROTULO_SITUACAO_EMAIL: Record<SituacaoEmail, string> = {
  pendente: "Na fila",
  enviado: "Enviado",
  sem_email: "Sem e-mail",
  descadastrado: "Descadastrado",
  duplicado: "E-mail repetido",
  falha: "Falhou",
}

const MINUSCULAS = new Set(["da", "das", "de", "do", "dos", "e"])

/** "MARIA DA SILVA" → "Maria da Silva" (o cadastro traz muito nome em caixa alta). */
export function nomeProprio(nome: string): string {
  return nome
    .trim()
    .toLowerCase()
    .split(/\s+/)
    .map((p, i) => (i > 0 && MINUSCULAS.has(p) ? p : p.charAt(0).toUpperCase() + p.slice(1)))
    .join(" ")
}

export function primeiroNome(nome: string): string {
  return nomeProprio(nome).split(" ")[0] ?? ""
}

/** Troca {primeiro_nome}, {nome} e {entidade} no texto. */
export function aplicarVariaveis(texto: string, v: { nome: string; entidade: string }): string {
  return texto
    .replaceAll("{primeiro_nome}", primeiroNome(v.nome))
    .replaceAll("{nome}", nomeProprio(v.nome))
    .replaceAll("{entidade}", v.entidade)
}

/**
 * Número no formato do wa.me (55 + DDD + número), ou null. Aceita o que o
 * cadastro tiver: "(22) 99876-5432", "22998765432", "+55 22 99876-5432".
 */
export function numeroWhatsapp(telefone: string | null | undefined): string | null {
  const d = (telefone ?? "").replace(/\D/g, "").replace(/^0+/, "")
  if (d.length === 10 || d.length === 11) return `55${d}`
  if ((d.length === 12 || d.length === 13) && d.startsWith("55")) return d
  return null
}

/** Celular brasileiro: DDD + 9 + 8 dígitos. */
export function pareceCelular(telefone: string | null | undefined): boolean {
  const n = numeroWhatsapp(telefone)
  return !!n && n.length === 13 && n.charAt(4) === "9"
}

export function linkWhatsapp(telefone: string, texto: string): string | null {
  const n = numeroWhatsapp(telefone)
  return n ? `https://wa.me/${n}?text=${encodeURIComponent(texto)}` : null
}

export function formatarTelefone(telefone: string | null | undefined): string {
  const n = numeroWhatsapp(telefone)
  if (!n) return telefone ?? ""
  const d = n.slice(2)
  return d.length === 11 ? `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}` : `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`
}

export const EMAIL_VALIDO = /^[^@\s]+@[^@\s]+\.[^@\s]+$/
