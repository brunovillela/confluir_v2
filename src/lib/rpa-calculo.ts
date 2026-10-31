/**
 * RPA (Recibo de Pagamento a Autônomo) — cálculo das retenções, compartilhado
 * entre client (prévia ao digitar) e server (emissão). Puro, sem IO.
 *
 * Retenções clássicas do RPA:
 * - INSS (contribuinte individual): alíquota sobre o bruto, LIMITADA ao teto
 *   do salário-de-contribuição.
 * - IRRF: tabela progressiva mensal sobre (bruto − INSS − dependentes×dedução).
 * - ISS: alíquota municipal sobre o bruto (quando retido na fonte).
 *
 * IRRF e teto do INSS são apurados pelo MÊS DO PAGAMENTO (onda 5 do plano do
 * RPA): com outros RPAs do prestador pagos ou previstos no mesmo mês, o recibo
 * novo calcula o imposto sobre o total do mês e retém a diferença do que os
 * anteriores já retiveram. A dedução por dependente entra uma vez no mês.
 *
 * A conta inversa (líquido → bruto) é resolvida por busca binária em centavos —
 * a função líquido(bruto) é monotônica crescente.
 *
 * Os VALORES-PADRÃO abaixo são as tabelas vigentes em 2025 (teto INSS
 * R$ 8.157,41; tabela IRRF de mai/2025). Eles mudam todo ano — a área tem uma
 * configuração por tenant para atualizá-los.
 */

import type { FormaPagamentoCompras } from "@/lib/compras-constantes"

/** Tipo da ordem de pagamento que o RPA gera (valor líquido; com ou sem contrato). */
export const TIPO_ORDEM_RPA = "RPA"

/**
 * Formas de pagamento da ordem do RPA — as da aquisição direta, sem cartão
 * (autônomo não recebe no cartão da entidade). Cada uma exige o seu detalhe
 * (chave/conta do prestador, código Pix, boleto ou conta de caixa).
 */
export const FORMAS_PAGAMENTO_RPA = [
  "Pix",
  "Pix (QR Code)",
  "Boleto",
  "Depósito bancário (TED)",
  "Dinheiro",
] as const satisfies readonly FormaPagamentoCompras[]

export type FormaPagamentoRpa = (typeof FORMAS_PAGAMENTO_RPA)[number]

export type FaixaIrrf = {
  /** Limite superior da faixa (null = última faixa, sem teto). */
  ate: number | null
  /** Alíquota em % (ex.: 7.5). */
  aliquota: number
  /** Parcela a deduzir em R$. */
  deduzir: number
}

export type ConfigRpa = {
  inss_aliquota: number
  inss_teto: number
  irrf_faixas: FaixaIrrf[]
  irrf_deducao_dependente: number
  iss_aliquota_padrao: number
}

export const CONFIG_RPA_PADRAO: ConfigRpa = {
  inss_aliquota: 11,
  inss_teto: 8157.41,
  irrf_faixas: [
    { ate: 2428.8, aliquota: 0, deduzir: 0 },
    { ate: 2826.65, aliquota: 7.5, deduzir: 182.16 },
    { ate: 3751.05, aliquota: 15, deduzir: 394.16 },
    { ate: 4664.68, aliquota: 22.5, deduzir: 675.49 },
    { ate: null, aliquota: 27.5, deduzir: 908.73 },
  ],
  irrf_deducao_dependente: 189.59,
  iss_aliquota_padrao: 5,
}

export type OpcoesRpa = {
  dependentes: number
  reterInss: boolean
  reterIrrf: boolean
  reterIss: boolean
  /** Alíquota ISS em % deste recibo (padrão da config quando não informada). */
  issAliquota: number
}

export type ResultadoRpa = {
  valorBruto: number
  inss: number
  irrf: number
  iss: number
  valorLiquido: number
  /** Memória do cálculo do mês — só quando há outros RPAs no mês do pagamento. */
  memoria?: MemoriaMes
}

/** Outro RPA do prestador pago (ou previsto) no mesmo mês do pagamento. */
export type RpaAnteriorDoMes = {
  numero: number | null
  bruto: number
  inss: number
  irrf: number
  /** Já pago (false = previsto para o mês). */
  pago: boolean
}

/** O que o recibo mostra quando o IRRF foi apurado com os outros RPAs do mês. */
export type MemoriaMes = {
  /** "AAAA-MM" do pagamento. */
  mes: string
  anteriores: RpaAnteriorDoMes[]
  /** Bruto do mês (anteriores + este). */
  brutoMes: number
  /** INSS do mês (anteriores + este). */
  inssMes: number
  /** Base do IRRF do mês: bruto − INSS − dependentes. */
  baseIrrfMes: number
  /** IRRF devido sobre a base do mês. */
  irrfMes: number
  /** IRRF já retido nos anteriores. */
  irrfAnteriores: number
}

/**
 * Alíquotas padrão do RPA emitido na própria compra (aquisição direta):
 * INSS, IRRF e ISS retidos, sem dependentes, ISS da configuração. Para
 * ajustar, emite-se pela área de RPA.
 */
export function opcoesPadraoRpa(cfg: ConfigRpa): OpcoesRpa {
  return { dependentes: 0, reterInss: true, reterIrrf: true, reterIss: true, issAliquota: cfg.iss_aliquota_padrao }
}

/** O recibo com as alíquotas padrão, a partir do valor bruto ou do líquido. */
export function calcularRpaPadrao(
  valor: number,
  base: "bruto" | "liquido",
  cfg: ConfigRpa,
  noMes?: { mes: string; anteriores: RpaAnteriorDoMes[] } | null
): ResultadoRpa {
  const op = opcoesPadraoRpa(cfg)
  return base === "liquido" ? calcularPorLiquido(valor, cfg, op, noMes) : calcularPorBruto(valor, cfg, op, noMes)
}

const arred = (v: number) => Math.round(v * 100) / 100

/** IRRF da tabela progressiva mensal sobre a base. */
function irrfDaTabela(base: number, cfg: ConfigRpa): number {
  const faixa =
    cfg.irrf_faixas.find((f) => f.ate === null || base <= f.ate) ??
    cfg.irrf_faixas[cfg.irrf_faixas.length - 1]
  if (!faixa || faixa.aliquota <= 0) return 0
  return arred(Math.max(0, base * (faixa.aliquota / 100) - faixa.deduzir))
}

/**
 * Retenções e líquido a partir do BRUTO. Com `noMes` (os outros RPAs do
 * prestador no mês do pagamento), o INSS respeita o teto do mês e o IRRF é o
 * da tabela sobre o total do mês, menos o que os anteriores já retiveram.
 */
export function calcularPorBruto(
  bruto: number,
  cfg: ConfigRpa,
  op: OpcoesRpa,
  noMes?: { mes: string; anteriores: RpaAnteriorDoMes[] } | null
): ResultadoRpa {
  const valorBruto = arred(bruto)
  const anteriores = noMes?.anteriores ?? []
  const soma = (k: "bruto" | "inss" | "irrf") => arred(anteriores.reduce((s, a) => s + (a[k] || 0), 0))
  const brutoAnt = soma("bruto")
  const inssAnt = soma("inss")
  const irrfAnt = soma("irrf")
  const aliqInss = cfg.inss_aliquota / 100
  // Teto do mês: o que os anteriores já retiveram consome o teto.
  const inss = op.reterInss
    ? arred(Math.max(0, Math.min(valorBruto * aliqInss, arred(cfg.inss_teto * aliqInss) - inssAnt)))
    : 0
  const brutoMes = arred(brutoAnt + valorBruto)
  const inssMes = arred(inssAnt + inss)
  const baseIrrfMes = arred(Math.max(0, brutoMes - inssMes - op.dependentes * cfg.irrf_deducao_dependente))
  const irrfMes = irrfDaTabela(baseIrrfMes, cfg)
  const irrf = op.reterIrrf ? arred(Math.max(0, irrfMes - irrfAnt)) : 0
  const iss = op.reterIss ? arred(valorBruto * (op.issAliquota / 100)) : 0
  return {
    valorBruto,
    inss,
    irrf,
    iss,
    valorLiquido: arred(valorBruto - inss - irrf - iss),
    ...(noMes && anteriores.length
      ? { memoria: { mes: noMes.mes, anteriores, brutoMes, inssMes, baseIrrfMes, irrfMes, irrfAnteriores: irrfAnt } }
      : {}),
  }
}

/**
 * Conta inversa: acha o BRUTO cujo líquido chega ao valor pedido (busca
 * binária em centavos; com as retenções, o bruto nunca passa de líquido/(1−
 * soma das alíquotas) + folga — usamos 4× como teto seguro).
 */
export function calcularPorLiquido(
  liquidoDesejado: number,
  cfg: ConfigRpa,
  op: OpcoesRpa,
  noMes?: { mes: string; anteriores: RpaAnteriorDoMes[] } | null
): ResultadoRpa {
  const alvo = Math.round(liquidoDesejado * 100)
  let lo = alvo // bruto ≥ líquido (retenções não são negativas)
  let hi = Math.max(alvo * 4, alvo + 100)
  while (lo < hi) {
    const meio = Math.floor((lo + hi) / 2)
    const r = calcularPorBruto(meio / 100, cfg, op, noMes)
    if (Math.round(r.valorLiquido * 100) >= alvo) hi = meio
    else lo = meio + 1
  }
  return calcularPorBruto(lo / 100, cfg, op, noMes)
}

/** Valida/normaliza uma config vinda do banco (JSON) — cai no padrão se ruim. */
export function normalizarConfigRpa(bruta: unknown): ConfigRpa {
  const o = (bruta ?? {}) as Record<string, unknown>
  const num = (v: unknown, padrao: number) =>
    typeof v === "number" && Number.isFinite(v) && v >= 0 ? v : padrao
  let faixas = CONFIG_RPA_PADRAO.irrf_faixas
  if (Array.isArray(o.irrf_faixas) && o.irrf_faixas.length > 0) {
    const parsed = o.irrf_faixas
      .map((f) => {
        const x = (f ?? {}) as Record<string, unknown>
        const ate =
          x.ate === null
            ? null
            : typeof x.ate === "number" && Number.isFinite(x.ate)
              ? x.ate
              : undefined
        if (ate === undefined) return null
        return {
          ate,
          aliquota: num(x.aliquota, 0),
          deduzir: num(x.deduzir, 0),
        }
      })
      .filter((f): f is FaixaIrrf => f !== null)
    if (parsed.length > 0) faixas = parsed
  }
  return {
    inss_aliquota: num(o.inss_aliquota, CONFIG_RPA_PADRAO.inss_aliquota),
    inss_teto: num(o.inss_teto, CONFIG_RPA_PADRAO.inss_teto),
    irrf_faixas: faixas,
    irrf_deducao_dependente: num(
      o.irrf_deducao_dependente,
      CONFIG_RPA_PADRAO.irrf_deducao_dependente
    ),
    iss_aliquota_padrao: num(
      o.iss_aliquota_padrao,
      CONFIG_RPA_PADRAO.iss_aliquota_padrao
    ),
  }
}
