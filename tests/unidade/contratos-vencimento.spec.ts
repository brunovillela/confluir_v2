import { expect, test } from "playwright/test"

import { primeiroVencimentoSugerido, ultimoVencimentoEmVigor } from "../../src/lib/contratos-constantes"

// Caso real: contrato com vigência desde 18/08, parcelas até 21/10 e uma
// cancelada em 24/11. A data sugerida era o início da vigência (18/08).
const ORDENS = [
  { vencimento: "2026-08-18", situacao: "Paga", tipo: "Contrato" },
  { vencimento: "2026-09-24", situacao: "Paga", tipo: "Contrato" },
  { vencimento: "2026-10-21", situacao: "Paga", tipo: "Contrato" },
  { vencimento: "2026-11-24", situacao: "Cancelada", tipo: "Contrato" },
  { vencimento: "2026-12-30", situacao: "Paga", tipo: "RPA" },
]

test.describe("vencimento sugerido ao gerar ordens do contrato", () => {
  test("última parcela em vigor ignora cancelada e RPA", () => {
    expect(ultimoVencimentoEmVigor(ORDENS)).toBe("2026-10-21")
    expect(ultimoVencimentoEmVigor([])).toBeNull()
  })

  test("nunca sugere data antes de hoje", () => {
    expect(
      primeiroVencimentoSugerido({
        vigenciaInicio: "2026-08-18",
        hoje: "2026-11-24",
        ultimoVencimento: "2026-10-21",
        periodicidade: "mensal",
      })
    ).toBe("2026-11-24")
    expect(
      primeiroVencimentoSugerido({ vigenciaInicio: "2026-08-18", hoje: "2026-11-24", ultimoVencimento: null, periodicidade: "mensal" })
    ).toBe("2026-11-24")
  })

  test("parcela seguinte à última quando ela ainda está à frente", () => {
    expect(
      primeiroVencimentoSugerido({ vigenciaInicio: "2026-08-18", hoje: "2026-11-24", ultimoVencimento: "2026-11-30", periodicidade: "mensal" })
    ).toBe("2026-12-30")
    expect(
      primeiroVencimentoSugerido({ vigenciaInicio: "2026-08-18", hoje: "2026-11-24", ultimoVencimento: "2026-08-18", periodicidade: "anual" })
    ).toBe("2027-08-18")
  })

  test("contrato que ainda vai começar sugere o início da vigência", () => {
    expect(
      primeiroVencimentoSugerido({ vigenciaInicio: "2027-01-10", hoje: "2026-11-24", ultimoVencimento: null, periodicidade: "mensal" })
    ).toBe("2027-01-10")
  })
})
