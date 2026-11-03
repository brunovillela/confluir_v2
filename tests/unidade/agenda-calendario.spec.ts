import { expect, test } from "playwright/test"

import {
  camposDaVaga,
  diasDaVisao,
  distribuirNaSemana,
  distribuirNoDia,
  ehDia,
  ehFaixa,
  limitesDaConsulta,
  navegar,
  periodoEmDias,
  rotuloPeriodo,
  somarMeses,
  tituloDaVisao,
} from "@/lib/agenda-calendario"

const ev = (id: string, inicio: string, termino: string | null = null, diaTodo = false) => ({
  id,
  inicio,
  termino,
  diaTodo,
})

test.describe("grade", () => {
  test("mês vai de domingo a sábado, com semanas inteiras", () => {
    const dias = diasDaVisao("mes", "2026-11-03")
    expect(dias[0]).toBe("2026-11-01")
    expect(dias[dias.length - 1]).toBe("2026-12-05")
    expect(dias.length % 7).toBe(0)
  })
  test("semana começa no domingo mesmo a partir do sábado", () => {
    const dias = diasDaVisao("semana", "2026-11-07")
    expect(dias).toHaveLength(7)
    expect(dias[0]).toBe("2026-11-01")
  })
  test("somar mês não pula fevereiro", () => {
    expect(somarMeses("2026-01-31", 1)).toBe("2026-02-28")
    expect(somarMeses("2026-12-15", 1)).toBe("2027-01-15")
    expect(navegar("mes", "2026-03-31", -1)).toBe("2026-02-28")
  })
  test("consulta usa os limites de Brasília", () => {
    expect(limitesDaConsulta(["2026-11-03"])).toEqual({
      de: "2026-11-03T03:00:00.000Z",
      ate: "2026-11-04T03:00:00.000Z",
    })
  })
  test("títulos", () => {
    expect(tituloDaVisao("mes", "2026-11-03")).toBe("novembro de 2026")
    expect(tituloDaVisao("semana", "2026-11-03")).toBe("1 a 7 de novembro de 2026")
    expect(tituloDaVisao("semana", "2026-12-30")).toBe("27 de dezembro de 2026 a 2 de janeiro de 2027")
  })
  test("data da URL inválida é recusada", () => {
    expect(ehDia("2026-11-03")).toBe(true)
    expect(ehDia("2026-02-31")).toBe(false)
    expect(ehDia("ontem")).toBe(false)
  })
})

test.describe("compromisso no fuso", () => {
  test("22h em Brasília continua no mesmo dia, embora já seja amanhã em UTC", () => {
    expect(periodoEmDias(ev("a", "2026-11-04T01:00:00Z"))?.diaIni).toBe("2026-11-03")
  })
  test("término à meia-noite não ocupa o dia seguinte", () => {
    const e = ev("a", "2026-11-03T22:00:00-03:00", "2026-11-04T00:00:00-03:00")
    expect(periodoEmDias(e)?.diaFim).toBe("2026-11-03")
    expect(ehFaixa(e)).toBe(false)
    expect(distribuirNoDia([e], "2026-11-03")[0]).toMatchObject({ inicioMin: 1320, fimMin: 1440 })
  })
  test("término antes do início (dado migrado) não quebra", () => {
    const e = ev("a", "2026-11-03T10:00:00-03:00", "2026-11-01T10:00:00-03:00")
    expect(periodoEmDias(e)).toEqual({ diaIni: "2026-11-03", diaFim: "2026-11-03" })
  })
  test("assembleia de um dia para o outro vira faixa", () => {
    expect(ehFaixa(ev("a", "2026-10-07T10:00:00-03:00", "2026-10-09T10:00:00-03:00"))).toBe(true)
  })
  test("rótulos", () => {
    expect(rotuloPeriodo(ev("a", "2026-11-03T09:00:00-03:00", "2026-11-03T10:30:00-03:00"))).toContain("– 10:30")
    expect(rotuloPeriodo(ev("a", "2026-11-03T12:00:00-03:00", "2026-11-05T12:00:00-03:00", true))).toBe(
      "03/11/2026 a 05/11/2026 (dia todo)"
    )
    expect(rotuloPeriodo({ inicio: null, termino: null, diaTodo: false })).toBe("—")
  })
})

test.describe("faixas da semana", () => {
  const semana = diasDaVisao("semana", "2026-11-03")

  test("corta no limite da semana e marca a continuação", () => {
    const { barras } = distribuirNaSemana(
      [ev("longa", "2026-10-30T12:00:00-03:00", "2026-11-03T12:00:00-03:00", true)],
      semana
    )
    expect(barras[0]).toMatchObject({ coluna: 0, span: 3, continuaAntes: true, continuaDepois: false })
  })
  test("sobrepostos descem de linha; quem não colide reaproveita", () => {
    const { barras } = distribuirNaSemana(
      [
        ev("a", "2026-11-02T12:00:00-03:00", "2026-11-04T12:00:00-03:00", true),
        ev("b", "2026-11-03T09:00:00-03:00"),
        ev("c", "2026-11-05T09:00:00-03:00"),
      ],
      semana
    )
    const linha = (id: string) => barras.find((b) => b.evento.id === id)?.linha
    expect(linha("a")).toBe(0)
    expect(linha("b")).toBe(1)
    expect(linha("c")).toBe(0)
  })
  test("o que não cabe conta em +N mais só nos dias que ocupa", () => {
    const { barras, ocultos } = distribuirNaSemana(
      [
        ev("a", "2026-11-03T08:00:00-03:00"),
        ev("b", "2026-11-03T09:00:00-03:00"),
        ev("c", "2026-11-03T10:00:00-03:00"),
      ],
      semana,
      2
    )
    expect(barras).toHaveLength(2)
    expect(ocultos).toEqual([0, 0, 1, 0, 0, 0, 0])
  })
  test("fora do trecho não entra", () => {
    expect(distribuirNaSemana([ev("a", "2026-11-20T09:00:00-03:00")], semana).barras).toHaveLength(0)
  })
})

test.describe("grade de horas", () => {
  const dia = "2026-11-03"

  test("sobrepostos dividem a largura; os seguintes não", () => {
    const blocos = distribuirNoDia(
      [
        ev("a", `${dia}T09:00:00-03:00`, `${dia}T10:00:00-03:00`),
        ev("b", `${dia}T09:30:00-03:00`, `${dia}T10:30:00-03:00`),
        ev("c", `${dia}T11:00:00-03:00`, `${dia}T12:00:00-03:00`),
      ],
      dia
    )
    const de = (id: string) => blocos.find((b) => b.evento.id === id)!
    expect(de("a")).toMatchObject({ coluna: 0, colunas: 2 })
    expect(de("b")).toMatchObject({ coluna: 1, colunas: 2 })
    expect(de("c")).toMatchObject({ coluna: 0, colunas: 1 })
  })
  test("sem término vale 1 hora; faixa fica de fora", () => {
    const blocos = distribuirNoDia(
      [ev("a", `${dia}T09:00:00-03:00`), ev("f", `${dia}T12:00:00-03:00`, null, true)],
      dia
    )
    expect(blocos).toHaveLength(1)
    expect(blocos[0]).toMatchObject({ inicioMin: 540, fimMin: 600 })
  })
})

test.describe("criação rápida", () => {
  test("clique no mês sugere 09:00–10:00", () => {
    expect(camposDaVaga({ dia: "2026-11-03" })).toMatchObject({
      inicio: "2026-11-03T09:00",
      termino: "2026-11-03T10:00",
      diaTodo: false,
    })
  })
  test("às 23:30 o término cai no dia seguinte", () => {
    expect(camposDaVaga({ dia: "2026-11-03", minuto: 1410 }).termino).toBe("2026-11-04T00:30")
  })
})
