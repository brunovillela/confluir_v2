import { expect, test } from "playwright/test"

import {
  avulsosParecemParcelas,
  naturezaDaOrdem,
  numerarParcelas,
  rotuloParcela,
  valorSugeridoDasParcelas,
} from "@/lib/contratos-constantes"

test.describe("parcelas × pagamentos avulsos do contrato", () => {
  test("natureza: a coluna manda; sem ela, RPA é avulso e o legado é do sistema anterior", () => {
    expect(naturezaDaOrdem({ contrato_pagamento: "parcela", legado: true, tipo: "Contrato" })).toBe("parcela")
    expect(naturezaDaOrdem({ contrato_pagamento: null, legado: false, tipo: "RPA" })).toBe("avulso")
    expect(naturezaDaOrdem({ contrato_pagamento: null, legado: true, tipo: "Contrato" })).toBe("anterior")
    expect(naturezaDaOrdem({ contrato_pagamento: null, legado: false, tipo: "Contrato" })).toBe("avulso")
  })

  test("parcelas numeradas pelo vencimento no contrato, sem as canceladas nem os avulsos", () => {
    const { numeros, total } = numerarParcelas([
      { id: "c", natureza: "parcela", situacao: "A pagar", vencimento: "2026-12-05" },
      { id: "a", natureza: "parcela", situacao: "Paga", vencimento: "2026-10-05" },
      { id: "x", natureza: "parcela", situacao: "Cancelada", vencimento: "2026-11-01" },
      { id: "b", natureza: "parcela", situacao: "Paga", vencimento: "2026-11-05" },
      { id: "v", natureza: "avulso", situacao: "Paga", vencimento: "2026-10-20" },
    ])
    expect(total).toBe(3)
    expect([numeros.get("a"), numeros.get("b"), numeros.get("c")]).toEqual([1, 2, 3])
    expect(numeros.has("x")).toBe(false)
    expect(numeros.has("v")).toBe(false)
    expect(rotuloParcela(numeros.get("b"), total)).toBe("Parcela 2 de 3")
    expect(rotuloParcela(numeros.get("x"), total)).toBe("Parcela cancelada")
  })

  test("avulsos do mesmo valor em meses diferentes parecem mensalidades", () => {
    const base = { natureza: "avulso" as const, situacao: "Paga", tipo: "Contrato" }
    expect(
      avulsosParecemParcelas([
        { ...base, valor: 523.1, vencimento: "2026-10-11" },
        { ...base, valor: 523.1, vencimento: "2026-11-11" },
        { ...base, valor: 523.1, vencimento: "2026-12-11" },
        { ...base, valor: 90, vencimento: "2026-12-01" },
      ])
    ).toBe(3)
    // Mesmo mês (dois serviços sob demanda) ou valores diferentes: não.
    expect(
      avulsosParecemParcelas([
        { ...base, valor: 300, vencimento: "2026-10-13" },
        { ...base, valor: 300, vencimento: "2026-10-20" },
        { ...base, valor: 1750, vencimento: "2026-11-05" },
      ])
    ).toBe(0)
  })
})

test.describe("valor do contrato pelas parcelas", () => {
  const p = (valor: number | null, extra: Partial<{ natureza: "parcela" | "avulso" | "anterior"; situacao: string; tipo: string }> = {}) => ({
    natureza: extra.natureza ?? ("anterior" as const),
    situacao: extra.situacao ?? "Paga",
    tipo: extra.tipo ?? "Contrato",
    processo_compra_id: null,
    valor,
  })

  test("parcelas repetidas sugerem o valor; uma fora do padrão não atrapalha", () => {
    const r = valorSugeridoDasParcelas([p(5637.56), p(5637.56), p(5637.56), p(5637.56), p(6000)])
    expect(r).toEqual({ valor: 5637.56, repeticoes: 4, total: 5 })
  })

  test("valores variados, uma só parcela ou só avulsos/cancelados: sem sugestão", () => {
    expect(valorSugeridoDasParcelas([p(1750), p(1400), p(1610)])).toBeNull()
    expect(valorSugeridoDasParcelas([p(523.1)])).toBeNull()
    expect(
      valorSugeridoDasParcelas([p(300, { natureza: "avulso" }), p(300, { natureza: "avulso" }), p(300, { situacao: "Cancelada" })])
    ).toBeNull()
  })
})
