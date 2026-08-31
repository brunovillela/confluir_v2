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
 * A conta inversa (líquido → bruto) é resolvida por busca binária em centavos —
 * a função líquido(bruto) é monotônica crescente.
 *
 * Os VALORES-PADRÃO abaixo são as tabelas vigentes em 2025 (teto INSS
 * R$ 8.157,41; tabela IRRF de mai/2025). Eles mudam todo ano — a área tem uma
 * configuração por tenant para atualizá-los.
 */

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
}

const arred = (v: number) => Math.round(v * 100) / 100

/** Retenções e líquido a partir do BRUTO. */
export function calcularPorBruto(
  bruto: number,
  cfg: ConfigRpa,
  op: OpcoesRpa
): ResultadoRpa {
  const valorBruto = arred(bruto)
  const inss = op.reterInss
    ? arred(Math.min(valorBruto, cfg.inss_teto) * (cfg.inss_aliquota / 100))
    : 0
  let irrf = 0
  if (op.reterIrrf) {
    const base = Math.max(
      0,
      valorBruto - inss - op.dependentes * cfg.irrf_deducao_dependente
    )
    const faixa =
      cfg.irrf_faixas.find((f) => f.ate === null || base <= f.ate) ??
      cfg.irrf_faixas[cfg.irrf_faixas.length - 1]
    if (faixa && faixa.aliquota > 0) {
      irrf = arred(Math.max(0, base * (faixa.aliquota / 100) - faixa.deduzir))
    }
  }
  const iss = op.reterIss ? arred(valorBruto * (op.issAliquota / 100)) : 0
  return {
    valorBruto,
    inss,
    irrf,
    iss,
    valorLiquido: arred(valorBruto - inss - irrf - iss),
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
  op: OpcoesRpa
): ResultadoRpa {
  const alvo = Math.round(liquidoDesejado * 100)
  let lo = alvo // bruto ≥ líquido (retenções não são negativas)
  let hi = Math.max(alvo * 4, alvo + 100)
  while (lo < hi) {
    const meio = Math.floor((lo + hi) / 2)
    const r = calcularPorBruto(meio / 100, cfg, op)
    if (Math.round(r.valorLiquido * 100) >= alvo) hi = meio
    else lo = meio + 1
  }
  return calcularPorBruto(lo / 100, cfg, op)
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
