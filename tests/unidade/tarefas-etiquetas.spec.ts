import { expect, test } from "playwright/test"

import { ehCorEtiqueta, MAX_NOME_ETIQUETA, nomeDeEtiqueta } from "../../src/lib/nucleo-constantes"

test("nome da etiqueta: espaços e tamanho", () => {
  expect(nomeDeEtiqueta("  Campanha   salarial ")).toBe("Campanha salarial")
  expect(nomeDeEtiqueta("x".repeat(50)).length).toBe(MAX_NOME_ETIQUETA)
  expect(nomeDeEtiqueta("   ")).toBe("")
})

test("cor da etiqueta só da paleta", () => {
  expect(ehCorEtiqueta("azul")).toBe(true)
  expect(ehCorEtiqueta("#ff0000")).toBe(false)
})
