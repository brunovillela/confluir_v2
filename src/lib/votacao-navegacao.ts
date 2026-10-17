/**
 * Endereços das Votações (reorganização de 17/10/2026). Sem "server-only": as
 * telas do cliente montam os links com o contexto de fonte (`?fonte=`).
 */

export const RAIZ_VOTACOES = "/painel/representacao/votacoes"
/** Chave do grupo das campanhas sem fonte pagadora. */
export const SEM_FONTE = "sem-fonte"

export const hrefFonte = (id: string) => `${RAIZ_VOTACOES}/fontes/${id}`
export const hrefCampanha = (id: string, fonte?: string | null) => comFonte(`${RAIZ_VOTACOES}/campanhas/${id}`, fonte)
export const hrefRodada = (id: string, fonte?: string | null, aba?: string) =>
  comFonte(`${RAIZ_VOTACOES}/rodadas/${id}`, fonte, aba ? { aba } : {})
export const hrefAssembleia = (id: string, fonte?: string | null, aba?: string) =>
  comFonte(`${RAIZ_VOTACOES}/assembleias/${id}`, fonte, aba ? { aba } : {})

/** Acrescenta o contexto de fonte (`?fonte=`) a um endereço das Votações. */
export function comFonte(href: string, fonteId: string | null | undefined, extras: Record<string, string> = {}): string {
  const [base, busca = ""] = href.split("?")
  const q = new URLSearchParams(busca)
  if (fonteId) q.set("fonte", fonteId)
  for (const [k, v] of Object.entries(extras)) q.set(k, v)
  const s = q.toString()
  return s ? `${base}?${s}` : base
}
