/**
 * Chaves para achar o cadastro de uma linha de lista externa (relação de
 * pagamentos das Receitas, lista de trabalhadores): os dois lados — o que veio
 * no arquivo e o que está no banco — passam pela mesma função, para casarem
 * do mesmo jeito em toda tela. Seguro para o client.
 */

/** Nome sem acento, em maiúsculas, espaços colapsados: "José  da Silva" → "JOSE DA SILVA". */
export function chaveNome(s: string | null | undefined): string {
  return (s ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toUpperCase()
    .replace(/\s+/g, " ")
    .trim()
}

/** Matrícula na fonte: só letras e números, sem zeros à esquerda ("0012.345-6" → "123456"). */
export function chaveMatricula(v: string | null | undefined): string {
  return String(v ?? "")
    .replace(/[^0-9a-z]/gi, "")
    .replace(/^0+/, "")
    .toUpperCase()
}
