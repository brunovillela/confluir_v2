/**
 * Deliberações das atas — situações e graus de sigilo. Client-safe (usado por
 * forms e listas) — não importa de server-only.
 */
export const SITUACOES_DELIBERACAO = [
  { chave: "a_cumprir", rotulo: "A cumprir" },
  { chave: "em_execucao", rotulo: "Em execução" },
  { chave: "cumprida", rotulo: "Cumprida" },
  { chave: "cancelada", rotulo: "Cancelada" },
] as const

export type SituacaoDeliberacao = (typeof SITUACOES_DELIBERACAO)[number]["chave"]

export const ROTULO_SITUACAO_DELIBERACAO = Object.fromEntries(
  SITUACOES_DELIBERACAO.map((s) => [s.chave, s.rotulo])
) as Record<SituacaoDeliberacao, string>

export function ehSituacaoDeliberacao(v: unknown): v is SituacaoDeliberacao {
  return SITUACOES_DELIBERACAO.some((s) => s.chave === v)
}

/** Do menos ao mais sigiloso — a ordem importa para o nível de acesso. */
export const SIGILOS_DELIBERACAO = [
  { chave: "livre", rotulo: "Livre", descricao: "pode circular entre quem consulta as deliberações" },
  { chave: "reservado", rotulo: "Reservado", descricao: "só para quem tem acesso a deliberações reservadas" },
  { chave: "restrito", rotulo: "Restrito", descricao: "só para quem tem acesso a deliberações restritas" },
] as const

export type SigiloDeliberacao = (typeof SIGILOS_DELIBERACAO)[number]["chave"]

export const ROTULO_SIGILO_DELIBERACAO = Object.fromEntries(
  SIGILOS_DELIBERACAO.map((s) => [s.chave, s.rotulo])
) as Record<SigiloDeliberacao, string>

export function ehSigiloDeliberacao(v: unknown): v is SigiloDeliberacao {
  return SIGILOS_DELIBERACAO.some((s) => s.chave === v)
}
