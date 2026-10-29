/**
 * Período cobrado de uma ordem de locação de veículos, lido do fim da
 * descrição — "(dd/mm/aaaa a dd/mm/aaaa)" desde 27/10/2026, ou a competência
 * "(MM/AAAA)" das ordens antigas (vale o mês inteiro). Usado pela regra
 * "Contrato fora da vigência" (ordens-verificacao.ts) e pelo resumo do
 * contrato. Seguro para o client.
 */

function somarDias(iso: string, dias: number): string {
  const d = new Date(`${iso}T12:00:00Z`)
  d.setUTCDate(d.getUTCDate() + dias)
  return d.toISOString().slice(0, 10)
}

function diasInclusivos(de: string, ate: string): number {
  const ms = Date.parse(`${ate}T12:00:00Z`) - Date.parse(`${de}T12:00:00Z`)
  return Math.round(ms / 86_400_000) + 1
}

const br = (iso: string) => iso.split("-").reverse().join("/")

export type PeriodoLocacao = {
  /** AAAA-MM-DD, inclusivo. */
  de: string
  ate: string
  /** "Período 10/11/2026 a 15/11/2026" ou "Competência 10/2026". */
  rotulo: string
}

export function periodoDaDescricao(
  descricao: string | null | undefined,
): PeriodoLocacao | null {
  const desc = descricao ?? ""
  const per =
    /\((\d{2})\/(\d{2})\/(\d{4}) a (\d{2})\/(\d{2})\/(\d{4})\)\s*$/.exec(desc)
  if (per) {
    const de = `${per[3]}-${per[2]}-${per[1]}`
    const ate = `${per[6]}-${per[5]}-${per[4]}`
    return { de, ate, rotulo: `Período ${br(de)} a ${br(ate)}` }
  }
  const comp = /\((\d{2})\/(\d{4})\)\s*$/.exec(desc)
  if (comp) {
    const de = `${comp[2]}-${comp[1]}-01`
    const ate = somarDias(somarDias(de, 32).slice(0, 7) + "-01", -1)
    return { de, ate, rotulo: `Competência ${comp[1]}/${comp[2]}` }
  }
  return null
}

/** Categoria do pagamento do contrato (coluna ordens_pagamento.categoria_locacao). */
export type CategoriaLocacao = "locacao" | "tag" | "infracao" | "seguro" | "outras"

export const CATEGORIAS_LOCACAO: { valor: CategoriaLocacao; rotulo: string }[] = [
  { valor: "locacao", rotulo: "Locação" },
  { valor: "tag", rotulo: "TAG" },
  { valor: "infracao", rotulo: "Infração" },
  { valor: "seguro", rotulo: "Seguro" },
  { valor: "outras", rotulo: "Outras taxas" },
]

export function rotuloCategoria(c: string | null | undefined): string {
  return CATEGORIAS_LOCACAO.find((x) => x.valor === c)?.rotulo ?? "Locação"
}

/** Situações que não contam como cobrança (a ordem não vale mais). */
const FORA_DO_RESUMO = ["Cancelada", "Estornado"]

export type ResumoLocacao = {
  cobrado: number
  pago: number
  emAberto: number
  qtdCobrancas: number
  qtdPagas: number
  /** Valor mensal × dias de vigência ÷ 30; nulo sem término ou sem valor. */
  previsto: number | null
  diasVigencia: number | null
  /** Trechos da vigência (até hoje) sem cobrança, do mais antigo ao mais novo. */
  semCobranca: {
    de: string
    ate: string
    dias: number
    /** Terminou há mais de 30 dias: a fatura provavelmente já devia ter chegado. */
    atrasado: boolean
  }[]
  /** Ordens sem período legível na descrição (legado): não entram nos trechos. */
  semPeriodo: number
  /** Cobrado por categoria (só as que têm valor), na ordem de CATEGORIAS_LOCACAO. */
  porCategoria: { categoria: CategoriaLocacao; rotulo: string; cobrado: number; qtd: number }[]
}

/**
 * Totais do contrato e os dias da vigência que nenhuma cobrança cobre. Os
 * trechos vão só até hoje (ou o término, se antes): a fatura do período em
 * curso ainda não chegou, e o que vem depois não está atrasado.
 */
export function resumoLocacao(
  contrato: {
    vigencia_inicio: string | null
    vigencia_termino: string | null
    valor_mensal: number | null
  },
  ordens: {
    descricao: string | null
    situacao: string | null
    valor: number | null
    data_pagamento: string | null
    /** Nulo = locação (ordens anteriores à categoria). */
    categoria?: string | null
  }[],
  hoje: string,
): ResumoLocacao {
  const validas = ordens.filter(
    (o) => !FORA_DO_RESUMO.includes(String(o.situacao ?? "")),
  )
  const pagas = validas.filter(
    (o) => o.situacao === "Paga" || Boolean(o.data_pagamento),
  )
  const soma = (l: typeof validas) => l.reduce((a, o) => a + (o.valor ?? 0), 0)
  const cobrado = soma(validas)
  const pago = soma(pagas)

  const inicio = contrato.vigencia_inicio?.slice(0, 10) ?? null
  const termino = contrato.vigencia_termino?.slice(0, 10) ?? null
  const diasVigencia =
    inicio && termino && termino >= inicio
      ? diasInclusivos(inicio, termino)
      : null
  const previsto =
    diasVigencia !== null && contrato.valor_mensal !== null
      ? Math.round(((contrato.valor_mensal * diasVigencia) / 30) * 100) / 100
      : null

  // Só o ALUGUEL cobre dias da vigência: TAG, multa, seguro e taxas do mesmo
  // período não dizem nada sobre a mensalidade ter sido cobrada.
  const ehLocacao = (o: { categoria?: string | null }) => !o.categoria || o.categoria === "locacao"
  const porCategoria = CATEGORIAS_LOCACAO.map((c) => {
    const l = validas.filter((o) => (o.categoria || "locacao") === c.valor)
    return { categoria: c.valor, rotulo: c.rotulo, cobrado: soma(l), qtd: l.length }
  }).filter((c) => c.qtd > 0)

  let semPeriodo = 0
  const periodos: { de: string; ate: string }[] = []
  for (const o of validas.filter(ehLocacao)) {
    const p = periodoDaDescricao(o.descricao)
    if (p) periodos.push(p)
    else semPeriodo++
  }

  const semCobranca: ResumoLocacao["semCobranca"] = []
  const limite = termino && termino < hoje ? termino : hoje
  if (inicio && limite >= inicio) {
    periodos.sort((a, b) => a.de.localeCompare(b.de))
    // `cursor` = primeiro dia ainda não coberto.
    let cursor = inicio
    for (const p of periodos) {
      if (cursor > limite) break
      if (p.ate < cursor) continue
      if (p.de > cursor) {
        const vespera = somarDias(p.de, -1)
        const ate = vespera < limite ? vespera : limite
        semCobranca.push({
          de: cursor,
          ate,
          dias: diasInclusivos(cursor, ate),
          atrasado: false,
        })
        if (p.de > limite) {
          cursor = somarDias(limite, 1)
          break
        }
      }
      cursor = somarDias(p.ate, 1)
    }
    if (cursor <= limite)
      semCobranca.push({
        de: cursor,
        ate: limite,
        dias: diasInclusivos(cursor, limite),
        atrasado: false,
      })
  }

  const limiteAtraso = somarDias(hoje, -30)
  for (const t of semCobranca) t.atrasado = t.ate < limiteAtraso

  return {
    cobrado,
    pago,
    emAberto: Math.round((cobrado - pago) * 100) / 100,
    qtdCobrancas: validas.length,
    qtdPagas: pagas.length,
    previsto,
    diasVigencia,
    semCobranca,
    semPeriodo,
    porCategoria,
  }
}
