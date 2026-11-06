import { ehDiaUtil } from "@/lib/feriados"
import { formatarData } from "@/lib/formato"

/**
 * Regra de pagamento das férias que a ENTIDADE informa (em geral, a cláusula
 * do acordo coletivo). O aviso de férias não traz regra de lei escrita no
 * código: sem prazo informado, não mostra data de pagamento.
 */
export type RegraPagamentoFerias = {
  /** Dias antes do início do gozo; null = a entidade não informou. */
  dias: number | null
  uteis: boolean
  /** O que é pago (ex.: "gratificação de férias de 100% da remuneração"). */
  descricao: string | null
  /** Fundamento citado no aviso (ex.: "cláusula 3ª do ACT"). */
  fundamento: string | null
}

export const REGRA_PAGAMENTO_VAZIA: RegraPagamentoFerias = { dias: null, uteis: false, descricao: null, fundamento: null }

/** O que vai no aviso de um gozo: a regra aplicada e a data resultante. */
export type PagamentoDoAviso = {
  ate: string
  dias: number
  uteis: boolean
  descricao: string | null
  fundamento: string | null
}

const somar = (iso: string, dias: number) => {
  const d = new Date(`${iso}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + dias)
  return d.toISOString().slice(0, 10)
}

/**
 * Data limite do pagamento: `dias` antes do início. Em dias úteis, conta para
 * trás só os dias úteis (sem sábado, domingo e feriado nacional): com início
 * na segunda 04/01/2027 e 2 dias úteis, 31/12 é o 1º e 30/12 o 2º.
 */
export function dataPagamentoFerias(inicio: string, dias: number, uteis: boolean): string {
  if (!uteis || dias <= 0) return somar(inicio, -Math.max(0, dias))
  let data = inicio
  let contados = 0
  while (contados < dias) {
    data = somar(data, -1)
    if (ehDiaUtil(data)) contados++
  }
  return data
}

export function pagamentoDoAviso(inicio: string, regra: RegraPagamentoFerias): PagamentoDoAviso | null {
  if (regra.dias === null || !Number.isInteger(regra.dias) || regra.dias < 0) return null
  return {
    ate: dataPagamentoFerias(inicio, regra.dias, regra.uteis),
    dias: regra.dias,
    uteis: regra.uteis,
    descricao: regra.descricao?.trim() || null,
    fundamento: regra.fundamento?.trim() || null,
  }
}

/** "2 dias úteis", "1 dia corrido". */
export function prazoPagamento(dias: number, uteis: boolean): string {
  return `${dias} ${dias === 1 ? "dia" : "dias"} ${uteis ? (dias === 1 ? "útil" : "úteis") : dias === 1 ? "corrido" : "corridos"}`
}

/** Minúscula no início, sem estragar sigla ("Gratificação" → "gratificação"; "ACT" fica). */
function minusculaInicial(t: string): string {
  return /^\p{Lu}\p{Ll}/u.test(t) ? t[0].toLocaleLowerCase("pt-BR") + t.slice(1) : t
}

/** A frase do aviso sobre o pagamento. */
export function frasePagamento(p: PagamentoDoAviso, abono: boolean): string {
  const oQue = p.descricao
    ? ` (${minusculaInicial(p.descricao)}${abono ? " e abono pecuniário" : ""})`
    : abono
      ? " e do abono pecuniário"
      : ""
  const quando = p.dias === 0 ? "até o início do gozo" : `${prazoPagamento(p.dias, p.uteis)} antes do início do gozo`
  return `O pagamento das férias${oQue} será feito até ${formatarData(p.ate)}, ${quando}${p.fundamento ? `, conforme ${minusculaInicial(p.fundamento)}` : ""}.`
}
