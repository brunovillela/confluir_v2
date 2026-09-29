/**
 * Reuniões com o empregador e setoriais (Representação Sindical). Client-safe.
 * Ver supabase/representacao-reunioes.sql.
 */

export const TIPOS_REUNIAO_REP = [
  {
    chave: "empregador",
    rotulo: "Reunião com o empregador",
    curto: "Reunião",
    plural: "Reuniões",
    explicacao: "Sindicato × empresa: negociação, mesa permanente, comissão, audiência.",
  },
  {
    chave: "setorial",
    rotulo: "Setorial",
    curto: "Setorial",
    plural: "Setoriais",
    explicacao: "Sindicato × trabalhadores da empresa, numa unidade ou local de trabalho.",
  },
] as const
export type TipoReuniaoRep = (typeof TIPOS_REUNIAO_REP)[number]["chave"]

export function tipoReuniaoRep(v: unknown): TipoReuniaoRep {
  return v === "setorial" ? "setorial" : "empregador"
}
export const INFO_TIPO_REUNIAO = Object.fromEntries(TIPOS_REUNIAO_REP.map((t) => [t.chave, t])) as Record<
  TipoReuniaoRep,
  (typeof TIPOS_REUNIAO_REP)[number]
>

export const SITUACOES_REUNIAO_REP = [
  { chave: "agendada", rotulo: "Agendada" },
  { chave: "realizada", rotulo: "Realizada" },
  { chave: "cancelada", rotulo: "Cancelada" },
] as const
export type SituacaoReuniaoRep = (typeof SITUACOES_REUNIAO_REP)[number]["chave"]
export const ROTULO_SITUACAO_REUNIAO: Record<SituacaoReuniaoRep, string> = {
  agendada: "Agendada",
  realizada: "Realizada",
  cancelada: "Cancelada",
}
export function situacaoReuniaoRep(v: unknown): SituacaoReuniaoRep {
  return SITUACOES_REUNIAO_REP.some((s) => s.chave === v) ? (v as SituacaoReuniaoRep) : "realizada"
}

export const MODALIDADES_REUNIAO = [
  { chave: "presencial", rotulo: "Presencial" },
  { chave: "online", rotulo: "On-line" },
  { chave: "hibrida", rotulo: "Híbrida" },
] as const
export type ModalidadeReuniao = (typeof MODALIDADES_REUNIAO)[number]["chave"]
export const ROTULO_MODALIDADE: Record<ModalidadeReuniao, string> = {
  presencial: "Presencial",
  online: "On-line",
  hibrida: "Híbrida",
}
export function modalidadeReuniao(v: unknown): ModalidadeReuniao {
  return MODALIDADES_REUNIAO.some((m) => m.chave === v) ? (v as ModalidadeReuniao) : "presencial"
}

export type LadoParticipante = "sindicato" | "empresa" | "trabalhador"

/** "Nome — cargo" (ou "Nome - cargo", "Nome, cargo") → partes. */
export function separarNomeCargo(linha: string): { nome: string; cargo: string | null } {
  const t = linha.trim()
  const m = /^(.*?)\s+[—–-]\s+(.+)$/.exec(t) ?? /^(.*?),\s+(.+)$/.exec(t)
  return m ? { nome: m[1].trim(), cargo: m[2].trim() || null } : { nome: t, cargo: null }
}

export function juntarNomeCargo(p: { nome: string | null; cargo: string | null }): string {
  return [p.nome, p.cargo].filter(Boolean).join(" — ")
}
