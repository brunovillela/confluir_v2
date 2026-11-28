/**
 * E-MAIL DO CADASTRO (27/11/2026): o código de acesso vai aos e-mails da
 * ficha, e um erro de digitação ali ("hotmail..com", "petrobras.com. br",
 * "gmail.com.") fazia o envio falhar sem aviso — a pessoa esperava o código
 * no e-mail que usa e nunca recebia. Esta é a régua única: o envio do código,
 * a conferência do código e o vínculo da conta (lib/auth-identidade.ts) leem
 * o e-mail da ficha por aqui, e a Saúde dos cadastros aponta o que sobra.
 */

/** Formato aceito (o mesmo que o Supabase Auth aceita na prática). */
const FORMATO = /^[a-z0-9._%+'-]+@[a-z0-9-]+(\.[a-z0-9-]+)*\.[a-z]{2,}$/

/** Domínio sem o nome do provedor ("fulano@.com.br" → "com.br"): não é e-mail. */
const SEM_NOME = /^(com|net|org|gov|edu|mil|br)(\.[a-z]{2,3})?$/

export function emailValido(email: string | null | undefined): boolean {
  const e = (email ?? "").trim().toLowerCase()
  return FORMATO.test(e) && !SEM_NOME.test(e.slice(e.indexOf("@") + 1))
}

/**
 * Corrige só o que é erro óbvio de digitação, sem adivinhar endereço:
 * espaço dentro do endereço, ponto repetido, ponto/vírgula/aspas nas pontas.
 * Devolve null quando o resultado ainda não é um e-mail válido.
 */
export function corrigirEmailObvio(bruto: string | null | undefined): string | null {
  if (!bruto) return null
  let e = bruto.trim().toLowerCase()
  if (!e) return null
  // Espaço: no nome some; no domínio vira ponto ("petrobras.com br" e
  // "petrobras.com. br" → "petrobras.com.br").
  const arroba = e.indexOf("@")
  e =
    arroba < 0
      ? e.replace(/\s+/g, "")
      : e.slice(0, arroba).replace(/\s+/g, "") + "@" + e.slice(arroba + 1).trim().replace(/\s+/g, ".")
  e = e.replace(/^[.,;:'"`<>()]+|[.,;:'"`<>()]+$/g, "") // pontas: "gmail.com." → "gmail.com"
  e = e.replace(/\.{2,}/g, ".") // "hotmail..com" → "hotmail.com"
  e = e.replace(/\.@|@\./g, "@") // "nome.@gmail" / "nome@.gmail"
  return emailValido(e) ? e : null
}

/**
 * Os e-mails de envio de uma lista de valores da ficha: corrigidos quando o
 * erro é óbvio, sem repetição, sem os que não têm conserto.
 */
export function emailsDeEnvio(valores: (string | null | undefined)[]): string[] {
  const saida: string[] = []
  for (const v of valores) {
    const e = corrigirEmailObvio(v)
    if (e && !saida.includes(e)) saida.push(e)
  }
  return saida
}
