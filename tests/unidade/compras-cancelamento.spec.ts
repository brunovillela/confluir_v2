import { expect, test } from "playwright/test"

import {
  type CanceladoParaSaldo,
  noticiaDaDevolucao,
  ordemParaReduzir,
  planejarUsos,
  saldoDaDevolucao,
  saldoNaData,
  sugerirCreditosDoExtrato,
} from "../../src/lib/compras-cancelamento-regras"

test.describe("abatimento do crédito na compra nova", () => {
  const creditos = [
    { id: "a", codigo: "2026.1", saldo: 30 },
    { id: "b", codigo: "2026.2", saldo: 50 },
  ]

  test("usa os créditos na ordem dada até cobrir o valor", () => {
    expect(planejarUsos(creditos, 60)).toEqual({
      abatido: 60,
      usos: [
        { creditoId: "a", codigo: "2026.1", valor: 30 },
        { creditoId: "b", codigo: "2026.2", valor: 30 },
      ],
    })
  })

  test("compra maior que os créditos: abate tudo e o resto fica para pagar", () => {
    expect(planejarUsos(creditos, 200).abatido).toBe(80)
  })

  test("compra menor que o primeiro crédito: só ele, e só o valor da compra", () => {
    expect(planejarUsos(creditos, 12.34).usos).toEqual([{ creditoId: "a", codigo: "2026.1", valor: 12.34 }])
  })

  test("sem créditos, valor zero ou negativo: nada a abater", () => {
    expect(planejarUsos([], 100)).toEqual({ abatido: 0, usos: [] })
    expect(planejarUsos(creditos, 0).usos).toEqual([])
    expect(planejarUsos(creditos, -5).usos).toEqual([])
  })

  test("pula crédito zerado e não acumula erro de centavos", () => {
    const r = planejarUsos(
      [
        { id: "z", codigo: null, saldo: 0 },
        { id: "x", codigo: null, saldo: 0.1 },
        { id: "y", codigo: null, saldo: 0.2 },
      ],
      0.3
    )
    expect(r.usos.map((u) => u.creditoId)).toEqual(["x", "y"])
    expect(r.abatido).toBe(0.3)
  })
})

test.describe("cancelamento parcial: qual ordem é reduzida", () => {
  test("a maior ordem ainda não paga que continua com valor", () => {
    const ordens = [
      { id: 1, situacao: "A pagar", valor_inicial_cobranca: 100 },
      { id: 2, situacao: "Em autorização", valor_inicial_cobranca: 300 },
      { id: 3, situacao: "Paga", valor_inicial_cobranca: 900 },
    ]
    expect(ordemParaReduzir(ordens, 50)?.id).toBe(2)
  })

  test("ordem paga, cancelada, estornada ou na fatura não serve", () => {
    const ordens = ["Paga", "Cancelada", "Estornado", "Na fatura"].map((situacao, i) => ({ id: i, situacao, valor_inicial_cobranca: 500 }))
    expect(ordemParaReduzir(ordens, 10)).toBeUndefined()
  })

  test("ordem que zeraria não serve (fica crédito ou devolução)", () => {
    expect(ordemParaReduzir([{ situacao: "A pagar", valor_inicial_cobranca: 50 }], 50)).toBeUndefined()
    expect(ordemParaReduzir([{ situacao: "A pagar", valor_inicial_cobranca: 50.01 }], 50)).toBeDefined()
  })
})

test.describe("devolução a receber", () => {
  test("recebeu menos: segue aberta com o saldo", () => {
    expect(saldoDaDevolucao(100, 95)).toEqual({ saldo: 5, encerra: false })
  })

  test("recebeu tudo ou mais: encerra sem saldo", () => {
    expect(saldoDaDevolucao(100, 100)).toEqual({ saldo: 0, encerra: true })
    expect(saldoDaDevolucao(100, 120)).toEqual({ saldo: 0, encerra: true })
  })

  test("recebimentos em partes com centavos quebrados fecham certo", () => {
    expect(saldoDaDevolucao(100, 33.33 + 33.33 + 33.34)).toEqual({ saldo: 0, encerra: true })
  })

  test("sem valor cancelado, qualquer recebimento encerra", () => {
    expect(saldoDaDevolucao(null, 10).encerra).toBe(true)
  })

  test("parada: conta do cancelamento ou da última cobrança, a mais recente", () => {
    expect(noticiaDaDevolucao("2026-10-10", null, "2026-11-15")).toEqual({ dias: 36, parada: true })
    expect(noticiaDaDevolucao("2026-10-10", "2026-11-01", "2026-11-15")).toEqual({ dias: 14, parada: false })
    expect(noticiaDaDevolucao("2026-10-16", null, "2026-11-15")).toEqual({ dias: 30, parada: true })
    expect(noticiaDaDevolucao("2026-10-17", null, "2026-11-15").parada).toBe(false)
  })

  test("sugestões do extrato: exato primeiro, um pouco menos também, e nada antes do cancelamento", () => {
    const extrato = [
      { id: "antes", data: "2026-10-01", valor: 100, descricao: null },
      { id: "taxa", data: "2026-11-14", valor: 95, descricao: null },
      { id: "exato", data: "2026-11-15", valor: 100, descricao: null },
      { id: "metade", data: "2026-11-15", valor: 50, descricao: null },
      { id: "pouco", data: "2026-11-15", valor: 49.99, descricao: null },
      { id: "maior", data: "2026-11-15", valor: 100.5, descricao: null },
    ]
    const r = sugerirCreditosDoExtrato(extrato, 100, "2026-10-10", "2026-11-15")
    expect(r.map((c) => c.id)).toEqual(["exato", "taxa", "metade"])
    expect(r.map((c) => c.exato)).toEqual([true, false, false])
  })

  test("aceita crédito do extrato até 3 dias antes do cancelamento", () => {
    const extrato = [
      { id: "3d", data: "2026-10-07", valor: 100, descricao: null },
      { id: "4d", data: "2026-10-06", valor: 100, descricao: null },
    ]
    expect(sugerirCreditosDoExtrato(extrato, 100, "2026-10-10", "2026-11-15").map((c) => c.id)).toEqual(["3d"])
  })

  test("sem saldo, nada a sugerir", () => {
    expect(sugerirCreditosDoExtrato([{ id: "x", data: "2026-11-15", valor: 10, descricao: null }], 0, "2026-11-01", "2026-11-15")).toEqual([])
  })
})

test.describe("saldo com fornecedores numa data (contabilidade)", () => {
  const credito: CanceladoParaSaldo = {
    desfecho: "credito",
    valor: 100,
    creditoFechadoEm: null,
    creditoObs: null,
    validade: "2026-10-31",
    devolucaoEncerradaEm: null,
    devolucaoObs: null,
  }
  const devolucao: CanceladoParaSaldo = { ...credito, desfecho: "devolucao", valor: 50, validade: null }
  const uso = { valor: 30, criadoEm: "2026-10-20T15:00:00Z", desfeitoEm: null }
  const recebimentos = [
    { valor: 20, data: "2026-10-25" },
    { valor: 30, data: "2026-11-03" },
  ]

  test("crédito: antes do uso, em aberto; depois, usado em parte; depois da validade, vencido", () => {
    expect(saldoNaData(credito, [uso], [], "2026-10-15")).toEqual({ movimentado: 0, saldo: 100, situacao: "Em aberto" })
    expect(saldoNaData(credito, [uso], [], "2026-10-31")).toEqual({ movimentado: 30, saldo: 70, situacao: "Usado em parte" })
    expect(saldoNaData(credito, [uso], [], "2026-11-30")?.situacao).toBe("Vencido em 31/10/2026, sem uso")
  })

  test("uso desfeito depois da data ainda conta nela; desfeito antes, não", () => {
    const desfeito = { ...uso, desfeitoEm: "2026-11-05T12:00:00Z" }
    expect(saldoNaData(credito, [desfeito], [], "2026-10-31")?.saldo).toBe(70)
    expect(saldoNaData(credito, [desfeito], [], "2026-11-10")?.saldo).toBe(100)
  })

  test("o dia é o de São Paulo: uso às 23h de 31/10 (02h UTC de 01/11) entra em outubro", () => {
    const tarde = { valor: 10, criadoEm: "2026-11-01T02:00:00Z", desfeitoEm: null }
    expect(saldoNaData(credito, [tarde], [], "2026-10-31")?.saldo).toBe(90)
  })

  test("crédito fechado (usado ou perdido) até a data some; fechado depois, ainda aparece", () => {
    const perdido = { ...credito, creditoFechadoEm: "2026-11-10T12:00:00Z", creditoObs: "Vencido sem uso — crédito perdido." }
    expect(saldoNaData(perdido, [], [], "2026-11-30")).toBeNull()
    expect(saldoNaData(perdido, [], [], "2026-10-31")?.saldo).toBe(100)
  })

  test("devolução: recebimentos até a data; quitada some", () => {
    expect(saldoNaData(devolucao, [], recebimentos, "2026-10-15")).toEqual({ movimentado: 0, saldo: 50, situacao: "A receber" })
    expect(saldoNaData(devolucao, [], recebimentos, "2026-10-31")).toEqual({ movimentado: 20, saldo: 30, situacao: "Recebida em parte" })
    expect(saldoNaData(devolucao, [], recebimentos, "2026-11-30")).toBeNull()
  })

  test("devolução encerrada com perda até a data some; antes, mostra o saldo", () => {
    const comPerda = { ...devolucao, devolucaoEncerradaEm: "2026-11-20T12:00:00Z", devolucaoObs: "Recebido R$ 20,00; R$ 30,00 dados como perda: taxa" }
    expect(saldoNaData(comPerda, [], recebimentos.slice(0, 1), "2026-11-30")).toBeNull()
    expect(saldoNaData(comPerda, [], recebimentos.slice(0, 1), "2026-11-15")?.saldo).toBe(30)
  })

  test("resolvido na própria compra não é valor a receber", () => {
    expect(saldoNaData({ ...credito, creditoObs: "Abatido na ordem 2026.9 ainda não paga." }, [], [], "2026-10-15")).toBeNull()
    expect(saldoNaData({ ...devolucao, devolucaoObs: "Nada a devolver: nenhuma ordem da compra tinha sido paga." }, [], [], "2026-10-15")).toBeNull()
  })
})
