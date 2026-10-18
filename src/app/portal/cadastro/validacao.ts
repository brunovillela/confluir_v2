/**
 * Regras do Meu cadastro, iguais no navegador e no servidor (achados A70 e
 * A25 da avaliação de 11/10/2026). O formulário confere antes de enviar, para
 * a pessoa ver o erro junto do campo sem esperar a volta; a action confere de
 * novo, porque o que vem do formulário não é confiável.
 *
 * Sem "use server" de propósito: as constantes e funções puras daqui servem
 * aos dois lados.
 */

import { digitosDoCep } from "@/lib/cep"

/** Campos de texto que o próprio filiado altera (contato e endereço). */
export const CAMPOS_TEXTO = [
  "email_pessoal",
  "email_corporativo",
  "telefone_1",
  "telefone_2",
  "endereco_cep",
  "endereco_logradouro",
  "endereco_numero",
  "endereco_complemento",
  "endereco_bairro",
  "endereco_cidade",
  "endereco_estado",
] as const

export type CampoCadastro = (typeof CAMPOS_TEXTO)[number]

/**
 * Os grupos que a entidade libera ou trava (Filiados › Área do associado ›
 * Meu cadastro › "O que o associado pode alterar"; as chaves são os itens da
 * opção `campos_editaveis`). O que fica travado aparece só para consulta, e a
 * action não grava — mantém o valor do cadastro.
 */
export const GRUPOS_CADASTRO = {
  email_pessoal: ["email_pessoal"],
  email_corporativo: ["email_corporativo"],
  telefones: ["telefone_1", "telefone_2"],
  endereco: [
    "endereco_cep",
    "endereco_logradouro",
    "endereco_numero",
    "endereco_complemento",
    "endereco_bairro",
    "endereco_cidade",
    "endereco_estado",
  ],
} as const satisfies Record<string, readonly CampoCadastro[]>

/** Os campos liberados pelos grupos escolhidos (grupo desconhecido é ignorado). */
export function camposEditaveis(grupos: readonly string[]): Set<CampoCadastro> {
  const campos = new Set<CampoCadastro>()
  for (const [grupo, lista] of Object.entries(GRUPOS_CADASTRO)) {
    if (grupos.includes(grupo)) for (const c of lista) campos.add(c)
  }
  return campos
}

/**
 * Tamanho máximo de cada campo (o banco aceita mais; isto é só bom senso).
 * Folgado o bastante para o que veio do cadastro antigo (em 11/10/2026 o
 * maior complemento tinha 131 caracteres e o maior telefone, 30) — ninguém
 * fica impedido de salvar por um valor que já estava lá.
 */
export const LIMITE_CAMPO: Record<CampoCadastro, number> = {
  email_pessoal: 254,
  email_corporativo: 254,
  telefone_1: 40,
  telefone_2: 40,
  endereco_cep: 20,
  endereco_logradouro: 300,
  endereco_numero: 30,
  endereco_complemento: 300,
  endereco_bairro: 150,
  endereco_cidade: 150,
  endereco_estado: 40,
}

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export function soDigitos(valor: string): string {
  return valor.replace(/\D/g, "")
}

/** E-mail comparável: sem espaços nas pontas e em minúsculas. */
export function normalizarEmail(valor: string | null | undefined): string | null {
  const v = (valor ?? "").trim().toLowerCase()
  return v === "" ? null : v
}

/**
 * Telefone opcional; preenchido, tem DDD + número (10 ou 11 dígitos), como
 * nos contatos de emergência. Cadastros migrados têm muito número sem DDD —
 * a mensagem diz o que falta, porque a pessoa vai precisar corrigir para
 * salvar qualquer outra coisa.
 */
export function erroTelefone(rotulo: string, valor: string): string | null {
  const d = soDigitos(valor)
  if (d === "") return null
  if (d.length < 10) {
    return `${rotulo} está incompleto — informe com DDD, ex.: (22) 99999-9999.`
  }
  if (d.length > 11) {
    return `${rotulo} tem dígitos demais — informe um número só, com DDD, ex.: (22) 99999-9999.`
  }
  if (d.startsWith("0")) {
    return `Informe o DDD de ${rotulo.toLowerCase()} sem o zero na frente, ex.: (22) 99999-9999.`
  }
  return null
}

/** CEP opcional; preenchido, tem 8 dígitos. */
export function erroCep(valor: string): string | null {
  const d = digitosDoCep(valor)
  if (d === "" || d.length === 8) return null
  return "O CEP tem 8 números — confira, ex.: 28.000-000."
}

export function erroEmail(rotulo: string, valor: string): string | null {
  const v = valor.trim()
  if (v === "") return null
  if (v.length > LIMITE_CAMPO.email_pessoal || !EMAIL.test(v)) {
    return `${rotulo} não parece um endereço válido — confira, ex.: nome@exemplo.com.br.`
  }
  return null
}

/**
 * O e-mail de acesso é o que o login usa: o pessoal, e na falta dele o
 * corporativo (buscarFiliadoPorCpf em lib/contas.ts). É também para ele que
 * vão o código de acesso, o link de votação e os avisos.
 */
export function emailDeAcesso(pessoal: string | null | undefined, corporativo: string | null | undefined): string | null {
  return normalizarEmail(pessoal) ?? normalizarEmail(corporativo)
}

export type TrocaDeAcesso = {
  /** O e-mail de acesso de hoje. */
  atual: string
  /** O que passaria a ser o e-mail de acesso. */
  novo: string | null
  /** O campo a marcar: o que traz o novo endereço ou o que perdeu o atual. */
  campo: "email_pessoal" | "email_corporativo"
}

/**
 * Detecta quando o salvamento TROCARIA o e-mail de acesso. A troca ainda não
 * pode ser feita por aqui (ver a action): o login por senha procura a conta
 * pelo e-mail do cadastro e o CPF já está ligado à conta do e-mail atual, então
 * mudar só o cadastro tranca a pessoa do lado de fora. Voltar ao e-mail da
 * própria conta de acesso (`emailConta`) não é troca — conserta o login.
 *
 * Cadastro sem e-mail nenhum de quem está logado (a secretaria apagou depois
 * do vínculo): o e-mail de acesso passa a ser o da conta — gravar outro
 * endereço trancaria a pessoa do mesmo jeito.
 */
export function trocaDoEmailDeAcesso(p: {
  atual: string | null | undefined
  emailConta?: string | null
  /** Valores do formulário. */
  pessoal: string
  corporativo: string
  /** O e-mail de acesso de hoje estava no campo pessoal? */
  atualNoPessoal: boolean
}): TrocaDeAcesso | null {
  const atual = normalizarEmail(p.atual) ?? normalizarEmail(p.emailConta)
  if (!atual) return null
  const novo = emailDeAcesso(p.pessoal, p.corporativo)
  if (novo === atual) return null
  if (novo && novo === normalizarEmail(p.emailConta)) return null
  return {
    atual,
    novo,
    campo: normalizarEmail(p.pessoal) || p.atualNoPessoal ? "email_pessoal" : "email_corporativo",
  }
}

/** Mensagem da troca recusada — a mesma no formulário e na action. */
export function mensagemTrocaDeAcesso(troca: TrocaDeAcesso): string {
  const destino = troca.novo
    ? `passaria de ${troca.atual} para ${troca.novo}`
    : `deixaria de ser ${troca.atual}`
  return `Assim o seu e-mail de acesso ${destino}. A troca do e-mail de acesso ainda não pode ser confirmada por aqui — peça à secretaria pelo Atendimento.`
}

export const ERRO_SEM_EMAIL =
  "Informe ao menos um e-mail: é por ele que chegam o código de acesso, o link de votação e os avisos."
