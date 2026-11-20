import { expect, test } from "playwright/test"

import { motivoNascimentoSuspeito } from "../../src/lib/saude-cadastros"

/** Data de nascimento suspeita na Saúde dos cadastros (19/11/2026). */

const HOJE = "2026-11-19"

test("data normal não é suspeita", () => {
  expect(motivoNascimentoSuspeito("1984-03-28", [{ filiacao: "2010-05-01", admissao: "2008-02-01" }], HOJE)).toBeNull()
  expect(motivoNascimentoSuspeito(null, [], HOJE)).toBeNull()
})

test("século trocado: 2049 sugere 1949", () => {
  expect(motivoNascimentoSuspeito("2049-07-10", [], HOJE)).toEqual({ motivo: "Data no futuro", sugestao: "1949-07-10" })
})

test("igual à data de filiação de um vínculo (o caso do eleitor barrado)", () => {
  const r = motivoNascimentoSuspeito("2007-06-25", [{ filiacao: "2026-03-17" }, { filiacao: "2007-06-25" }], HOJE)
  expect(r?.motivo).toBe("Igual à data de filiação ou admissão de um vínculo")
})

test("idade fora do plausível e filiação antes de nascer", () => {
  expect(motivoNascimentoSuspeito("2020-01-01", [], HOJE)?.motivo).toBe("Idade de 6 anos")
  expect(motivoNascimentoSuspeito("1900-01-01", [], HOJE)?.motivo).toBe("Idade de 126 anos")
  expect(motivoNascimentoSuspeito("1990-01-01", [{ filiacao: "1985-01-01" }], HOJE)?.motivo).toBe(
    "Filiação anterior ao nascimento"
  )
})
