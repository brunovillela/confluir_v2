import { expect, test } from "playwright/test"

import { criaCiclo, layoutGantt, ordenarPorDependencia } from "../../src/lib/gantt"

test("ciclo: direto, indireto e sem ciclo", () => {
  const deps = [
    { tarefa: "b", dependeDe: "a" },
    { tarefa: "c", dependeDe: "b" },
  ]
  expect(criaCiclo(deps, "a", ["c"])).toBe(true) // a → c → b → a
  expect(criaCiclo(deps, "a", ["a"])).toBe(true)
  expect(criaCiclo(deps, "d", ["c"])).toBe(false)
  // trocar as dependências de b (antes: a) por c criaria b → c → b
  expect(criaCiclo(deps, "b", ["c"])).toBe(true)
})

test("layout: escala, barras, sem data", () => {
  const r = layoutGantt(
    [
      { id: "a", inicio: "2026-11-20", prazo: "2026-11-22", concluido: true, dependeDe: [] },
      { id: "b", inicio: null, prazo: "2026-11-25", concluido: false, dependeDe: ["a"] },
      { id: "x", inicio: null, prazo: null, concluido: false, dependeDe: [] },
    ],
    "2026-11-22"
  )
  expect(r.de).toBe("2026-11-19")
  expect(r.ate).toBe("2026-11-26")
  expect(r.totalDias).toBe(8)
  expect(r.hoje).toBe(3)
  expect(r.semData).toEqual(["x"])
  expect(r.barras.find((b) => b.id === "a")).toEqual({ id: "a", inicio: 1, duracao: 3, bloqueada: false, conflitos: [] })
  expect(r.barras.find((b) => b.id === "b")).toEqual({ id: "b", inicio: 6, duracao: 1, bloqueada: false, conflitos: [] })
})

test("bloqueada e conflito de datas", () => {
  const r = layoutGantt(
    [
      { id: "a", inicio: "2026-11-20", prazo: "2026-11-25", concluido: false, dependeDe: [] },
      { id: "b", inicio: "2026-11-23", prazo: "2026-11-28", concluido: false, dependeDe: ["a"] },
    ],
    "2026-11-22"
  )
  const b = r.barras.find((x) => x.id === "b")
  expect(b?.bloqueada).toBe(true)
  expect(b?.conflitos).toEqual(["a"])
})

test("ordenar: a dependência vem antes", () => {
  const o = ordenarPorDependencia([
    { id: "b", inicio: "2026-11-01", prazo: null, dependeDe: ["a"] },
    { id: "a", inicio: "2026-11-10", prazo: null, dependeDe: [] },
    { id: "c", inicio: "2026-11-05", prazo: null, dependeDe: [] },
  ])
  expect(o.map((i) => i.id)).toEqual(["a", "b", "c"])
})
