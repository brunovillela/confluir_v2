import { expect, test } from "playwright/test"

import { podeCancelar, podeGestaoCancelar } from "../../src/lib/faltas-constantes"

test.describe("cancelar falta justificada", () => {
  test("funcionário: só enquanto aguarda (em qualquer data)", () => {
    expect(podeCancelar({ situacao: "aguardando" })).toBe(true)
    expect(podeCancelar({ situacao: "autorizada" })).toBe(false)
    expect(podeCancelar({ situacao: "recusada" })).toBe(false)
  })
  test("Pessoal: autorizada só com Gestão de Pessoal", () => {
    expect(podeGestaoCancelar({ situacao: "autorizada" }, true)).toBe(true)
    expect(podeGestaoCancelar({ situacao: "autorizada" }, false)).toBe(false)
    expect(podeGestaoCancelar({ situacao: "aguardando" }, false)).toBe(true)
    expect(podeGestaoCancelar({ situacao: "recusada" }, false)).toBe(true)
  })
})
