import { expect, test } from "playwright/test"

import { custoMedioHora, montarRelatorioGeral, type ItemAcertoRelatorio, type RegistroRelatorio } from "../../src/lib/ponto-relatorio-geral"

const dep = { chave: "d1", nome: "Administrativo" }
function reg(competencia: string, p: Partial<RegistroRelatorio> = {}): RegistroRelatorio {
  const base = {
    remessaId: `r-${competencia}`,
    competencia,
    funcionarioId: "ana",
    nome: "Ana",
    departamento: dep,
    he70: 0,
    he100: 0,
    pagas70: 0,
    pagas100: 0,
    anterior70: 0,
    anterior100: 0,
    valor70: null,
    valor100: null,
    pagasDoContracheque: false,
    ...p,
  }
  return {
    remanescente70: (base.anterior70 ?? 0) + base.he70 - base.pagas70,
    remanescente100: (base.anterior100 ?? 0) + base.he100 - base.pagas100,
    ...base,
  } as RegistroRelatorio
}
const periodo = { de: "2026-01", ate: "2026-12" }

test.describe("ponto: relatório consolidado", () => {
  test("soma horas, valor e custo médio; o saldo final é o do último registro", () => {
    const r = montarRelatorioGeral(
      [
        reg("2026-01", { he70: 10, pagas70: 4, valor70: 140 }),
        reg("2026-02", { anterior70: 6, he70: 2, pagas70: 8, valor70: 280 }),
      ],
      [],
      periodo
    )
    expect(r.totais.realizadas.f1).toBe(12)
    expect(r.totais.pagas.f1).toBe(12)
    expect(r.totais.valor.f1).toBe(420)
    expect(custoMedioHora(r.totais, "f1")).toBe(35)
    expect(r.totais.saldoFinal.f1).toBe(0)
    expect(r.meses.map((m) => m.competencia)).toEqual(["2026-01", "2026-02"])
    expect(r.divergencias).toEqual([])
  })

  test("acha conta que não fecha, cadeia quebrada e pagamento sem saldo", () => {
    const r = montarRelatorioGeral(
      [
        reg("2026-01", { he70: 10 }), // fecha com 10
        reg("2026-02", { anterior70: 7, he70: 1, remanescente70: 9 }), // anterior devia ser 10; 7+1 ≠ 9
        reg("2026-03", { anterior70: 9, pagas70: 12 }), // pagou 12 com 9
      ],
      [],
      periodo
    )
    expect(r.divergencias.map((d) => `${d.competencia}:${d.tipo}`).sort()).toEqual(["2026-02:cadeia", "2026-02:conta", "2026-03:pagou_sem_saldo"])
  })

  test("o acerto zera a cadeia e entra nos totais pelo destino", () => {
    const acertos: ItemAcertoRelatorio[] = [
      { acertoId: "a1", funcionarioId: "ana", competencia: "2026-01", faixas: "ambas", motivo: "pago", saldo70: 10, saldo100: -2 },
    ]
    const r = montarRelatorioGeral(
      [reg("2026-01", { he70: 10, he100: -2 }), reg("2026-02", { anterior70: 0, anterior100: 0, he70: 3 })],
      acertos,
      periodo
    )
    expect(r.divergencias).toEqual([])
    expect(r.totais.acertos).toEqual({ positivo: 10, negativo: 2, pagoEmFolha: 10, descontado: 2, pessoas: 1 })
    expect(r.pessoas[0].saldoFinal).toEqual({ f1: 3, f2: 0 })
    // Acerto no mês do último registro zera o saldo final.
    const r2 = montarRelatorioGeral([reg("2026-01", { he70: 10 })], acertos, periodo)
    expect(r2.pessoas[0].saldoFinal.f1).toBe(0)
  })

  test("valor da hora fora do padrão e horas pagas sem valor", () => {
    const r = montarRelatorioGeral(
      [
        reg("2026-01", { he70: 10, pagas70: 10, valor70: 350 }),
        reg("2026-02", { he70: 10, pagas70: 10, valor70: 350 }),
        reg("2026-03", { he70: 10, pagas70: 10, valor70: 700 }),
        reg("2026-04", { he70: 2, pagas70: 2 }),
        // Na mesma remessa, outra pessoa veio do contracheque: a Ana ficou de fora.
        reg("2026-04", { funcionarioId: "bia", nome: "Bia", he70: 1, pagas70: 1, valor70: 35, pagasDoContracheque: true }),
        // Remessa toda digitada: sem aviso.
        reg("2026-05", { he70: 1, pagas70: 1 }),
      ],
      [],
      periodo
    )
    expect(r.divergencias.map((d) => `${d.competencia}:${d.tipo}`)).toEqual(["2026-03:valor_hora", "2026-04:sem_valor"])
  })

  test("filtra por período e departamento, sem perder a cadeia anterior", () => {
    const r = montarRelatorioGeral(
      [reg("2025-12", { he70: 5 }), reg("2026-01", { anterior70: 5, he70: 1 }), reg("2026-01", { funcionarioId: "bia", nome: "Bia", departamento: { chave: "d2", nome: "Operacional" }, he70: 9 })],
      [],
      { ...periodo, departamento: "d1" }
    )
    expect(r.pessoas.map((p) => p.nome)).toEqual(["Ana"])
    expect(r.totais.realizadas.f1).toBe(1)
    expect(r.divergencias).toEqual([])
  })
})
