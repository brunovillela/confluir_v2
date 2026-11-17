import { expect, test } from "playwright/test"

import { comQuantidade, lerQuantidade, separarQuantidade } from "@/lib/compras-quantidade"

test.describe("quantidade da compra na descrição", () => {
  test("lê números em pt-BR e recusa o que não é quantidade", () => {
    expect(lerQuantidade("2")).toBe(2)
    expect(lerQuantidade("2,5")).toBe(2.5)
    expect(lerQuantidade("1.000")).toBe(1000)
    expect(lerQuantidade("0")).toBeNull()
    expect(lerQuantidade("")).toBeNull()
    expect(lerQuantidade("duas")).toBeNull()
  })

  test("compõe e separa de volta (editar e repetir)", () => {
    const d = comQuantidade("Bolo de chocolate para a reunião", 2.5, "kg")
    expect(d).toBe("Bolo de chocolate para a reunião — Quantidade: 2,5 kg")
    expect(separarQuantidade(d)).toEqual({ produto: "Bolo de chocolate para a reunião", quantidade: "2,5", unidade: "kg" })
  })

  test("não duplica a quantidade ao compor de novo", () => {
    const d = comQuantidade("Canetas — Quantidade: 3 caixas", 5, "caixas")
    expect(d).toBe("Canetas — Quantidade: 5 caixas")
  })

  test("descrição sem quantidade fica como está", () => {
    expect(separarQuantidade("Serviço de transporte")).toEqual({ produto: "Serviço de transporte", quantidade: null, unidade: null })
  })
})
