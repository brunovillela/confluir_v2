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

/**
 * Nível de sigilo do usuário (31/10/2026): três chaves CUMULATIVAS em
 * `permissoes` — vale a mais alta marcada; nenhuma = "nenhum" (não vê
 * deliberação alguma). Ver a migração 20261031160131.
 */
export type NivelSigilo = "nenhum" | SigiloDeliberacao

export const CHAVES_SIGILO: Record<SigiloDeliberacao, string> = {
  livre: "deliberacoes_livre",
  reservado: "deliberacoes_reservado",
  restrito: "deliberacoes_restrito",
}

/** Todas as chaves que dão algum acesso às deliberações. */
export const CHAVES_DELIBERACOES = Object.values(CHAVES_SIGILO)

export const ROTULO_NIVEL_SIGILO: Record<NivelSigilo, string> = {
  nenhum: "nenhum",
  livre: "livre",
  reservado: "até reservado",
  restrito: "até restrito (todas)",
}

export function nivelSigilo(permissoes: Record<string, unknown> | null | undefined): NivelSigilo {
  if (!permissoes) return "nenhum"
  for (const s of ["restrito", "reservado", "livre"] as const) {
    if (permissoes[CHAVES_SIGILO[s]] === true) return s
  }
  return "nenhum"
}

/** Os graus de sigilo que o nível alcança (vazio = nenhum). */
export function sigilosVisiveis(nivel: NivelSigilo): SigiloDeliberacao[] {
  if (nivel === "nenhum") return []
  const ate = SIGILOS_DELIBERACAO.findIndex((s) => s.chave === nivel)
  return SIGILOS_DELIBERACAO.slice(0, ate + 1).map((s) => s.chave)
}

/**
 * Antecedência do lembrete de prazo: a deliberação aberta que vence de hoje
 * até daqui a tantos dias entra na caixa de entrada do responsável.
 */
export const DIAS_AVISO_PRAZO = 3

/** "AAAA-MM-DD" + n dias (datas de calendário, sem fuso). */
export function somarDias(data: string, dias: number): string {
  const d = new Date(`${data}T12:00:00Z`)
  d.setUTCDate(d.getUTCDate() + dias)
  return d.toISOString().slice(0, 10)
}
