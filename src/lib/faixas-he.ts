/**
 * Faixas de hora extra do controle de ponto. O banco guarda duas faixas — as
 * colunas *_70 (faixa 1) e *_100 (faixa 2) de pessoal_registro_ponto, nomes
 * herdados do Sindipetro-NF —, mas o percentual de cada uma é da entidade
 * (pessoal_folha_config). Aqui só os rótulos; sem server-only, o formulário
 * usa no navegador. A leitura do banco fica em lib/db/ponto-config.
 */

/** Rótulo de cada faixa pela coluna: { "70": "50%", "100": "100%" }. */
export type FaixasHE = { "70": string; "100": string }

export const FAIXAS_PADRAO = { faixa1: 50, faixa2: 100 }

export function rotuloPercentual(p: number): string {
  return `${p.toLocaleString("pt-BR", { maximumFractionDigits: 2 })}%`
}

export function faixasDe(faixa1: number, faixa2: number): FaixasHE {
  return { "70": rotuloPercentual(faixa1), "100": rotuloPercentual(faixa2) }
}
