import { expect, test } from "playwright/test"

import { casaBusca } from "../../src/lib/texto"

// Caso real (25/11/2026): o nome foi gravado com dois espaços antes do hífen e
// sem acento; a busca crua não o achava.
const NOME = "FABRICIA DA SILVA DA PENHA  - SAMBA PRAÇA SANTO ANTONIO"

test.describe("busca por nome (casaBusca)", () => {
  test("ignora acento, caixa e espaço repetido", () => {
    expect(casaBusca(NOME, "Fabrícia da Silva da Penha - Samba")).toBe(true)
    expect(casaBusca(NOME, "santo antônio")).toBe(true)
    expect(casaBusca(NOME, "praca")).toBe(true)
  })

  test("palavras em qualquer ordem", () => {
    expect(casaBusca(NOME, "samba fabricia")).toBe(true)
    expect(casaBusca(NOME, "penha silva")).toBe(true)
  })

  test("todas as palavras precisam estar no nome", () => {
    expect(casaBusca(NOME, "fabricia souza")).toBe(false)
    expect(casaBusca(NOME, "Fabrício")).toBe(false)
  })

  test("termo vazio casa tudo", () => {
    expect(casaBusca(NOME, "  ")).toBe(true)
  })
})
