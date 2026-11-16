import { expect, test } from "playwright/test"

import { colunasDoNascimento, nascimentoDe } from "../../src/lib/nascimento"

test.describe("data de nascimento do usuário", () => {
  test("dia/mês valem; a data inteira dá o ano", () => {
    expect(nascimentoDe({ nascimento_dia: 5, nascimento_mes: 3, data_nascimento: "1980-03-05" })).toEqual({ dia: 5, mes: 3, ano: 1980 })
  })
  test("só a data inteira (como o Pessoal gravava): sai o dia e o mês dela", () => {
    expect(nascimentoDe({ data_nascimento: "1975-11-21" })).toEqual({ dia: 21, mes: 11, ano: 1975 })
    expect(nascimentoDe({ nascimento_data: "1990-01-02T00:00:00" })).toEqual({ dia: 2, mes: 1, ano: 1990 })
  })
  test("sem nada: null", () => {
    expect(nascimentoDe({})).toBeNull()
    expect(nascimentoDe({ nascimento_dia: 5 })).toBeNull()
  })
  test("gravar a data grava dia e mês junto; limpar limpa os três", () => {
    expect(colunasDoNascimento("1980-03-05")).toEqual({ data_nascimento: "1980-03-05", nascimento_dia: 5, nascimento_mes: 3 })
    expect(colunasDoNascimento(null)).toEqual({ data_nascimento: null, nascimento_dia: null, nascimento_mes: null })
  })
})
