import { expect, test } from "playwright/test"

import { valorDaCompraSuspeito } from "../../src/lib/compras-valor-regras"

test.describe("valor da compra fora da escala das ordens", () => {
  test("vírgula no lugar errado: 1.000 e 100 vezes maior", () => {
    expect(valorDaCompraSuspeito(72_500_000, 72_500)).toContain("1.000 vezes")
    expect(valorDaCompraSuspeito(72_500_000, 72_500)).toContain("vírgula")
    expect(valorDaCompraSuspeito(38_875, 388.75)).toContain("100 vezes")
  })

  test("muito maior sem ser potência de dez: acusa, sem falar de vírgula", () => {
    const m = valorDaCompraSuspeito(15_000, 90)
    expect(m).toContain("167 vezes")
    expect(m).not.toContain("vírgula")
  })

  test("quase 100 vezes (centavo digitado diferente) ainda é vírgula", () => {
    expect(valorDaCompraSuspeito(30_935, 309.95)).toContain("vírgula")
  })

  test("compra menor que as ordens só quando a razão é 100, 1.000…", () => {
    expect(valorDaCompraSuspeito(25.5, 2_550)).toContain("menor")
    // Parcelas e frete: ordens somam mais que a compra, sem ser potência de dez.
    expect(valorDaCompraSuspeito(612.12, 3_702.72)).toBeNull()
    expect(valorDaCompraSuspeito(200, 3_930)).toBeNull()
  })

  test("diferença pequena, valores pequenos ou sem ordens: nada a acusar", () => {
    expect(valorDaCompraSuspeito(1_000, 950)).toBeNull()
    expect(valorDaCompraSuspeito(500, 5)).toBeNull()
    expect(valorDaCompraSuspeito(50_000, 0)).toBeNull()
    expect(valorDaCompraSuspeito(0, 100)).toBeNull()
  })
})
