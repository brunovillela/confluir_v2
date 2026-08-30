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
 * `online` e `urnas_de_votacao` de `voto_assembleias`. As quatro modalidades
 * (regra do usuário, 2026-08-29):
 * - online   — área do filiado / ambiente público (voto em `voto_online`);
 * - urna     — presencial com urnas (físicas ou digitais) no local;
 * - hibrida  — online E presencial com urnas ao mesmo tempo;
 * - reuniao  — reunião de colaboradores na base (resultado agregado em
 *   `voto_votacao_respostas`).
 * online e urna/híbrida gravam voto individual em `voto_online` (secreto).
 */
export const MODALIDADES = ["online", "urna", "hibrida", "reuniao"] as const

export type Modalidade = (typeof MODALIDADES)[number]

export const ROTULOS_MODALIDADE: Record<Modalidade, string> = {
  online: "Online",
  urna: "Presencial com urnas",
  hibrida: "Híbrida (online + urnas)",
  reuniao: "Reunião de colaboradores",
}

export function derivarModalidade(a: {
  online?: unknown
  urnas_de_votacao?: unknown
}): Modalidade {
  const temOnline = a.online === true
  const temUrna = a.urnas_de_votacao === true
  if (temOnline && temUrna) return "hibrida"
  if (temOnline) return "online"
  if (temUrna) return "urna"
  return "reuniao"
}

export function flagsDaModalidade(m: Modalidade): {
  online: boolean
  urnas_de_votacao: boolean
} {
  return {
    online: m === "online" || m === "hibrida",
    urnas_de_votacao: m === "urna" || m === "hibrida",
  }
}

/** A modalidade aceita voto online (área do filiado / público)? */
export function temVotoOnline(m: Modalidade): boolean {
  return m === "online" || m === "hibrida"
}

/** A modalidade usa urnas presenciais (com mesário)? */
export function temUrna(m: Modalidade): boolean {
  return m === "urna" || m === "hibrida"
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
