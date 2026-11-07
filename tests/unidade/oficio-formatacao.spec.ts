import { expect, test } from "playwright/test"

import { lerCorpo, saudacaoNoCorpo, separaDoProximo } from "../../src/lib/oficio-formatacao"
import { normalizarAosCuidados } from "../../src/lib/oficios-constantes"

test.describe("saudacaoNoCorpo", () => {
  test("ofício 331/2026: saudação na primeira linha do corpo", () => {
    const corpo =
      "Prezado Senhor Diretor-Geral,\r\n[justify]O Sindicato tem a honra de convidar.[/justify]\r\n[justify]Certos de que…[/justify]"
    const r = saudacaoNoCorpo(corpo)
    expect(r?.saudacao).toBe("Prezado Senhor Diretor-Geral,")
    expect(r?.resto).toBe("[justify]O Sindicato tem a honra de convidar.[/justify]\n[justify]Certos de que…[/justify]")
  })

  test("tira a linha em branco que vinha depois da saudação", () => {
    expect(saudacaoNoCorpo("Senhor Superintendente:\n\nTexto.")?.resto).toBe("Texto.")
  })

  test("outros vocativos comuns", () => {
    for (const s of ["Ilustríssimo Senhor,", "Exmo. Sr. Prefeito,", "Senhora Diretora,", "Caros colegas,", "Prezados,"]) {
      expect(saudacaoNoCorpo(`${s}\nTexto.`)?.saudacao).toBe(s)
    }
  })

  test("não confunde parágrafo comum com saudação", () => {
    expect(saudacaoNoCorpo("O Sindicato vem, por meio deste,\nsolicitar.")).toBeNull()
    expect(saudacaoNoCorpo("Senhores, vimos solicitar a liberação dos dirigentes para a reunião do dia 10.")).toBeNull()
    expect(saudacaoNoCorpo("[ul][li]Prezados,[/li][/ul]")).toBeNull()
    expect(saudacaoNoCorpo("")).toBeNull()
  })
})

test.describe("separaDoProximo", () => {
  test("respiro só entre parágrafos com texto", () => {
    const blocos = lerCorpo("Um.\nDois.\n\nTrês.\n[ul][li]item[/li][/ul]\nQuatro.")
    // Um | Dois | (vazio) | Três | lista | Quatro
    expect(blocos.map((_, i) => separaDoProximo(blocos, i))).toEqual([true, false, false, true, false, false])
  })
})

test.describe("normalizarAosCuidados", () => {
  test("mantém nome e cargo em linhas separadas", () => {
    expect(normalizarAosCuidados("  Prof. Carlos Boynard \r\n\r\nDiretor-Geral do IFF  ")).toBe(
      "Prof. Carlos Boynard\nDiretor-Geral do IFF"
    )
  })

  test("vazio vira nulo e o excedente vai para a última linha", () => {
    expect(normalizarAosCuidados("  \n ")).toBeNull()
    expect(normalizarAosCuidados("a\nb\nc\nd")).toBe("a\nb\nc d")
  })
})
