import { mesmoTitular, validarCnpj, validarCpf } from "@/lib/cpf"
import { formatarCnpjCpf } from "@/lib/mascaras"

/**
 * TITULAR DA CHAVE PIX (17/11/2026). Uma ordem foi devolvida porque "o nome do
 * favorecido não confere com o Pix informado". Chave CPF/CNPJ se compara com o
 * documento do fornecedor já no cadastro; telefone, e-mail e aleatória não
 * dizem de quem são — só o app do banco mostra o nome, então o cadastro guarda
 * o titular esperado e a ordem o exibe para quem paga conferir. Puro.
 */

const digitos = (v: string | null | undefined) => (v ?? "").replace(/\D/g, "")

/** O CPF/CNPJ que a chave é, quando o tipo é documento e os dígitos conferem. */
export function documentoDaChave(tipo: string | null | undefined, chave: string | null | undefined): string | null {
  if (!tipo || !/cpf|cnpj/i.test(tipo)) return null
  const d = digitos(chave)
  if (d.length === 11 && validarCpf(d)) return d
  if (d.length === 14 && validarCnpj(d)) return d
  return null
}

export type ConferenciaTitular =
  | { situacao: "mesmo"; documento: string }
  | { situacao: "outro"; documento: string; mensagem: string }
  | { situacao: "nao_comparavel" }

/**
 * A chave é do fornecedor? CNPJ da mesma raiz (matriz e filial) conta como o
 * mesmo titular. Fornecedor sem documento: não há com o que comparar.
 */
export function conferirTitularPix(
  tipo: string | null | undefined,
  chave: string | null | undefined,
  documentoFornecedor: string | null | undefined
): ConferenciaTitular {
  const doc = documentoDaChave(tipo, chave)
  const forn = digitos(documentoFornecedor)
  if (!doc || !forn) return { situacao: "nao_comparavel" }
  if (mesmoTitular(doc, forn)) return { situacao: "mesmo", documento: doc }
  return {
    situacao: "outro",
    documento: doc,
    mensagem: `A chave Pix é do ${doc.length === 11 ? "CPF" : "CNPJ"} ${formatarCnpjCpf(doc)}, que não é o do fornecedor (${formatarCnpjCpf(forn)}).`,
  }
}

/** Tipos de chave que não dizem de quem são (só o app do banco mostra o nome). */
export function chaveSemDocumento(tipo: string | null | undefined): boolean {
  return !!tipo && !/cpf|cnpj/i.test(tipo)
}
