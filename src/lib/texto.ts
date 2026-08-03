/**
 * Normaliza texto para busca insensível a acento: decompõe (NFD), remove os
 * diacríticos, baixa a caixa. Espelha a coluna gerada `*_norm` no banco
 * (`f_unaccent(lower(...))`, ver supabase/busca-filiados.sql) — o app passa o
 * termo já por aqui e busca na coluna normalizada.
 */
export function semAcento(s: string): string {
  return s
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .trim()
}

/** Preposições de nomes próprios que ficam em minúsculo (exceto no início). */
const PREPOSICOES_NOME = new Set(["de", "da", "das", "do", "dos", "e"])

/**
 * Capitaliza um nome próprio: primeira letra de cada palavra em maiúscula, o
 * resto em minúscula, mantendo as preposições (de, da, das, do, dos, e) em
 * minúsculo — salvo quando são a primeira palavra. Trata hífen (Ana-Maria).
 */
export function capitalizarNome(nome: string): string {
  const limpo = nome.trim().replace(/\s+/g, " ").toLocaleLowerCase("pt-BR")
  if (!limpo) return ""
  const cap = (p: string) =>
    p ? p.charAt(0).toLocaleUpperCase("pt-BR") + p.slice(1) : p
  return limpo
    .split(" ")
    .map((palavra, i) =>
      i > 0 && PREPOSICOES_NOME.has(palavra)
        ? palavra
        : palavra.split("-").map(cap).join("-")
    )
    .join(" ")
}
