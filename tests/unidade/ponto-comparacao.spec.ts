import { expect, test } from "playwright/test"

import { rotuloAteMes, textoVariacao, variacaoPct } from "../../src/lib/ponto-comparacao"

test.describe("comparação entre anos do ponto", () => {
  test("variação percentual sobre o ano anterior", () => {
    expect(variacaoPct(120, 100)).toBe(20)
    expect(variacaoPct(78, 100)).toBe(-22)
    expect(variacaoPct(100, 100)).toBe(0)
    expect(variacaoPct(10, 0)).toBeNull()
  })

  test("texto da variação", () => {
    expect(textoVariacao(20)).toBe("+20%")
    expect(textoVariacao(-22)).toBe("−22%")
    expect(textoVariacao(0)).toBe("igual")
    expect(textoVariacao(null)).toBe("—")
  })

  test("rótulo do mesmo período", () => {
    expect(rotuloAteMes(10)).toBe("Jan–Out")
    expect(rotuloAteMes(1)).toBe("Jan")
    expect(rotuloAteMes(15)).toBe("Jan–Dez")
  })
})
