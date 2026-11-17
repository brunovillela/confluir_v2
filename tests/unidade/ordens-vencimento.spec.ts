import { expect, test } from "playwright/test"

import { vencimentoAntigo, vencimentoComAnoSuspeito } from "../../src/lib/ordens-vencimento"

const HOJE = "2026-11-17"

test.describe("vencimento com o ano errado", () => {
  test("os casos vistos em produção são pegos", () => {
    for (const v of ["2016-08-01", "2020-10-09", "2023-10-18", "2024-10-29", "2025-10-16"]) {
      expect(vencimentoAntigo(v, HOJE), v).toBe(true)
      expect(vencimentoComAnoSuspeito(v, HOJE), v).toContain("confira o ano")
    }
  })

  test("atraso normal passa: até 180 dias atrás", () => {
    expect(vencimentoAntigo("2026-05-21", HOJE)).toBe(false) // 180 dias
    expect(vencimentoAntigo("2026-05-20", HOJE)).toBe(true) // 181 dias
    expect(vencimentoComAnoSuspeito("2026-08-11", HOJE)).toBeNull()
  })

  test("virada do ano: dezembro corrigido em janeiro passa", () => {
    expect(vencimentoComAnoSuspeito("2026-12-20", "2027-01-05")).toBeNull()
  })

  test("o limite de dias é configurável", () => {
    expect(vencimentoAntigo("2026-10-01", HOJE, 30)).toBe(true)
    expect(vencimentoAntigo("2026-10-20", HOJE, 30)).toBe(false)
  })

  test("à frente: parcelas de contrato longo passam; ano absurdo não", () => {
    expect(vencimentoComAnoSuspeito("2028-01-15", HOJE)).toBeNull()
    expect(vencimentoComAnoSuspeito("2031-12-31", HOJE)).toBeNull()
    expect(vencimentoComAnoSuspeito("2062-11-17", HOJE)).toContain("confira o ano")
  })

  test("data malformada é recusada", () => {
    expect(vencimentoComAnoSuspeito("17/11/2026", HOJE)).toBe("Vencimento inválido.")
  })
})
