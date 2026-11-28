import { expect, test } from "playwright/test"

import {
  chaveDaConfig,
  horasDaReferencia,
  lerLinha,
  lerLinhas,
  normalizarRubricas,
  rubricaCandidata,
  totaisDasLinhas,
  type RubricaHE,
} from "../../src/lib/ponto-horas-pagas"

const he50: RubricaHE = { codigo: "0150", descricao: "Horas extras 50%", faixa: 1, tipo: "horas" }
const he100: RubricaHE = { codigo: null, descricao: "Horas extras 100%", faixa: 2, tipo: "horas" }
const dsr: RubricaHE = { codigo: "160", descricao: null, faixa: 1, tipo: "valor" }

test.describe("ponto: horas pagas pelo contracheque", () => {
  test("referência em decimal ou em horas e minutos", () => {
    expect(horasDaReferencia("10,50", "decimal")).toBe(10.5)
    expect(horasDaReferencia("10,30", "hhmm")).toBe(10.5)
    expect(horasDaReferencia("10:30", "decimal")).toBe(10.5)
    expect(horasDaReferencia("10,75", "hhmm")).toBeNull()
    expect(horasDaReferencia("12", "decimal")).toBe(12)
  })

  test("acha a rubrica pelo código ou pela descrição e tira horas e valor", () => {
    const a = lerLinha("150 HORAS EXTRAS 50%   10,00   1.234,56", [he50, he100], "decimal")
    expect(a).toMatchObject({ faixa: 1, horas: 10, valor: 1234.56, ambigua: false })
    // Descrição impressa diferente: o código basta.
    const b = lerLinha("0150 H.EXTRA 50 %  4:30  210,00", [he50], "decimal")
    expect(b).toMatchObject({ horas: 4.5, valor: 210, ambigua: false })
    const c = lerLinha("Horas Extras 100% 2,00 150,00", [he50, he100], "decimal")
    expect(c).toMatchObject({ faixa: 2, horas: 2, valor: 150 })
    // O código não casa com uma referência solta ("150" horas).
    expect(lerLinha("001 SALARIO BASE 150 5.000,00", [he50], "decimal")).toBeNull()
  })

  test("rubrica só de valor e linha ambígua", () => {
    expect(lerLinha("160 DSR S/ HORAS EXTRAS 5,00 98,40", [dsr], "decimal")).toMatchObject({ tipo: "valor", horas: null, valor: 98.4, ambigua: false })
    expect(lerLinha("HORAS EXTRAS 50% 350,00", [he50], "decimal")).toMatchObject({ ambigua: true })
  })

  test("outra via repetida conta uma vez e os totais somam por faixa", () => {
    const linhas = lerLinhas(
      [
        "150 HORAS EXTRAS 50% 10,00 300,00",
        "160 DSR S/ HORAS EXTRAS 5,00 60,00",
        "HORAS EXTRAS 100% 2,00 80,00",
        "150 HORAS EXTRAS 50% 10,00 300,00",
        "JOSE DA SILVA 123.456.789-09",
      ],
      [he50, he100, dsr],
      "decimal"
    )
    expect(linhas).toHaveLength(3)
    expect(totaisDasLinhas(linhas)).toEqual({ horas1: 10, horas2: 2, valor1: 360, valor2: 80, ambiguas: 0 })
  })

  test("configuração: normaliza, assina e sugere rubricas sem valores", () => {
    expect(normalizarRubricas([{ codigo: " ", descricao: "" }, { codigo: "1", faixa: "2", tipo: "x" }])).toEqual([
      { codigo: "1", descricao: null, faixa: 2, tipo: "horas" },
    ])
    expect(chaveDaConfig([he50], "decimal")).not.toBe(chaveDaConfig([he50], "hhmm"))
    expect(rubricaCandidata("0150 HORAS EXTRAS 50% 10,00 300,00")).toEqual({ codigo: "0150", descricao: "HORAS EXTRAS 50%" })
    expect(rubricaCandidata("001 SALARIO BASE 220,00 5.000,00")).toBeNull()
  })
})
