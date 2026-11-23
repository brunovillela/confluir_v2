import { expect, test } from "playwright/test"

import {
  consultaCanonica,
  mencaoEmDigitacao,
  mencoesNoTexto,
  partesComMencoes,
  rotuloDiasMedios,
  semanasAte,
  tempoMedioDias,
  vazaoPorSemana,
} from "../../src/lib/ferramentas-acompanhamento"

const PESSOAS = [
  { id: "ana", nome: "Ana" },
  { id: "anapaula", nome: "Ana Paula" },
  { id: "jose", nome: "José" },
]

test("menções: nome mais longo ganha, fronteira de palavra, sem maiúsculas", () => {
  expect(mencoesNoTexto("Oi @Ana Paula, veja com @josé.", PESSOAS)).toEqual(["anapaula", "jose"])
  expect(mencoesNoTexto("@ana pode ver?", PESSOAS)).toEqual(["ana"])
  expect(mencoesNoTexto("email@Ana.com e @Anabela", PESSOAS)).toEqual([])
  expect(mencoesNoTexto("@Ana e @Ana de novo", PESSOAS)).toEqual(["ana"])
  expect(partesComMencoes("Fala @Ana!", PESSOAS)).toEqual([
    { texto: "Fala ", mencao: false },
    { texto: "@Ana", mencao: true },
    { texto: "!", mencao: false },
  ])
})

test("menção em digitação", () => {
  expect(mencaoEmDigitacao("Oi @An", 6)).toEqual({ inicio: 3, busca: "An" })
  expect(mencaoEmDigitacao("Oi @Ana Pa", 10)).toEqual({ inicio: 3, busca: "Ana Pa" })
  expect(mencaoEmDigitacao("email@x", 7)).toBeNull()
  expect(mencaoEmDigitacao("sem nada", 8)).toBeNull()
})

test("consulta canônica do filtro salvo", () => {
  expect(consultaCanonica("tarefas", "?status=atrasadas&zzz=1&responsavel=abc&busca=")).toBe("responsavel=abc&status=atrasadas")
  expect(consultaCanonica("demandas", { situacao: "Fazendo", conversa: "x", departamento: ["d1", "d2"] })).toBe(
    "departamento=d1&situacao=Fazendo"
  )
})

test("vazão por semana e tempo médio", () => {
  // 23/11/2026 é segunda-feira.
  const semanas = semanasAte("2026-11-25", 3)
  expect(semanas).toEqual(["2026-11-09", "2026-11-16", "2026-11-23"])
  const itens = [
    { criadaEm: "2026-11-10T10:00:00Z", concluidaEm: "2026-11-17" },
    { criadaEm: "2026-11-18T10:00:00Z", concluidaEm: null },
    { criadaEm: "2026-11-23T09:00:00Z", concluidaEm: "2026-11-24" },
    { criadaEm: "2026-10-01T09:00:00Z", concluidaEm: "2026-11-24" },
  ]
  expect(vazaoPorSemana(itens, semanas)).toEqual({ criadas: [1, 1, 1], concluidas: [0, 1, 2] })
  expect(tempoMedioDias(itens.slice(0, 3), "2026-11-01")).toBe(4)
  expect(tempoMedioDias([], "2026-11-01")).toBeNull()
  expect(rotuloDiasMedios(4)).toBe("4 dias")
  expect(rotuloDiasMedios(1)).toBe("1 dia")
  expect(rotuloDiasMedios(0.4)).toBe("menos de 1 dia")
})
