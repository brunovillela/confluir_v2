import { expect, test } from "playwright/test"

import { compararTextos, resumoDaComparacao } from "../../src/lib/comparar-textos"
import {
  CARTA_PADRAO,
  cartaEmTexto,
  conferirModeloCarta,
  juntarTitulo,
  montarCarta,
  montarTitulo,
  separarTitulo,
  TITULO_PADRAO,
  valoresDeExemplo,
} from "../../src/lib/oposicao-carta"

/** Título editável e comparação de versões da carta de oposição (15/11/2026). */

test.describe("título da carta", () => {
  test("sem título no modelo, vale o padrão e o corpo não muda", () => {
    expect(separarTitulo(CARTA_PADRAO)).toEqual({ titulo: null, corpo: CARTA_PADRAO })
    expect(montarTitulo(CARTA_PADRAO, valoresDeExemplo())).toBe(TITULO_PADRAO)
  })

  test("o título padrão não é gravado no modelo", () => {
    expect(juntarTitulo(TITULO_PADRAO, CARTA_PADRAO)).toBe(CARTA_PADRAO)
    expect(juntarTitulo("  ", CARTA_PADRAO)).toBe(CARTA_PADRAO)
  })

  test("título próprio vai como '# ' e sai do corpo da carta", () => {
    const modelo = juntarTitulo("Oposição — [CAMPANHA]", CARTA_PADRAO)
    expect(modelo.startsWith("# Oposição — [CAMPANHA]\n\n")).toBe(true)
    const v = valoresDeExemplo()
    expect(montarTitulo(modelo, v)).toBe(`Oposição — ${v.CAMPANHA}`)
    expect(cartaEmTexto(montarCarta(modelo, v))).toBe(cartaEmTexto(montarCarta(CARTA_PADRAO, v)))
    expect(conferirModeloCarta(modelo)).toEqual([])
  })

  test("título com referência vazia em trecho opcional some só o trecho", () => {
    const modelo = juntarTitulo("Carta{ — [EMPRESA]}", CARTA_PADRAO)
    expect(montarTitulo(modelo, valoresDeExemplo({ empresa: true }))).toBe("Carta")
  })

  test("conferência: título com negrito e carta só com título", () => {
    expect(conferirModeloCarta(juntarTitulo("**X**", CARTA_PADRAO)).join(" ")).toContain("título")
    expect(conferirModeloCarta("# Só título").join(" ")).toContain("falta o texto")
  })
})

test.describe("comparação de versões", () => {
  test("textos iguais não têm mudança", () => {
    const t = compararTextos(CARTA_PADRAO, CARTA_PADRAO)
    expect(resumoDaComparacao(t)).toEqual({ incluidas: 0, removidas: 0 })
    expect(t.map((x) => x.texto).join("")).toBe(CARTA_PADRAO)
  })

  test("mostra o que entrou e o que saiu, e reconstrói os dois textos", () => {
    const antes = "Eu, [NOME_COMPLETO], venho manifestar a minha oposição."
    const depois = "Eu, [NOME_COMPLETO], venho manifestar de forma expressa a minha oposição ao desconto."
    const t = compararTextos(antes, depois)
    expect(t.filter((x) => x.tipo !== "incluido").map((x) => x.texto).join("")).toBe(antes)
    expect(t.filter((x) => x.tipo !== "removido").map((x) => x.texto).join("")).toBe(depois)
    const r = resumoDaComparacao(t)
    expect(r.removidas).toBe(1) // "oposição."
    expect(r.incluidas).toBe(6) // "de forma expressa" + "oposição ao desconto."
  })
})
