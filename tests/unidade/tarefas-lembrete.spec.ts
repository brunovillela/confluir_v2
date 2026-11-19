import { expect, test } from "playwright/test"

import { lembreteDePrazo } from "../../src/lib/nucleo-constantes"

const hoje = "2026-11-30"

test("véspera: vence amanhã", () => {
  expect(lembreteDePrazo({ prazo: "2026-12-01", concluido: false }, hoje)).toBe("vespera")
})

test("hoje e depois de amanhã não avisam", () => {
  expect(lembreteDePrazo({ prazo: hoje, concluido: false }, hoje)).toBeNull()
  expect(lembreteDePrazo({ prazo: "2026-12-02", concluido: false }, hoje)).toBeNull()
})

test("atraso: venceu ontem até 7 dias atrás", () => {
  expect(lembreteDePrazo({ prazo: "2026-11-29", concluido: false }, hoje)).toBe("atraso")
  expect(lembreteDePrazo({ prazo: "2026-11-23", concluido: false }, hoje)).toBe("atraso")
  expect(lembreteDePrazo({ prazo: "2026-11-22", concluido: false }, hoje)).toBeNull()
})

test("concluída ou sem prazo não avisa", () => {
  expect(lembreteDePrazo({ prazo: "2026-12-01", concluido: true }, hoje)).toBeNull()
  expect(lembreteDePrazo({ prazo: null, concluido: false }, hoje)).toBeNull()
})
