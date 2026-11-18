import { limparCpf, validarCpf } from "@/lib/cpf"

/**
 * Conferência de UMA linha da lista de aptos de uma rodada (17/11/2026). A
 * mesma regra vale para o CSV modelo, para a lista lida pela IA e para a
 * confirmação da prévia (o servidor confere de novo o que a tela devolve).
 *
 * - CPF é opcional (as empresas nem sempre mandam; o eleitor informa no
 *   primeiro acesso), mas, se vier, tem de ser válido;
 * - sem CPF, a linha precisa de nome ou matrícula para identificar a pessoa;
 * - nome começando por "EXEMPLO" é linha esquecida da planilha modelo.
 */

export type CamposApto = {
  cpf?: string | null
  nome?: string | null
  matricula?: string | null
  email?: string | null
  telefone?: string | null
}

export type LinhaApto = {
  linha: number
  cpf: string | null
  nome_completo: string | null
  matricula: string | null
  email: string | null
  telefone: string | null
}

export type ConferenciaApto = { linha: LinhaApto } | { exemplo: true } | { erro: string }

const limpo = (v: string | null | undefined, max: number) => {
  const t = (v ?? "").replace(/\s+/g, " ").trim()
  return t ? t.slice(0, max) : null
}

export function conferirLinhaApto(campos: CamposApto, numero: number): ConferenciaApto {
  const nome = limpo(campos.nome, 200)
  if (nome && /^exemplo\b/i.test(nome)) return { exemplo: true }
  const cpfBruto = (campos.cpf ?? "").trim()
  const cpf = limparCpf(cpfBruto)
  if (cpfBruto !== "" && !validarCpf(cpf)) return { erro: `CPF inválido: ${cpfBruto}` }
  const matricula = limpo(campos.matricula, 60)
  if (cpfBruto === "" && !nome && !matricula) {
    return { erro: "Linha sem CPF, nome ou matrícula — impossível identificar." }
  }
  const email = limpo(campos.email, 200)
  const telefone = limpo(campos.telefone, 40)
  return {
    linha: {
      linha: numero,
      cpf: cpfBruto === "" ? null : cpf,
      nome_completo: nome,
      matricula,
      email: email ? email.toLowerCase() : null,
      telefone,
    },
  }
}
