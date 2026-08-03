/**
 * Assembleias — constantes compartilhadas entre server e client.
 *
 * Hierarquia (confirmada com o usuário em 2026-07-19):
 * campanha (tema, fontes pagadoras) → rodada (período) → assembleias.
 * Perguntas e lista de aptos pertencem à RODADA — as assembleias "usam"
 * as perguntas da sua rodada.
 */

/**
 * Modalidade da assembleia — não é coluna: deriva das flags legadas
 * `online` e `urnas_de_votacao` de `voto_assembleias`.
 * - online e urna gravam voto individual em `voto_online`;
 * - reunião de trabalhadores tem resultado agregado em
 *   `voto_votacao_respostas` (lançamento fica para a fase presencial).
 */
export const MODALIDADES = ["online", "urna", "reuniao"] as const

export type Modalidade = (typeof MODALIDADES)[number]

export const ROTULOS_MODALIDADE: Record<Modalidade, string> = {
  online: "Online",
  urna: "Urna com mesário",
  reuniao: "Reunião de trabalhadores",
}

export function derivarModalidade(a: {
  online?: unknown
  urnas_de_votacao?: unknown
}): Modalidade {
  if (a.online === true) return "online"
  if (a.urnas_de_votacao === true) return "urna"
  return "reuniao"
}

export function flagsDaModalidade(m: Modalidade): {
  online: boolean
  urnas_de_votacao: boolean
} {
  return { online: m === "online", urnas_de_votacao: m === "urna" }
}

export function hojeLocalISO(): string {
  const d = new Date()
  return [
    d.getFullYear(),
    String(d.getMonth() + 1).padStart(2, "0"),
    String(d.getDate()).padStart(2, "0"),
  ].join("-")
}

/**
 * Travas de edição da rodada (regras do usuário, 2026-07-20):
 * - Perguntas e opções: só enquanto a rodada NÃO tem assembleias cadastradas
 *   e o período NÃO começou.
 * - Assembleias: só com pelo menos uma pergunta com opções e enquanto o
 *   período NÃO terminou.
 */
/** Sem data de início, um término já alcançado também prova que iniciou. */
export function periodoIniciado(
  inicio: string | null,
  termino: string | null
): boolean {
  const hoje = hojeLocalISO()
  return (
    (inicio !== null && inicio <= hoje) ||
    (termino !== null && termino <= hoje)
  )
}

export function periodoTerminado(termino: string | null): boolean {
  return termino !== null && termino < hojeLocalISO()
}

export const MOTIVO_PERGUNTAS_BLOQUEADAS = {
  assembleias:
    "A rodada já tem assembleias cadastradas — perguntas e opções não podem mais ser alteradas.",
  periodo:
    "O período da rodada já começou — perguntas e opções não podem mais ser alteradas.",
} as const

export const MOTIVO_ASSEMBLEIAS_BLOQUEADAS = {
  semPerguntas:
    "Cadastre pelo menos uma pergunta com opções de resposta antes de criar assembleias.",
  periodo:
    "O período da rodada já terminou — assembleias não podem mais ser alteradas.",
} as const
