import { expect, test } from "playwright/test"

import { conferirDataDespesa, primeiraDataDespesaAceita } from "../../src/lib/reembolsos-calculo"

test.describe("data da despesa do reembolso do ACT", () => {
  test("obrigatória e válida", () => {
    expect(conferirDataDespesa(null, "2026-11-14", null)).toBe("Informe a data da despesa.")
    expect(conferirDataDespesa("", "2026-11-14", null)).toBe("Informe a data da despesa.")
    expect(conferirDataDespesa("14/11/2026", "2026-11-14", null)).toBe("Informe a data da despesa.")
  })
  test("não pode ser futura", () => {
    expect(conferirDataDespesa("2026-11-15", "2026-11-14", null)).toBe("A data da despesa não pode ser futura.")
    expect(conferirDataDespesa("2026-11-14", "2026-11-14", null)).toBeNull()
  })
  test("sem prazo aceita qualquer data passada", () => {
    expect(conferirDataDespesa("2020-01-01", "2026-11-14", null)).toBeNull()
  })
  test("com prazo de 90 dias: o 90º dia ainda vale, o 91º não", () => {
    expect(primeiraDataDespesaAceita("2026-11-14", 90)).toBe("2026-08-16")
    expect(conferirDataDespesa("2026-08-16", "2026-11-14", 90)).toBeNull()
    expect(conferirDataDespesa("2026-08-15", "2026-11-14", 90)).toContain("passou do prazo")
    expect(conferirDataDespesa("2026-08-15", "2026-11-14", 90)).toContain("16/08/2026")
  })
})
