import { expect, test } from "playwright/test"

import { chaveMatricula, chaveNome } from "@/lib/casamento"
import { emParalelo } from "@/lib/paralelo"

/** Chaves de casamento (Receitas e lista de trabalhadores) e o paralelismo comum. */

test.describe("chaveNome", () => {
  test("sem acento, maiúsculo e espaços colapsados", () => {
    expect(chaveNome("  José   Carlos de Oliveira ")).toBe("JOSE CARLOS DE OLIVEIRA")
    expect(chaveNome("ANTONIO FERREIRA NUNES")).toBe(chaveNome("Antônio Ferreira Nunes"))
  })
  test("vazio vira texto vazio", () => {
    expect(chaveNome(null)).toBe("")
    expect(chaveNome(undefined)).toBe("")
  })
})

test.describe("chaveMatricula", () => {
  test("só letras e números, sem zeros à esquerda, maiúsculas", () => {
    expect(chaveMatricula("0003002")).toBe("3002")
    expect(chaveMatricula("0012.345-6")).toBe("123456")
    expect(chaveMatricula("ab-123")).toBe("AB123")
  })
  test("o arquivo e o banco casam pela mesma chave", () => {
    expect(chaveMatricula("003002")).toBe(chaveMatricula("3002"))
  })
  test("vazio ou só zeros vira texto vazio", () => {
    expect(chaveMatricula(null)).toBe("")
    expect(chaveMatricula("000")).toBe("")
  })
})

test.describe("emParalelo", () => {
  test("devolve na ordem dos itens, mesmo terminando fora de ordem", async () => {
    const r = await emParalelo([30, 5, 15, 1], 3, async (ms, i) => {
      await new Promise((ok) => setTimeout(ok, ms))
      return `${i}:${ms}`
    })
    expect(r).toEqual(["0:30", "1:5", "2:15", "3:1"])
  })
  test("nunca passa do limite ao mesmo tempo", async () => {
    let agora = 0
    let pico = 0
    await emParalelo(Array.from({ length: 12 }, (_, i) => i), 4, async () => {
      agora++
      pico = Math.max(pico, agora)
      await new Promise((ok) => setTimeout(ok, 5))
      agora--
    })
    expect(pico).toBe(4)
  })
  test("lista vazia não chama a tarefa", async () => {
    let chamadas = 0
    const r = await emParalelo([], 5, async () => {
      chamadas++
    })
    expect(r).toEqual([])
    expect(chamadas).toBe(0)
  })
})
