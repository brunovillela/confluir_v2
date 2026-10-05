/**
 * Raízes confiadas para a validação de assinatura (onda 5, A4).
 *
 * A cadeia do certificado do signatário é verificada criptograficamente até
 * o último certificado que vier dentro da própria assinatura (quase sempre a
 * raiz ICP-Brasil). Para dizer "esta raiz é a da ICP-Brasil" com certeza,
 * comparamos o SHA-256 do certificado-raiz com esta lista. Enquanto a lista
 * estiver vazia, o resultado diz "cadeia fecha numa raiz com nome ICP-Brasil,
 * não conferida contra a lista" — íntegra, mas com ressalva.
 *
 * Para preencher: baixe as raízes em https://acraiz.icpbrasil.gov.br
 * (ICP-Brasil v5, v10, v11…), rode `openssl x509 -in RAIZ.crt -noout
 * -fingerprint -sha256` e cole aqui o nome e o fingerprint (sem ":").
 */
export const RAIZES_CONFIADAS: { nome: string; sha256: string }[] = []

export function raizConfiada(sha256: string): boolean {
  const f = sha256.replace(/:/g, "").toUpperCase()
  return RAIZES_CONFIADAS.some((r) => r.sha256.replace(/:/g, "").toUpperCase() === f)
}
