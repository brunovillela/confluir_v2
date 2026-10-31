import { expect, test } from "playwright/test"

import { alertasDaLeitura, competenciaDoNome, type LeituraContracheque } from "@/lib/contracheque-leitura"

/** Conferência da folha importada (lib/contracheque-leitura.ts). */

const leitura = (l: Partial<LeituraContracheque>): LeituraContracheque => ({
  nome: "Fulano",
  cpf: null,
  competencia: "2026-03",
  totalProventos: 5000,
  totalDescontos: 1000,
  valorLiquido: 4000,
  ...l,
})

test.describe("competenciaDoNome", () => {
  test("lê mês por extenso, MM/AAAA e AAAA-MM", () => {
    expect(competenciaDoNome("Folha — Março/2026")).toBe("2026-03")
    expect(competenciaDoNome("Julho/2026 - Mensal")).toBe("2026-07")
    expect(competenciaDoNome("03/2026")).toBe("2026-03")
    expect(competenciaDoNome("Folha 2026-11")).toBe("2026-11")
  })
  test("sem mês reconhecível, null", () => {
    expect(competenciaDoNome("13º salário 2025")).toBeNull()
    expect(competenciaDoNome("Adiantamento")).toBeNull()
    expect(competenciaDoNome(null)).toBeNull()
  })
})

test.describe("alertasDaLeitura", () => {
  test("sem contexto, só a conta", () => {
    expect(alertasDaLeitura(leitura({}))).toEqual([])
    expect(alertasDaLeitura(leitura({ valorLiquido: 3900 }))).toHaveLength(1)
  })
  test("competência diferente da remessa", () => {
    const a = alertasDaLeitura(leitura({ competencia: "2026-04" }), { competenciaRemessa: "2026-03" })
    expect(a).toEqual(["Competência lida 04/2026, mas a remessa é de 03/2026."])
    expect(alertasDaLeitura(leitura({}), { competenciaRemessa: "2026-03" })).toEqual([])
  })
  test("variação de 30% ou mais sobre o anterior", () => {
    expect(alertasDaLeitura(leitura({}), { liquidoAnterior: 3500 })).toEqual([])
    expect(alertasDaLeitura(leitura({}), { liquidoAnterior: 3000 })[0]).toContain("33% maior")
    expect(alertasDaLeitura(leitura({}), { liquidoAnterior: 6000 })[0]).toContain("33% menor")
    expect(alertasDaLeitura(leitura({}), { liquidoAnterior: null })).toEqual([])
  })
})
