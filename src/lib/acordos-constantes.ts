/**
 * Constantes e helpers de Acordos Coletivos, compartilhados entre client e
 * server (FORA de `server-only` — badges e forms importam daqui).
 */

// ── Tipo do instrumento ──────────────────────────────────────────────────────
export const TIPOS_ACORDO = [
  { chave: "act", rotulo: "ACT (Acordo Coletivo)" },
  { chave: "cct", rotulo: "CCT (Convenção Coletiva)" },
] as const

export type TipoAcordo = (typeof TIPOS_ACORDO)[number]["chave"]

export const ROTULO_TIPO: Record<TipoAcordo, string> = {
  act: "ACT",
  cct: "CCT",
}

// ── Situação (armazenada; "vencido/vencendo" são derivados da vigência) ──────
export const SITUACOES_ACORDO = [
  { chave: "em_negociacao", rotulo: "Em negociação" },
  { chave: "vigente", rotulo: "Vigente" },
  { chave: "arquivado", rotulo: "Arquivado" },
] as const

export type SituacaoAcordo = (typeof SITUACOES_ACORDO)[number]["chave"]

// ── Categorias de cláusula ───────────────────────────────────────────────────
export const CATEGORIAS_CLAUSULA = [
  { chave: "reajuste", rotulo: "Reajuste salarial" },
  { chave: "beneficio", rotulo: "Benefício" },
  { chave: "jornada", rotulo: "Jornada" },
  { chave: "saude", rotulo: "Saúde" },
  { chave: "seguranca", rotulo: "Segurança" },
  { chave: "outro", rotulo: "Outro" },
] as const

export type CategoriaClausula = (typeof CATEGORIAS_CLAUSULA)[number]["chave"]

export const ROTULO_CATEGORIA: Record<CategoriaClausula, string> =
  Object.fromEntries(
    CATEGORIAS_CLAUSULA.map((c) => [c.chave, c.rotulo])
  ) as Record<CategoriaClausula, string>

// ── Estado de vigência (derivado) ────────────────────────────────────────────
/** Dias antes do fim da vigência que acendem o alerta (data-base p/ renegociar). */
export const DIAS_ALERTA_ACORDO = 90

export type EstadoVigencia =
  | "vigente"
  | "vencendo"
  | "vencido"
  | "sem_termo"

/**
 * Estado efetivo de um acordo `vigente`, derivado do fim da vigência vs hoje
 * (datas AAAA-MM-DD, `hoje` no fuso de SP passado pelo servidor). Só faz sentido
 * quando `situacao = 'vigente'`.
 */
export function estadoVigencia(
  vigenciaFim: string | null,
  hoje: string
): EstadoVigencia {
  if (!vigenciaFim) return "sem_termo"
  const fim = vigenciaFim.slice(0, 10)
  const h = hoje.slice(0, 10)
  if (fim < h) return "vencido"
  const limite = new Date(`${h}T00:00:00`)
  limite.setDate(limite.getDate() + DIAS_ALERTA_ACORDO)
  return fim <= limite.toISOString().slice(0, 10) ? "vencendo" : "vigente"
}
