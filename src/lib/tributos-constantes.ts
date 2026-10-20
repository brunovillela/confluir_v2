/**
 * Tributos (Financeiro › Tributos) — constantes seguras para o client.
 * Ver docs/plano-tributos.md e src/lib/db/tributos.ts.
 */

export const TIPO_ORDEM_TRIBUTO = "Tributo"

export const ESFERAS_TRIBUTO = [
  { valor: "federal", rotulo: "Federal" },
  { valor: "estadual", rotulo: "Estadual" },
  { valor: "municipal", rotulo: "Municipal" },
  { valor: "trabalhista", rotulo: "Trabalhista e previdenciário" },
] as const

export const PERIODICIDADES_TRIBUTO = [
  { valor: "mensal", rotulo: "Mensal", descricao: "Gera as guias previstas de cada mês, pelo dia de vencimento." },
  { valor: "anual", rotulo: "Anual", descricao: "Uma guia (ou parcelas) por ano — lançada quando chega." },
  { valor: "eventual", rotulo: "Eventual", descricao: "Sem calendário: cada guia é lançada quando aparece." },
] as const

export type EsferaTributo = (typeof ESFERAS_TRIBUTO)[number]["valor"]
export type PeriodicidadeTributo = (typeof PERIODICIDADES_TRIBUTO)[number]["valor"]
export type SituacaoGuia = "aguardando_guia" | "lancado" | "cancelado"

export function rotuloEsfera(v: string | null): string {
  return ESFERAS_TRIBUTO.find((e) => e.valor === v)?.rotulo ?? v ?? "—"
}

export function rotuloPeriodicidade(v: string | null): string {
  return PERIODICIDADES_TRIBUTO.find((p) => p.valor === v)?.rotulo ?? v ?? "—"
}

export const ROTULO_SITUACAO_GUIA: Record<SituacaoGuia, string> = {
  aguardando_guia: "Aguardando guia",
  lancado: "Lançada",
  cancelado: "Cancelada",
}

/** "2026-09-01" → "09/2026". */
export function rotuloCompetencia(inicio: string | null, fim?: string | null): string {
  if (!inicio) return "—"
  const [a, m, d] = inicio.split("-")
  // Competência de um mês inteiro (ou do legado, de um dia só) → "MM/AAAA".
  if (!fim || (d === "01" && fim.slice(0, 7) === inicio.slice(0, 7)) || fim === inicio) return `${m}/${a}`
  const [af, mf, df] = fim.split("-")
  return `${d}/${m}/${a} a ${df}/${mf}/${af}`
}
