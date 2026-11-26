import { expect, test } from "playwright/test"

import { ehDispensa, textoDispensa } from "@/lib/compras-cotacao-direta"

test.describe("dispensa da cotação na aquisição direta", () => {
  test("o texto gravado traz motivo e explicação, e é reconhecido", () => {
    const t = textoDispensa("Fornecedor exclusivo", "  única gráfica\n com a tiragem  ")
    expect(t).toBe("Dispensa de cotação — Fornecedor exclusivo: única gráfica com a tiragem")
    expect(ehDispensa(t)).toBe(true)
  })

  test("justificativa de proposta única não é dispensa", () => {
    expect(ehDispensa("Fornecedor exclusivo da peça")).toBe(false)
    expect(ehDispensa(null)).toBe(false)
  })
})
