/**
 * Faltas justificadas — tipos e regras PURAS (fora do `server-only`: o
 * formulário e a tela usam). Leitura/gravação: src/lib/db/faltas.ts.
 * SQL: supabase/faltas-justificadas.sql.
 *
 * O ANO é a vigência do período (o ACT; no Bubble, um período por ano civil).
 * O MÊS é o mês civil e a SEMANA vai de segunda a domingo. Contam para os
 * limites as faltas aguardando e as autorizadas — a recusada libera a vaga.
 */

import { somarDiasISO } from "@/lib/periodo-dias"

/** Tipos usados no Bubble (as 480 faltas migradas) — padrão da lista. */
export const TIPOS_FALTA_PADRAO = [
  "Acompanhamento médico de filhos, pais, cônjuge e irmãos",
  "Aniversários do funcionário, seu cônjuge, filhos e enteados",
  "Compromissos escolares dos seus filhos e enteados",
  "Necessidades pessoais burocráticas em órgãos públicos e prestadoras de serviço público",
  "Acompanhamento veterinário de animais domésticos",
]

export const MESES = [
  "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
  "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro",
]

export type ConfigFaltas = {
  /** Nulo = sem limite. */
  limiteAno: number | null
  limiteMes: number | null
  limiteSemana: number | null
  tipos: string[]
  /** A falta precisa de comprovação (já ocorrida: no pedido; futura: depois). */
  exigeComprovacao: boolean
  /** A última falta autorizada sem comprovação trava um novo pedido. */
  travaSemComprovacao: boolean
}

export const CONFIG_FALTAS_PADRAO: ConfigFaltas = {
  limiteAno: null,
  limiteMes: null,
  limiteSemana: null,
  tipos: TIPOS_FALTA_PADRAO,
  exigeComprovacao: false,
  travaSemComprovacao: false,
}

/**
 * Falta futura pode ser pedida sem o arquivo e comprovada depois; a que já
 * aconteceu (ou é hoje) só com ele, quando a comprovação é obrigatória.
 */
export function comprovacaoNoPedido(config: ConfigFaltas, dataISO: string, hojeISO: string): boolean {
  return config.exigeComprovacao && dataISO <= hojeISO
}

/** O funcionário cancela o próprio pedido enquanto a data não chega. */
export function podeCancelar(f: { situacao: SituacaoFalta; data: string | null }, hojeISO: string): boolean {
  return f.situacao !== "recusada" && !!f.data && f.data > hojeISO
}

export type SituacaoFalta = "aguardando" | "autorizada" | "recusada"

export function situacaoDaFalta(f: { autorizado: boolean | null; recusado?: boolean | null }): SituacaoFalta {
  if (f.recusado === true) return "recusada"
  if (f.autorizado === true) return "autorizada"
  return "aguardando"
}

export const ROTULO_SITUACAO_FALTA: Record<SituacaoFalta, string> = {
  aguardando: "Aguardando autorização",
  autorizada: "Autorizada",
  recusada: "Recusada",
}

/** Segunda a domingo da semana da data (AAAA-MM-DD). */
export function semanaDa(dataISO: string): { inicio: string; fim: string } {
  const dia = new Date(`${dataISO}T12:00:00Z`).getUTCDay() // 0 = domingo
  const inicio = somarDiasISO(dataISO, -((dia + 6) % 7))
  return { inicio, fim: somarDiasISO(inicio, 6) }
}

export type UsoFaltas = { ano: number; mes: number; semana: number }

/**
 * Quantas faltas (que contam) o funcionário já tem no período, no mês e na
 * semana da data. `datas` = as faltas dele que contam, já dentro do período.
 */
export function usoNaData(datas: string[], dataISO: string): UsoFaltas {
  const mes = dataISO.slice(0, 7)
  const { inicio, fim } = semanaDa(dataISO)
  return {
    ano: datas.length,
    mes: datas.filter((d) => d.slice(0, 7) === mes).length,
    semana: datas.filter((d) => d >= inicio && d <= fim).length,
  }
}

/** Conferência dos limites para UMA falta nova; devolve o motivo ou null. */
export function excedeLimite(uso: UsoFaltas, config: ConfigFaltas): string | null {
  const plural = (n: number) => `${n} falta${n === 1 ? "" : "s"} justificada${n === 1 ? "" : "s"}`
  if (config.limiteAno !== null && uso.ano + 1 > config.limiteAno) {
    return `O limite é de ${plural(config.limiteAno)} por ano (período do acordo), e já há ${uso.ano}.`
  }
  if (config.limiteMes !== null && uso.mes + 1 > config.limiteMes) {
    return `O limite é de ${plural(config.limiteMes)} por mês, e já há ${uso.mes} neste mês.`
  }
  if (config.limiteSemana !== null && uso.semana + 1 > config.limiteSemana) {
    return `O limite é de ${plural(config.limiteSemana)} por semana (segunda a domingo), e já há ${uso.semana} nesta semana.`
  }
  return null
}

/** "5 por ano · 2 por mês · sem limite por semana". */
export function resumoLimites(c: ConfigFaltas): string {
  const parte = (n: number | null, quando: string) => (n === null ? `sem limite por ${quando}` : `${n} por ${quando}`)
  return [parte(c.limiteAno, "ano"), parte(c.limiteMes, "mês"), parte(c.limiteSemana, "semana")].join(" · ")
}
