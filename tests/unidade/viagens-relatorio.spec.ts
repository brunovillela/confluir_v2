import { expect, test } from "playwright/test"

import {
  anoDaViagem,
  noitesDaHospedagem,
  resumirViagensPorAno,
  valorDaViagem,
} from "../../src/lib/viagens-relatorio"

const passagem = (modal: "aerea" | "rodoviaria", valor: number | null) => ({
  tipo: "passagem" as const,
  modal,
  checkin: null,
  checkout: null,
  valor,
})
const hotel = (checkin: string, checkout: string, valor: number | null) => ({
  tipo: "hospedagem" as const,
  modal: null,
  checkin,
  checkout,
  valor,
})

test.describe("relatório de viagens da pessoa", () => {
  test("noites da hospedagem", () => {
    expect(noitesDaHospedagem("2026-10-10", "2026-10-13")).toBe(3)
    expect(noitesDaHospedagem("2026-10-31", "2026-11-02")).toBe(2)
    expect(noitesDaHospedagem("2026-10-10", "2026-10-10")).toBe(0)
    expect(noitesDaHospedagem("2026-10-12", "2026-10-10")).toBe(0)
    expect(noitesDaHospedagem(null, "2026-10-10")).toBe(0)
  })

  test("valor soma os itens com valor, sem erro de centavos", () => {
    expect(valorDaViagem({ itens: [{ valor: 0.1 }, { valor: 0.2 }, { valor: null }] })).toBe(0.3)
  })

  test("ano pela primeira data; sem datas, pelo pedido", () => {
    expect(anoDaViagem({ inicio: "2025-12-30", createdAt: "2026-01-02T10:00:00Z" })).toBe(2025)
    expect(anoDaViagem({ inicio: null, createdAt: "2026-01-02T10:00:00Z" })).toBe(2026)
  })

  test("resumo por ano, do mais recente", () => {
    const r = resumirViagensPorAno([
      { inicio: "2025-05-01", createdAt: "2025-04-20", itens: [passagem("aerea", 800), hotel("2025-05-01", "2025-05-03", 400)] },
      { inicio: "2026-03-10", createdAt: "2026-03-01", itens: [passagem("rodoviaria", 120.5), passagem("aerea", null)] },
      { inicio: "2026-08-01", createdAt: "2026-07-20", itens: [hotel("2026-08-01", "2026-08-04", 900)] },
    ])
    expect(r).toEqual([
      { ano: 2026, viagens: 2, passagens: 2, aereas: 1, rodoviarias: 1, noites: 3, valor: 1020.5 },
      { ano: 2025, viagens: 1, passagens: 1, aereas: 1, rodoviarias: 0, noites: 2, valor: 1200 },
    ])
  })
})
