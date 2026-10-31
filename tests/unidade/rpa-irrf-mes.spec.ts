import { expect, test } from "playwright/test"

import { calcularPorBruto, calcularPorLiquido, CONFIG_RPA_PADRAO as cfg, type OpcoesRpa } from "@/lib/rpa-calculo"

/** IRRF e teto do INSS apurados pelo mês do pagamento (lib/rpa-calculo.ts, onda 5 do RPA). */

const op: OpcoesRpa = { dependentes: 0, reterInss: true, reterIrrf: true, reterIss: false, issAliquota: 5 }

test("sem outros RPAs no mês, o cálculo é o de sempre", () => {
  const r = calcularPorBruto(3000, cfg, op, { mes: "2026-11", anteriores: [] })
  expect(r).toEqual({ valorBruto: 3000, inss: 330, irrf: 18.09, iss: 0, valorLiquido: 2651.91 })
  expect(r.memoria).toBeUndefined()
})

test("dois RPAs de R$ 1.500 no mês: o segundo retém o IRRF do total", () => {
  const primeiro = calcularPorBruto(1500, cfg, op)
  expect(primeiro.irrf).toBe(0) // sozinho, abaixo da isenção
  const segundo = calcularPorBruto(1500, cfg, op, {
    mes: "2026-11",
    anteriores: [{ numero: 1, bruto: 1500, inss: primeiro.inss, irrf: primeiro.irrf, pago: false }],
  })
  const unico = calcularPorBruto(3000, cfg, op)
  expect(segundo.inss + primeiro.inss).toBeCloseTo(unico.inss, 2)
  expect(segundo.irrf + primeiro.irrf).toBeCloseTo(unico.irrf, 2)
  expect(segundo.memoria).toMatchObject({ mes: "2026-11", brutoMes: 3000, inssMes: 330, baseIrrfMes: 2670, irrfMes: 18.09, irrfAnteriores: 0 })
})

test("o teto do INSS vale para o mês", () => {
  const ant = calcularPorBruto(8000, cfg, op)
  const r = calcularPorBruto(2000, cfg, op, { mes: "2026-11", anteriores: [{ numero: 7, bruto: 8000, inss: ant.inss, irrf: ant.irrf, pago: true }] })
  expect(ant.inss + r.inss).toBeCloseTo(Math.round(cfg.inss_teto * 11) / 100, 2)
  expect(r.inss).toBeCloseTo(17.32, 2)
})

test("dependente deduz uma vez no mês", () => {
  const comDep = { ...op, dependentes: 1 }
  const ant = calcularPorBruto(2000, cfg, comDep)
  const r = calcularPorBruto(2000, cfg, comDep, { mes: "2026-11", anteriores: [{ numero: 1, bruto: 2000, inss: ant.inss, irrf: ant.irrf, pago: false }] })
  expect(r.memoria?.baseIrrfMes).toBeCloseTo(4000 - 440 - 189.59, 2)
})

test("IRRF retido a mais nos anteriores não vira devolução", () => {
  const r = calcularPorBruto(100, cfg, op, { mes: "2026-11", anteriores: [{ numero: 1, bruto: 3000, inss: 330, irrf: 500, pago: true }] })
  expect(r.irrf).toBe(0)
})

test("conta inversa com o mês chega ao líquido pedido", () => {
  const noMes = { mes: "2026-11", anteriores: [{ numero: 1, bruto: 2000, inss: 220, irrf: 0, pago: false }] }
  const r = calcularPorLiquido(2000, cfg, op, noMes)
  expect(r.valorLiquido).toBe(2000)
  expect(r.memoria?.anteriores).toHaveLength(1)
})
