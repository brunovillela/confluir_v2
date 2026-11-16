import { expect, test } from "playwright/test"

import { cotacaoForaDoPrazo, diasUteisDesde } from "@/lib/compras-prazo"

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
