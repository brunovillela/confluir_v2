import { expect, test } from "playwright/test"

import { abonoSoDesteGozo, podeCancelarSemGestao } from "../../src/lib/ferias-painel"

test.describe("cancelar gozo de férias pelo próprio funcionário", () => {
  test("antes do início pode", () => {
    expect(podeCancelarSemGestao("2026-12-01", "2026-11-14")).toBe(true)
  })
  test("no próprio dia do início ainda pode", () => {
    expect(podeCancelarSemGestao("2026-11-14", "2026-11-14")).toBe(true)
  })
  test("depois do início só a gestão", () => {
    expect(podeCancelarSemGestao("2026-11-13", "2026-11-14")).toBe(false)
  })
  test("gozo sem data de início pode", () => {
    expect(podeCancelarSemGestao(null, "2026-11-14")).toBe(true)
  })
})

test.describe("abono que veio só com o gozo cancelado", () => {
  const p = (abono: boolean, gozos: { id: string; autorizado: boolean; abono_solicitado: boolean }[]) => ({
    abono_pecuniario: abono,
    gozos,
  })
  test("autorizado com abono, único: pergunta", () => {
    expect(abonoSoDesteGozo(p(true, [{ id: "a", autorizado: true, abono_solicitado: true }]), "a")).toBe(true)
  })
  test("outro gozo autorizado também pediu: não pergunta", () => {
    const per = p(true, [
      { id: "a", autorizado: true, abono_solicitado: true },
      { id: "b", autorizado: true, abono_solicitado: true },
    ])
    expect(abonoSoDesteGozo(per, "a")).toBe(false)
  })
  test("período sem abono, gozo sem pedido ou não autorizado: não pergunta", () => {
    expect(abonoSoDesteGozo(p(false, [{ id: "a", autorizado: true, abono_solicitado: true }]), "a")).toBe(false)
    expect(abonoSoDesteGozo(p(true, [{ id: "a", autorizado: true, abono_solicitado: false }]), "a")).toBe(false)
    expect(abonoSoDesteGozo(p(true, [{ id: "a", autorizado: false, abono_solicitado: true }]), "a")).toBe(false)
  })
})
