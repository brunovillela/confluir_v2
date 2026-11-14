import { expect, test } from "playwright/test"

import { podeCancelarSemGestao } from "../../src/lib/ferias-painel"

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
