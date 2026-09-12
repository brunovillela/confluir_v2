/**
 * Condições de uso da hospedagem — tipos e regras PURAS.
 *
 * Fora do `server-only`: o formulário da tela de Configurações de filiação
 * usa os tipos, e a avaliação recebe os dados já lidos para poder ser
 * exercitada isoladamente (mesmo desenho de `conferirCarencia`).
 *
 * Leitura, gravação e conferência no banco: src/lib/db/hospedagem-condicoes.ts
 * SQL: supabase/hospedagem-condicoes.sql
 */

export type PeriodoQuantidade = "mes" | "ano"

export const PERIODOS_QUANTIDADE: { chave: PeriodoQuantidade; rotulo: string }[] = [
  { chave: "mes", rotulo: "por mês" },
  { chave: "ano", rotulo: "por ano" },
]

export type CondicoesHospedagem = {
  /** Só quem tem vínculo EM ABERTO com uma das fontes marcadas. */
  restringirFontes: boolean
  fontesIds: string[]
  /** No máximo N cupons não cancelados por período (pela data de check-in). */
  limitarQuantidade: boolean
  quantidadeMaxima: number
  quantidadePeriodo: PeriodoQuantidade
  /** Regime de trabalho do vínculo em aberto entre os marcados. */
  restringirRegimes: boolean
  regimes: string[]
  /** Só as pessoas da lista de beneficiários. */
  somenteBeneficiarios: boolean
  /** Texto livre mostrado ao associado nas regras de utilização. */
  observacao: string | null
}

/** Sem configuração, nenhuma condição: o sistema não inventa restrição. */
export const CONDICOES_HOSPEDAGEM_PADRAO: CondicoesHospedagem = {
  restringirFontes: false,
  fontesIds: [],
  limitarQuantidade: false,
  quantidadeMaxima: 1,
  quantidadePeriodo: "mes",
  restringirRegimes: false,
  regimes: [],
  somenteBeneficiarios: false,
  observacao: null,
}

export function contarCondicoesAtivas(c: CondicoesHospedagem): number {
  return [
    c.restringirFontes && c.fontesIds.length > 0,
    c.limitarQuantidade,
    c.restringirRegimes && c.regimes.length > 0,
    c.somenteBeneficiarios,
  ].filter(Boolean).length
}

/** "A", "A ou B", "A, B ou C". */
function listaOu(itens: string[]): string {
  if (itens.length <= 1) return itens[0] ?? ""
  return `${itens.slice(0, -1).join(", ")} ou ${itens[itens.length - 1]}`
}

function rotuloQuantidade(n: number, periodo: PeriodoQuantidade): string {
  return `${n} ${n === 1 ? "cupom" : "cupons"} ${periodo === "mes" ? "por mês" : "por ano"}`
}

/** Período que contém o check-in, como intervalo [inicio, fim) em AAAA-MM-DD. */
export function janelaDoPeriodo(
  checkIn: string,
  periodo: PeriodoQuantidade
): { inicio: string; fim: string } {
  const [ano, mes] = checkIn.split("-").map(Number)
  const dois = (n: number) => String(n).padStart(2, "0")
  if (periodo === "ano") {
    return { inicio: `${ano}-01-01`, fim: `${ano + 1}-01-01` }
  }
  const proximoAno = mes === 12 ? ano + 1 : ano
  const proximoMes = mes === 12 ? 1 : mes + 1
  return {
    inicio: `${ano}-${dois(mes)}-01`,
    fim: `${proximoAno}-${dois(proximoMes)}-01`,
  }
}

/** As condições ligadas, em frases para o associado. */
export function descreverCondicoesHospedagem(
  c: CondicoesHospedagem,
  nomeFonte: (id: string) => string
): string[] {
  const frases: string[] = []
  const comFontes = c.restringirFontes && c.fontesIds.length > 0
  if (c.somenteBeneficiarios) {
    frases.push(
      "Uso restrito às pessoas da lista de beneficiários definida pelo sindicato."
    )
  }
  if (comFontes) {
    frases.push(`Ter vínculo em aberto com ${listaOu(c.fontesIds.map(nomeFonte))}.`)
  }
  if (c.restringirRegimes && c.regimes.length > 0) {
    frases.push(
      `Trabalhar no regime ${listaOu(c.regimes)}${comFontes ? ", nesse mesmo vínculo" : ""}, conforme o histórico de filiação.`
    )
  }
  if (c.limitarQuantidade) {
    frases.push(
      `No máximo ${rotuloQuantidade(c.quantidadeMaxima, c.quantidadePeriodo)}, considerando a data de check-in. Cupons cancelados não contam.`
    )
  }
  return frases
}

export type DadosDaPessoaHospedagem = {
  /** Vínculos de filiação EM ABERTO da pessoa (todos os registros do CPF). */
  vinculosAbertos: { fonteId: string | null; regime: string | null }[]
  /** Cupons não cancelados com check-in no período do cupom pedido. */
  cuponsNoPeriodo: number
  naListaDeBeneficiarios: boolean
}

/** A pessoa atende às condições? O motivo vem em linguagem de quem vai ler. */
export function avaliarCondicoesHospedagem(
  c: CondicoesHospedagem,
  dados: DadosDaPessoaHospedagem,
  nomeFonte: (id: string) => string
): { ok: true } | { ok: false; motivo: string } {
  if (c.somenteBeneficiarios && !dados.naListaDeBeneficiarios) {
    return {
      ok: false,
      motivo:
        "A hospedagem está restrita à lista de beneficiários definida pelo sindicato.",
    }
  }

  const comFontes = c.restringirFontes && c.fontesIds.length > 0
  let candidatos = dados.vinculosAbertos
  if (comFontes) {
    candidatos = candidatos.filter(
      (v) => v.fonteId !== null && c.fontesIds.includes(v.fonteId)
    )
    if (candidatos.length === 0) {
      return {
        ok: false,
        motivo: `A hospedagem é para quem tem vínculo em aberto com ${listaOu(c.fontesIds.map(nomeFonte))}.`,
      }
    }
  }

  if (c.restringirRegimes && c.regimes.length > 0) {
    const atende = candidatos.some(
      (v) => v.regime !== null && c.regimes.includes(v.regime)
    )
    if (!atende) {
      return {
        ok: false,
        motivo: `A hospedagem é para quem trabalha no regime ${listaOu(c.regimes)}${comFontes ? ` no vínculo com ${listaOu(c.fontesIds.map(nomeFonte))}` : ""}, conforme o histórico de filiação.`,
      }
    }
  }

  if (c.limitarQuantidade && dados.cuponsNoPeriodo >= c.quantidadeMaxima) {
    return {
      ok: false,
      motivo: `O limite de ${rotuloQuantidade(c.quantidadeMaxima, c.quantidadePeriodo)} já foi atingido para a data de check-in escolhida.`,
    }
  }

  return { ok: true }
}
