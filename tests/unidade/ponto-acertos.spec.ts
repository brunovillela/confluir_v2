import { expect, test } from "playwright/test"

import {
  acertosRecorrentesPendentes,
  destinoDoZerado,
  saldoNoFechamento,
  zeradoEntre,
  type AcertoDaPessoa,
} from "../../src/lib/ponto-acertos"

const acerto = (competencia: string, faixas: AcertoDaPessoa["faixas"] = "ambas"): AcertoDaPessoa => ({
  acertoId: competencia,
  competencia,
  faixas,
  motivo: "compensado",
})

test.describe("ponto: marcos de acerto", () => {
  test("o acerto no mês zera a remessa seguinte", () => {
    // Registro em junho, acerto em junho: julho começa do zero.
    expect(zeradoEntre([acerto("2026-06")], "2026-06", "2026-07")).toMatchObject({ faixa1: true, faixa2: true })
    // Acerto em julho não toca a remessa de julho (vale para agosto).
    expect(zeradoEntre([acerto("2026-07")], "2026-06", "2026-07")).toMatchObject({ faixa1: false, faixa2: false })
    // Sem remessa em julho: o acerto de julho zera a de agosto.
    expect(zeradoEntre([acerto("2026-07")], "2026-06", "2026-08").faixa1).toBe(true)
    // Acerto antes do registro anterior não conta mais.
    expect(zeradoEntre([acerto("2026-05")], "2026-06", "2026-07").faixa1).toBe(false)
    // Só uma faixa.
    expect(zeradoEntre([acerto("2026-06", "faixa2")], "2026-06", "2026-07")).toMatchObject({ faixa1: false, faixa2: true })
    // Sem registro anterior: qualquer acerto antes da remessa.
    expect(zeradoEntre([acerto("2025-12")], null, "2026-07").faixa1).toBe(true)
  })

  test("saldo no fechamento do mês do acerto", () => {
    const regs = [
      { competencia: "2026-05", remessaId: "r5", saldo70: 10, saldo100: 2 },
      { competencia: "2026-06", remessaId: "r6", saldo70: 12.5, saldo100: -3 },
    ]
    expect(saldoNoFechamento(regs, [], "2026-06")).toMatchObject({ saldo70: 12.5, saldo100: -3 })
    // Sem registro em julho: o fechamento de julho é o de junho.
    expect(saldoNoFechamento(regs, [], "2026-07")).toMatchObject({ saldo70: 12.5, saldo100: -3 })
    // Com acerto em junho, o fechamento de julho já é zero.
    expect(saldoNoFechamento(regs, [acerto("2026-06")], "2026-07")).toMatchObject({ saldo70: 0, saldo100: 0 })
    // O próprio mês do acerto ainda mostra o saldo antes de zerar.
    expect(saldoNoFechamento(regs, [acerto("2026-06")], "2026-06")).toMatchObject({ saldo70: 12.5 })
    expect(saldoNoFechamento(regs, [], "2026-04").registro).toBeNull()
  })

  test("destino do saldo zerado", () => {
    expect(destinoDoZerado(-3, "compensado")).toBe("descontar")
    expect(destinoDoZerado(5, "pago")).toBe("pagar")
    expect(destinoDoZerado(5, "rescisao")).toBe("pagar")
    expect(destinoDoZerado(5, "compensado")).toBe("nenhum")
    expect(destinoDoZerado(0, "pago")).toBe("nenhum")
  })

  test("acerto recorrente pendente no mês e no seguinte", () => {
    expect(acertosRecorrentesPendentes([6, 12], new Set(), "2026-06-10")).toEqual(["2026-06"])
    expect(acertosRecorrentesPendentes([6, 12], new Set(), "2026-07-02")).toEqual(["2026-06"])
    expect(acertosRecorrentesPendentes([6, 12], new Set(["2026-06"]), "2026-07-02")).toEqual([])
    expect(acertosRecorrentesPendentes([6, 12], new Set(), "2026-08-01")).toEqual([])
    // Dezembro cobra também em janeiro do ano seguinte.
    expect(acertosRecorrentesPendentes([12], new Set(), "2027-01-05")).toEqual(["2026-12"])
  })
})
