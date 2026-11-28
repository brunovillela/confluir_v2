/**
 * RELATÓRIO CONSOLIDADO DO PONTO E DAS HORAS EXTRAS (Ponto, Fase 3 — 28/11/2026).
 *
 * Módulo puro (servidor, tela, PDF e planilha). Sobre os registros de ponto
 * de um período (e de um departamento ou pessoa, se filtrado): horas
 * realizadas e pagas por faixa, o valor pago (R$, lido do contracheque na
 * Fase 2), o banco no fim do período, os acertos do banco (Fase 1) e as
 * DIVERGÊNCIAS que merecem conferência — conta do saldo que não fecha,
 * cadeia entre remessas quebrada, hora paga sem saldo, valor da hora fora
 * do padrão da pessoa.
 */

import { destinoDoZerado, zeradoEntre, zeraFaixa1, zeraFaixa2, type AcertoDaPessoa, type FaixasAcerto, type MotivoAcerto } from "@/lib/ponto-acertos"

/** O que o relatório usa de cada registro (compatível com RegistroAnalise). */
export type RegistroRelatorio = {
  remessaId: string
  competencia: string
  funcionarioId: string
  nome: string
  departamento: { chave: string; nome: string }
  he70: number
  he100: number
  pagas70: number
  pagas100: number
  anterior70: number | null
  anterior100: number | null
  remanescente70: number | null
  remanescente100: number | null
  valor70: number | null
  valor100: number | null
  pagasDoContracheque: boolean
}

export type ItemAcertoRelatorio = {
  acertoId: string
  funcionarioId: string
  competencia: string
  faixas: FaixasAcerto
  motivo: MotivoAcerto
  /** Saldo zerado (negativo = horas a descontar); null = faixa não zerada. */
  saldo70: number | null
  saldo100: number | null
}

export type FiltroRelatorio = {
  /** AAAA-MM, inclusive. */
  de: string
  ate: string
  departamento?: string | null
  funcionario?: string | null
}

export type Faixas<T> = { f1: T; f2: T }

export type TotaisRelatorio = {
  registros: number
  pessoas: number
  realizadas: Faixas<number>
  pagas: Faixas<number>
  /** Soma do valor pago informado (R$). */
  valor: Faixas<number>
  /** Horas pagas que têm valor informado (base do custo médio da hora). */
  horasComValor: Faixas<number>
  /** Banco no fim do período (soma do saldo de cada pessoa). */
  saldoFinal: Faixas<number>
  acertos: { positivo: number; negativo: number; pagoEmFolha: number; descontado: number; pessoas: number }
}

export type MesRelatorio = {
  competencia: string
  registros: number
  realizadas: Faixas<number>
  pagas: Faixas<number>
  valor: Faixas<number>
  /** Soma dos saldos remanescentes dos registros do mês. */
  saldo: Faixas<number>
  /** Horas zeradas em acertos do mês: a favor (positivo) e negativas. */
  zerado: { positivo: number; negativo: number }
}

export type PessoaRelatorio = {
  funcionarioId: string
  nome: string
  departamento: string
  meses: number
  realizadas: Faixas<number>
  pagas: Faixas<number>
  valor: Faixas<number>
  /** R$ por hora paga (só onde há valor); null sem base. */
  valorHora: Faixas<number | null>
  saldoFinal: Faixas<number>
  ultimaCompetencia: string
  acertos: ItemAcertoRelatorio[]
  divergencias: number
}

export type TipoDivergencia = "conta" | "cadeia" | "pagou_sem_saldo" | "valor_hora" | "valor_sem_horas" | "sem_valor"

export type DivergenciaRelatorio = {
  tipo: TipoDivergencia
  funcionarioId: string
  nome: string
  competencia: string
  remessaId: string
  texto: string
}

export const ROTULO_DIVERGENCIA: Record<TipoDivergencia, { rotulo: string; explicacao: string; grave: boolean }> = {
  conta: { rotulo: "Saldo não fecha", explicacao: "O saldo remanescente não é saldo anterior + realizadas − pagas.", grave: true },
  cadeia: { rotulo: "Cadeia quebrada", explicacao: "O saldo anterior não é o saldo da remessa anterior da pessoa (nem zero, depois de um acerto).", grave: true },
  pagou_sem_saldo: { rotulo: "Pagou sem saldo", explicacao: "Mais horas pagas do que havia no banco (anterior + realizadas): o saldo ficou negativo.", grave: true },
  valor_hora: { rotulo: "Valor da hora fora do padrão", explicacao: "O valor pago por hora difere mais de 30% da mediana da própria pessoa no período.", grave: false },
  valor_sem_horas: { rotulo: "Valor sem horas", explicacao: "Há valor pago na faixa, mas nenhuma hora paga.", grave: false },
  sem_valor: { rotulo: "Horas pagas sem valor", explicacao: "Horas pagas digitadas, sem o valor do contracheque, numa remessa em que as outras pessoas vieram do contracheque.", grave: false },
}

const r2 = (v: number) => Math.round(v * 100) / 100
const zero = (): Faixas<number> => ({ f1: 0, f2: 0 })
const dif = (a: number, b: number) => Math.abs(a - b) > 0.01
const mediana = (xs: number[]) => {
  const o = [...xs].sort((a, b) => a - b)
  const m = Math.floor(o.length / 2)
  return o.length % 2 ? o[m] : (o[m - 1] + o[m]) / 2
}
const MESES = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"]
export const rotuloMesCurto = (c: string) => `${MESES[Number(c.slice(5, 7)) - 1]}/${c.slice(0, 4)}`
export const hh = (v: number) => {
  const neg = v < 0
  const m = Math.round(Math.abs(v) * 60)
  return `${neg ? "-" : ""}${Math.floor(m / 60)}:${String(m % 60).padStart(2, "0")}`
}

export type RelatorioGeral = {
  filtro: FiltroRelatorio
  totais: TotaisRelatorio
  meses: MesRelatorio[]
  pessoas: PessoaRelatorio[]
  divergencias: DivergenciaRelatorio[]
  /** Os registros do período (pessoa × mês), em ordem de mês e nome — a planilha. */
  linhas: RegistroRelatorio[]
  /** Alguém no período tem valor pago informado (a entidade usa a leitura do contracheque). */
  usaValor: boolean
}

/**
 * Monta o relatório. `registros` e `acertos` vêm de TODO o histórico: a
 * conferência da cadeia precisa do registro anterior ao período.
 */
export function montarRelatorioGeral(registros: RegistroRelatorio[], acertos: ItemAcertoRelatorio[], filtro: FiltroRelatorio): RelatorioGeral {
  const daPessoa = (r: RegistroRelatorio) =>
    (!filtro.departamento || r.departamento.chave === filtro.departamento) && (!filtro.funcionario || r.funcionarioId === filtro.funcionario)
  const noPeriodo = (c: string) => c >= filtro.de && c <= filtro.ate
  const todos = registros.filter(daPessoa).sort((a, b) => a.competencia.localeCompare(b.competencia))
  const periodo = todos.filter((r) => noPeriodo(r.competencia))
  const pessoasIds = new Set(periodo.map((r) => r.funcionarioId))
  const acertosPorPessoa = new Map<string, ItemAcertoRelatorio[]>()
  for (const a of acertos) {
    if (!pessoasIds.has(a.funcionarioId) && !(filtro.funcionario && a.funcionarioId === filtro.funcionario)) continue
    ;(acertosPorPessoa.get(a.funcionarioId) ?? acertosPorPessoa.set(a.funcionarioId, []).get(a.funcionarioId)!).push(a)
  }
  const comoAcerto = (a: ItemAcertoRelatorio): AcertoDaPessoa => ({ acertoId: a.acertoId, competencia: a.competencia, faixas: a.faixas, motivo: a.motivo })
  const usaValor = periodo.some((r) => r.valor70 !== null || r.valor100 !== null)
  // Remessas lidas do contracheque: nelas, quem ficou com horas digitadas sem valor merece conferência.
  const remessasComValor = new Set(periodo.filter((r) => r.pagasDoContracheque || r.valor70 !== null || r.valor100 !== null).map((r) => r.remessaId))

  // ── Divergências ──
  const divergencias: DivergenciaRelatorio[] = []
  const div = (tipo: TipoDivergencia, r: RegistroRelatorio, texto: string) =>
    divergencias.push({ tipo, funcionarioId: r.funcionarioId, nome: r.nome, competencia: r.competencia, remessaId: r.remessaId, texto })
  const porPessoa = new Map<string, RegistroRelatorio[]>()
  for (const r of todos) (porPessoa.get(r.funcionarioId) ?? porPessoa.set(r.funcionarioId, []).get(r.funcionarioId)!).push(r)
  const faixasDe = [
    { k: "f1" as const, rot: "faixa 1", he: "he70", pag: "pagas70", ant: "anterior70", rem: "remanescente70", val: "valor70", zera: zeraFaixa1 },
    { k: "f2" as const, rot: "faixa 2", he: "he100", pag: "pagas100", ant: "anterior100", rem: "remanescente100", val: "valor100", zera: zeraFaixa2 },
  ] as const
  for (const [, regs] of porPessoa) {
    const acs = (acertosPorPessoa.get(regs[0].funcionarioId) ?? []).map(comoAcerto)
    regs.forEach((r, i) => {
      if (!noPeriodo(r.competencia)) return
      const prev = i > 0 ? regs[i - 1] : null
      for (const f of faixasDe) {
        const ant = r[f.ant] ?? 0
        const real = r[f.he]
        const pag = r[f.pag]
        const rem = r[f.rem]
        if (rem !== null && dif(rem, ant + real - pag)) {
          div("conta", r, `${f.rot}: saldo ${hh(rem)}, mas anterior ${hh(ant)} + realizadas ${hh(real)} − pagas ${hh(pag)} = ${hh(r2(ant + real - pag))}.`)
        }
        if (prev) {
          const zerado = zeradoEntre(acs, prev.competencia, r.competencia)
          const esperado = (f.k === "f1" ? zerado.faixa1 : zerado.faixa2) ? 0 : (prev[f.rem] ?? 0)
          if (dif(ant, esperado)) {
            div(
              "cadeia",
              r,
              `${f.rot}: saldo anterior ${hh(ant)}, mas ${
                esperado === 0 && (f.k === "f1" ? zerado.faixa1 : zerado.faixa2) ? "o acerto do banco zerou o saldo" : `a remessa de ${rotuloMesCurto(prev.competencia)} fechou com ${hh(esperado)}`
              }.`
            )
          }
        }
        if (pag > 0 && pag - (ant + real) > 0.01) {
          div("pagou_sem_saldo", r, `${f.rot}: ${hh(pag)} pagas com ${hh(r2(ant + real))} no banco.`)
        }
        const val = r[f.val]
        if (val !== null && val > 0 && pag === 0) div("valor_sem_horas", r, `${f.rot}: R$ ${val.toFixed(2).replace(".", ",")} pagos sem horas.`)
        if (remessasComValor.has(r.remessaId) && pag > 0 && val === null) div("sem_valor", r, `${f.rot}: ${hh(pag)} pagas sem o valor do contracheque.`)
      }
    })
    // Valor da hora fora do padrão da pessoa (precisa de 3 meses com valor).
    for (const f of faixasDe) {
      const pontos = regs.filter((r) => noPeriodo(r.competencia) && r[f.pag] > 0 && (r[f.val] ?? 0) > 0)
      if (pontos.length < 3) continue
      const med = mediana(pontos.map((r) => r[f.val]! / r[f.pag]))
      for (const r of pontos) {
        const vh = r[f.val]! / r[f.pag]
        if (Math.abs(vh - med) / med > 0.3) {
          div("valor_hora", r, `${f.rot}: R$ ${vh.toFixed(2).replace(".", ",")} por hora; a mediana da pessoa é R$ ${med.toFixed(2).replace(".", ",")}.`)
        }
      }
    }
  }
  divergencias.sort((a, b) => a.competencia.localeCompare(b.competencia) || a.nome.localeCompare(b.nome, "pt-BR"))

  // ── Por pessoa ──
  const pessoas: PessoaRelatorio[] = []
  for (const id of pessoasIds) {
    const regs = periodo.filter((r) => r.funcionarioId === id)
    const ult = regs[regs.length - 1]
    const acsPeriodo = (acertosPorPessoa.get(id) ?? []).filter((a) => noPeriodo(a.competencia))
    const p: PessoaRelatorio = {
      funcionarioId: id,
      nome: ult.nome,
      departamento: ult.departamento.nome,
      meses: regs.length,
      realizadas: zero(),
      pagas: zero(),
      valor: zero(),
      valorHora: { f1: null, f2: null },
      saldoFinal: { f1: ult.remanescente70 ?? 0, f2: ult.remanescente100 ?? 0 },
      ultimaCompetencia: ult.competencia,
      acertos: acsPeriodo.sort((a, b) => a.competencia.localeCompare(b.competencia)),
      divergencias: divergencias.filter((d) => d.funcionarioId === id).length,
    }
    // Acerto no mês do último registro ou depois (até o fim do período) zera o saldo final.
    const zeradoFim = zeradoEntre(acsPeriodo.map(comoAcerto), ult.competencia, `${filtro.ate}~`)
    if (zeradoFim.faixa1) p.saldoFinal.f1 = 0
    if (zeradoFim.faixa2) p.saldoFinal.f2 = 0
    const comValor = zero()
    for (const r of regs) {
      p.realizadas.f1 += r.he70
      p.realizadas.f2 += r.he100
      p.pagas.f1 += r.pagas70
      p.pagas.f2 += r.pagas100
      p.valor.f1 += r.valor70 ?? 0
      p.valor.f2 += r.valor100 ?? 0
      if (r.valor70 !== null && r.pagas70 > 0) comValor.f1 += r.pagas70
      if (r.valor100 !== null && r.pagas100 > 0) comValor.f2 += r.pagas100
    }
    for (const k of ["f1", "f2"] as const) {
      p.realizadas[k] = r2(p.realizadas[k])
      p.pagas[k] = r2(p.pagas[k])
      p.valor[k] = r2(p.valor[k])
      p.valorHora[k] = comValor[k] > 0 ? r2(p.valor[k] / comValor[k]) : null
    }
    pessoas.push(p)
  }
  pessoas.sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"))

  // ── Mês a mês ──
  const meses = new Map<string, MesRelatorio>()
  const mes = (c: string) =>
    meses.get(c) ??
    meses
      .set(c, { competencia: c, registros: 0, realizadas: zero(), pagas: zero(), valor: zero(), saldo: zero(), zerado: { positivo: 0, negativo: 0 } })
      .get(c)!
  for (const r of periodo) {
    const m = mes(r.competencia)
    m.registros++
    m.realizadas.f1 += r.he70
    m.realizadas.f2 += r.he100
    m.pagas.f1 += r.pagas70
    m.pagas.f2 += r.pagas100
    m.valor.f1 += r.valor70 ?? 0
    m.valor.f2 += r.valor100 ?? 0
    m.saldo.f1 += r.remanescente70 ?? 0
    m.saldo.f2 += r.remanescente100 ?? 0
  }
  const totais: TotaisRelatorio = {
    registros: periodo.length,
    pessoas: pessoas.length,
    realizadas: zero(),
    pagas: zero(),
    valor: zero(),
    horasComValor: zero(),
    saldoFinal: zero(),
    acertos: { positivo: 0, negativo: 0, pagoEmFolha: 0, descontado: 0, pessoas: 0 },
  }
  const comAcerto = new Set<string>()
  for (const [, lista] of acertosPorPessoa) {
    for (const a of lista) {
      if (!noPeriodo(a.competencia)) continue
      comAcerto.add(a.funcionarioId)
      for (const v of [a.saldo70, a.saldo100]) {
        if (v === null || v === 0) continue
        if (v > 0) totais.acertos.positivo += v
        else totais.acertos.negativo += -v
        const destino = destinoDoZerado(v, a.motivo)
        if (destino === "pagar") totais.acertos.pagoEmFolha += v
        if (destino === "descontar") totais.acertos.descontado += -v
        const z = mes(a.competencia).zerado
        if (v > 0) z.positivo += v
        else z.negativo += -v
      }
    }
  }
  totais.acertos.pessoas = comAcerto.size
  for (const p of pessoas) {
    for (const k of ["f1", "f2"] as const) {
      totais.realizadas[k] += p.realizadas[k]
      totais.pagas[k] += p.pagas[k]
      totais.valor[k] += p.valor[k]
      totais.saldoFinal[k] += p.saldoFinal[k]
      if (p.valorHora[k] !== null) totais.horasComValor[k] += p.valor[k] / p.valorHora[k]!
    }
  }
  for (const k of ["f1", "f2"] as const) {
    totais.realizadas[k] = r2(totais.realizadas[k])
    totais.pagas[k] = r2(totais.pagas[k])
    totais.valor[k] = r2(totais.valor[k])
    totais.saldoFinal[k] = r2(totais.saldoFinal[k])
    totais.horasComValor[k] = r2(totais.horasComValor[k])
  }
  for (const k of ["positivo", "negativo", "pagoEmFolha", "descontado"] as const) totais.acertos[k] = r2(totais.acertos[k])
  const listaMeses = [...meses.values()]
    .map((m) => ({
      ...m,
      realizadas: { f1: r2(m.realizadas.f1), f2: r2(m.realizadas.f2) },
      pagas: { f1: r2(m.pagas.f1), f2: r2(m.pagas.f2) },
      valor: { f1: r2(m.valor.f1), f2: r2(m.valor.f2) },
      saldo: { f1: r2(m.saldo.f1), f2: r2(m.saldo.f2) },
      zerado: { positivo: r2(m.zerado.positivo), negativo: r2(m.zerado.negativo) },
    }))
    .sort((a, b) => a.competencia.localeCompare(b.competencia))

  const linhas = [...periodo].sort((a, b) => a.competencia.localeCompare(b.competencia) || a.nome.localeCompare(b.nome, "pt-BR"))
  return { filtro, totais, meses: listaMeses, pessoas, divergencias, linhas, usaValor }
}

/** Custo médio da hora paga numa faixa (só sobre as horas com valor). */
export const custoMedioHora = (t: TotaisRelatorio, k: "f1" | "f2") => (t.horasComValor[k] > 0 ? r2(t.valor[k] / t.horasComValor[k]) : null)
