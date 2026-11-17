import { expect, test } from "playwright/test"

import { cotacaoForaDoPrazo, diasDeAtraso, diasUteisDesde, entregaEsperada } from "@/lib/compras-prazo"

test.describe("prazo para iniciar a cotação (dias úteis)", () => {
  test("o dia da solicitação não conta; fim de semana fica de fora", () => {
    // 13/11/2026 é sexta; 16/11 é segunda.
    expect(diasUteisDesde("2026-11-13", "2026-11-13")).toBe(0)
    expect(diasUteisDesde("2026-11-13", "2026-11-14")).toBe(0)
    expect(diasUteisDesde("2026-11-13", "2026-11-16")).toBe(1)
    expect(diasUteisDesde("2026-11-13", "2026-11-18")).toBe(3)
  })

  test("feriado nacional não conta (Dia da Consciência Negra, 20/11)", () => {
    // 19/11/2026 é quinta; 20/11 é feriado; 23/11 é segunda.
    expect(diasUteisDesde("2026-11-19", "2026-11-23")).toBe(1)
  })

  test("fora do prazo só depois de passar os dias úteis; sem prazo nunca", () => {
    expect(cotacaoForaDoPrazo("2026-11-13", "2026-11-18", 3)).toBe(false)
    expect(cotacaoForaDoPrazo("2026-11-13", "2026-11-19", 3)).toBe(true)
    expect(cotacaoForaDoPrazo("2026-10-01", "2026-11-19", null)).toBe(false)
    expect(cotacaoForaDoPrazo(null, "2026-11-19", 3)).toBe(false)
  })
})

test.describe("entrega esperada do fornecimento", () => {
  test("previsão, depois o prazo da solicitação, depois 15 dias da compra", () => {
    expect(entregaEsperada("2026-11-19", "2026-11-30", "2026-11-01")).toEqual({ data: "2026-11-19", origem: "previsao" })
    expect(entregaEsperada(null, "2026-11-30", "2026-11-01")).toEqual({ data: "2026-11-30", origem: "prazo_solicitacao" })
    expect(entregaEsperada(null, null, "2026-11-01")).toEqual({ data: "2026-11-16", origem: "padrao" })
    expect(entregaEsperada(null, null, null)).toBeNull()
  })

  test("atraso em dias corridos", () => {
    expect(diasDeAtraso("2026-11-16", "2026-11-16")).toBe(0)
    expect(diasDeAtraso("2026-11-04", "2026-11-16")).toBe(12)
    expect(diasDeAtraso(null, "2026-11-16")).toBe(0)
  })
})
