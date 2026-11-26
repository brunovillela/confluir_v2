import type { ModalPassagem, TipoItemViagem } from "@/lib/viagens-constantes"

/**
 * Contas do relatório de viagens de uma pessoa (ficha do diretor, página do
 * funcionário, Minhas viagens). Puro, testado em tests/unidade/viagens-relatorio.spec.ts.
 */

type ItemContavel = {
  tipo: TipoItemViagem
  modal: ModalPassagem | null
  checkin: string | null
  checkout: string | null
  valor: number | null
}

type ViagemContavel = {
  inicio: string | null
  createdAt: string
  itens: ItemContavel[]
}

export type ResumoAnoViagens = {
  ano: number
  viagens: number
  passagens: number
  aereas: number
  rodoviarias: number
  noites: number
  valor: number
}

/** Noites entre check-in e check-out (datas AAAA-MM-DD); 0 se faltar uma ou estiver invertido. */
export function noitesDaHospedagem(checkin: string | null, checkout: string | null): number {
  if (!checkin || !checkout) return 0
  const ini = Date.parse(`${checkin.slice(0, 10)}T00:00:00Z`)
  const fim = Date.parse(`${checkout.slice(0, 10)}T00:00:00Z`)
  if (Number.isNaN(ini) || Number.isNaN(fim) || fim <= ini) return 0
  return Math.round((fim - ini) / 86_400_000)
}

/** O que a entidade pagou pela viagem: a soma dos itens com valor (no quarto coletivo, a parte da pessoa). */
export function valorDaViagem(v: { itens: { valor: number | null }[] }): number {
  return Math.round(v.itens.reduce((t, i) => t + (i.valor ?? 0), 0) * 100) / 100
}

/** Ano da viagem: o da primeira data (ida ou check-in); sem datas, o do pedido. */
export function anoDaViagem(v: { inicio: string | null; createdAt: string }): number {
  return Number((v.inicio ?? v.createdAt).slice(0, 4))
}

/** Um resumo por ano, do mais recente ao mais antigo. */
export function resumirViagensPorAno(viagens: ViagemContavel[]): ResumoAnoViagens[] {
  const porAno = new Map<number, ResumoAnoViagens>()
  for (const v of viagens) {
    const ano = anoDaViagem(v)
    const r =
      porAno.get(ano) ??
      { ano, viagens: 0, passagens: 0, aereas: 0, rodoviarias: 0, noites: 0, valor: 0 }
    r.viagens++
    for (const i of v.itens) {
      if (i.tipo === "passagem") {
        r.passagens++
        if (i.modal === "rodoviaria") r.rodoviarias++
        else r.aereas++
      } else {
        r.noites += noitesDaHospedagem(i.checkin, i.checkout)
      }
    }
    r.valor = Math.round((r.valor + valorDaViagem(v)) * 100) / 100
    porAno.set(ano, r)
  }
  return [...porAno.values()].sort((a, b) => b.ano - a.ano)
}
