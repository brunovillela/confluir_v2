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

// ── Temas de cláusula (comparador) ───────────────────────────────────────────
/**
 * Temas mais finos que as categorias acima: é por eles que o comparador
 * agrupa e filtra, e que se compara o mesmo assunto entre empresas. A
 * categoria antiga continua gravada (derivada do tema) por compatibilidade.
 */
export const TEMAS_CLAUSULA = [
  { chave: "remuneracao", rotulo: "Salário e reajuste", categoria: "reajuste" },
  { chave: "adicionais", rotulo: "Adicionais e horas extras", categoria: "reajuste" },
  { chave: "beneficios", rotulo: "Benefícios", categoria: "beneficio" },
  { chave: "saude", rotulo: "Saúde e plano de saúde", categoria: "saude" },
  { chave: "previdencia", rotulo: "Previdência", categoria: "beneficio" },
  { chave: "jornada", rotulo: "Jornada, turnos e escalas", categoria: "jornada" },
  { chave: "ferias_licencas", rotulo: "Férias, folgas e licenças", categoria: "jornada" },
  { chave: "emprego", rotulo: "Emprego, estabilidade e desligamento", categoria: "outro" },
  { chave: "plr", rotulo: "PLR / participação nos resultados", categoria: "beneficio" },
  { chave: "sms", rotulo: "Segurança e saúde no trabalho", categoria: "seguranca" },
  { chave: "sindical", rotulo: "Relação sindical", categoria: "outro" },
  { chave: "igualdade", rotulo: "Igualdade, diversidade e assédio", categoria: "outro" },
  { chave: "gerais", rotulo: "Vigência e disposições gerais", categoria: "outro" },
  { chave: "outro", rotulo: "Outro", categoria: "outro" },
] as const satisfies readonly { chave: string; rotulo: string; categoria: CategoriaClausula }[]

export type TemaClausula = (typeof TEMAS_CLAUSULA)[number]["chave"]

export function temaClausula(valor: unknown): TemaClausula | null {
  return TEMAS_CLAUSULA.some((t) => t.chave === valor) ? (valor as TemaClausula) : null
}

export const ROTULO_TEMA: Record<TemaClausula, string> = Object.fromEntries(
  TEMAS_CLAUSULA.map((t) => [t.chave, t.rotulo])
) as Record<TemaClausula, string>

export function categoriaDoTema(tema: TemaClausula): CategoriaClausula {
  return TEMAS_CLAUSULA.find((t) => t.chave === tema)?.categoria ?? "outro"
}

/** Cláusula sem tema (digitada antes dos temas) → tema pela categoria antiga. */
export function temaDaCategoria(c: CategoriaClausula): TemaClausula {
  const mapa: Record<CategoriaClausula, TemaClausula> = {
    reajuste: "remuneracao",
    beneficio: "beneficios",
    jornada: "jornada",
    saude: "saude",
    seguranca: "sms",
    outro: "outro",
  }
  return mapa[c]
}

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
