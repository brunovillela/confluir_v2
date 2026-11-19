import { expect, test } from "playwright/test"

import { proximoPrazoRecorrente } from "../../src/lib/nucleo-constantes"

test("semanal soma 7 dias, atravessando o mês", () => {
  expect(proximoPrazoRecorrente("2026-11-27", "semanal")).toBe("2026-12-04")
})

test("mensal mantém o dia", () => {
  expect(proximoPrazoRecorrente("2026-11-10", "mensal")).toBe("2026-12-10")
  expect(proximoPrazoRecorrente("2026-12-10", "mensal")).toBe("2027-01-10")
})

test("dia que o mês não tem vai ao último dia", () => {
  expect(proximoPrazoRecorrente("2027-01-30", "mensal")).toBe("2027-02-28")
  expect(proximoPrazoRecorrente("2028-01-30", "mensal")).toBe("2028-02-29")
})

test("fim do mês continua no fim do mês", () => {
  expect(proximoPrazoRecorrente("2026-04-30", "mensal")).toBe("2026-05-31")
  expect(proximoPrazoRecorrente("2027-02-28", "mensal")).toBe("2027-03-31")
})

test("trimestral, semestral e anual", () => {
  expect(proximoPrazoRecorrente("2026-11-15", "trimestral")).toBe("2027-02-15")
  expect(proximoPrazoRecorrente("2026-08-31", "semestral")).toBe("2027-02-28")
  expect(proximoPrazoRecorrente("2028-02-29", "anual")).toBe("2029-02-28")
  expect(proximoPrazoRecorrente("2026-03-15", "anual")).toBe("2027-03-15")
})
