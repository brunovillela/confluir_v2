/**
 * REGRAS PURAS DA COMPRA CANCELADA PELO VENDEDOR (15/11/2026). As contas de
 * dinheiro de lib/db/compras-cancelamento.ts — abatimento do crédito, ordem
 * reduzida no cancelamento parcial, saldo e sugestões da devolução, saldo numa
 * data para a contabilidade — sem banco, para os testes de unidade
 * (tests/unidade/compras-cancelamento.spec.ts).
 */

export const centavos = (v: number) => Math.round(v * 100) / 100

/** Diferença menor que meio centavo conta como zero. */
const ZERO = 0.005

/** Dias entre duas datas ISO (AAAA-MM-DD…), ao meio-dia UTC para fugir do horário de verão. */
export function diasEntre(de: string, ate: string): number {
  return Math.round((Date.parse(`${ate.slice(0, 10)}T12:00:00Z`) - Date.parse(`${de.slice(0, 10)}T12:00:00Z`)) / 86_400_000)
}

export function somarDiasIso(iso: string, dias: number): string {
  const d = new Date(`${iso.slice(0, 10)}T12:00:00Z`)
  d.setUTCDate(d.getUTCDate() + dias)
  return d.toISOString().slice(0, 10)
}

/** Data (São Paulo) de um timestamptz. */
export function dataSP(ts: string | null | undefined): string | null {
  if (!ts) return null
  return new Date(ts).toLocaleDateString("sv-SE", { timeZone: "America/Sao_Paulo" })
}

// ── Abatimento do crédito na compra nova ─────────────────────────────────────

export type CreditoComSaldo = { id: string; codigo: string | null; saldo: number }
export type UsoPlanejado = { creditoId: string; codigo: string | null; valor: number }

/**
 * Quanto de cada crédito abate o valor da compra, na ordem dada (o chamador
 * manda os mais antigos primeiro). Nunca abate mais que o valor nem que o
 * saldo de cada crédito; créditos sem saldo são pulados.
 */
export function planejarUsos(creditos: CreditoComSaldo[], valor: number): { abatido: number; usos: UsoPlanejado[] } {
  const usos: UsoPlanejado[] = []
  let falta = centavos(Math.max(0, valor))
  for (const c of creditos) {
    if (falta <= ZERO) break
    if (c.saldo <= ZERO) continue
    const v = centavos(Math.min(c.saldo, falta))
    usos.push({ creditoId: c.id, codigo: c.codigo, valor: v })
    falta = centavos(falta - v)
  }
  return { abatido: centavos(usos.reduce((s, u) => s + u.valor, 0)), usos }
}

// ── Cancelamento parcial ─────────────────────────────────────────────────────

export const SITUACOES_ENCERRADAS = ["Paga", "Cancelada", "Estornado"]

/**
 * A ordem que absorve um cancelamento parcial: ainda não paga (nem encerrada,
 * nem já na fatura do cartão) e que continua com pelo menos R$ 0,01 depois do
 * desconto. Entre as que servem, a de maior valor. Nenhuma: o valor vira
 * crédito ou devolução.
 */
export function ordemParaReduzir<T extends { situacao?: unknown; valor_inicial_cobranca?: unknown }>(ordens: T[], valor: number): T | undefined {
  return ordens
    .filter((o) => {
      const s = typeof o.situacao === "string" ? o.situacao : ""
      return !SITUACOES_ENCERRADAS.includes(s) && s !== "Na fatura"
    })
    // Em centavos: 50,01 − 50 dá 0,00999… em ponto flutuante.
    .filter((o) => centavos(Number(o.valor_inicial_cobranca ?? 0) - valor) >= 0.01)
    .sort((a, b) => Number(b.valor_inicial_cobranca ?? 0) - Number(a.valor_inicial_cobranca ?? 0))[0]
}

// ── Devolução a receber ──────────────────────────────────────────────────────

/** Devolução sem notícia há este tanto de dias: "cobrar o fornecedor". */
export const DIAS_COBRAR_DEVOLUCAO = 30

/** O que falta voltar e se o recebido já cobre o cancelado. Sem valor cancelado, qualquer recebimento encerra. */
export function saldoDaDevolucao(cancelado: number | null, recebido: number): { saldo: number; encerra: boolean } {
  if (cancelado === null) return { saldo: 0, encerra: true }
  const saldo = Math.max(0, centavos(cancelado - recebido))
  return { saldo, encerra: saldo <= ZERO }
}

/** Dias desde o cancelamento ou a última cobrança (o que for mais recente) e se já passou do prazo de cobrar. */
export function noticiaDaDevolucao(cancelamento: string | null, cobradaEm: string | null, hoje: string): { dias: number; parada: boolean } {
  const referencia = [cancelamento, cobradaEm].filter((v): v is string => !!v).sort().pop() ?? hoje
  const dias = Math.max(0, diasEntre(referencia, hoje))
  return { dias, parada: dias >= DIAS_COBRAR_DEVOLUCAO }
}

export type CreditoDoExtrato = { id: string; data: string; valor: number; descricao: string | null }

/**
 * Créditos do extrato que parecem ser a devolução: a partir de 3 dias antes do
 * cancelamento, com o valor que falta (exato) ou entre metade dele e ele (taxa
 * retida, devolução em partes). Os mais próximos do valor primeiro; até 3.
 */
export function sugerirCreditosDoExtrato(
  creditos: CreditoDoExtrato[],
  saldo: number | null,
  cancelamento: string | null,
  hoje: string
): (CreditoDoExtrato & { exato: boolean })[] {
  if (saldo === null || saldo <= 0) return []
  const desde = somarDiasIso(cancelamento ?? hoje, -3)
  return creditos
    .filter((c) => c.data.slice(0, 10) >= desde)
    .filter((c) => Math.abs(c.valor - saldo) < ZERO || (c.valor < saldo && c.valor >= saldo / 2))
    .sort((a, b) => Math.abs(a.valor - saldo) - Math.abs(b.valor - saldo))
    .slice(0, 3)
    .map((c) => ({ ...c, data: c.data.slice(0, 10), exato: Math.abs(c.valor - saldo) < ZERO }))
}

// ── Saldo com fornecedores numa data (contabilidade) ─────────────────────────

export type CanceladoParaSaldo = {
  desfecho: "credito" | "devolucao"
  valor: number
  /** credito_usado_em (timestamptz): marcado como usado, perdido ou zerado pelos usos. */
  creditoFechadoEm: string | null
  creditoObs: string | null
  validade: string | null
  /** devolucao_recebida_em (timestamptz): recebida inteira ou encerrada com perda. */
  devolucaoEncerradaEm: string | null
  devolucaoObs: string | null
}

/**
 * Saldo de um crédito ou devolução no fim do dia `ate`: usos feitos até a data
 * e não desfeitos até ela; recebimentos com data até ela; encerramentos depois
 * da data não contam. null quando nada estava em aberto — inclusive o que se
 * resolveu dentro da própria compra (parte abatida numa ordem ainda não paga,
 * nada a devolver).
 */
export function saldoNaData(
  f: CanceladoParaSaldo,
  usos: { valor: number; criadoEm: string; desfeitoEm: string | null }[],
  recebimentos: { valor: number; data: string }[],
  ate: string
): { movimentado: number; saldo: number; situacao: string } | null {
  const obs = String((f.desfecho === "credito" ? f.creditoObs : f.devolucaoObs) ?? "")
  if (obs.startsWith("Abatido na ordem") || obs.startsWith("Nada a devolver")) return null
  if (!(f.valor > 0)) return null
  let movimentado: number
  let situacao: string
  if (f.desfecho === "credito") {
    const fechado = dataSP(f.creditoFechadoEm)
    if (fechado && fechado <= ate) return null
    movimentado = centavos(
      usos
        .filter((u) => (dataSP(u.criadoEm) ?? "") <= ate && (!u.desfeitoEm || (dataSP(u.desfeitoEm) ?? "") > ate))
        .reduce((s, u) => s + u.valor, 0)
    )
    const vencido = f.validade && f.validade < ate
    situacao = vencido ? `Vencido em ${f.validade!.split("-").reverse().join("/")}, sem uso` : movimentado > 0 ? "Usado em parte" : "Em aberto"
  } else {
    const encerrada = dataSP(f.devolucaoEncerradaEm)
    if (encerrada && encerrada <= ate) return null
    movimentado = centavos(recebimentos.filter((r) => r.data.slice(0, 10) <= ate).reduce((s, r) => s + r.valor, 0))
    situacao = movimentado > 0 ? "Recebida em parte" : "A receber"
  }
  const saldo = centavos(f.valor - movimentado)
  return saldo > ZERO ? { movimentado, saldo, situacao } : null
}
