import { expect, test } from "playwright/test"

import { MODULOS_IA, PROCESSOS_IA, processoIA, tituloModuloIA } from "../../src/lib/ia-processos"

/** Gestão › Inteligência Artificial: catálogo dos processos que chamam a IA (19/11/2026). */

test("todo processo do catálogo aponta para um módulo existente", () => {
  const modulos = new Set(MODULOS_IA.map((m) => m.slug))
  for (const p of PROCESSOS_IA) expect(modulos.has(p.modulo), p.chave).toBe(true)
})

test("chaves de processo são únicas e no formato modulo.nome", () => {
  const chaves = PROCESSOS_IA.map((p) => p.chave)
  expect(new Set(chaves).size).toBe(chaves.length)
  for (const c of chaves) expect(c).toMatch(/^[a-z]+\.[a-z_]+$/)
})

test("processo fora do catálogo vira 'não identificado' no módulo Outros", () => {
  expect(processoIA("inventado.xyz")).toEqual({ chave: "inventado.xyz", titulo: "Processo não identificado", modulo: "outros" })
  expect(processoIA(undefined).chave).toBe("nao_identificado")
  expect(processoIA("compras.descricao").modulo).toBe("compras")
  expect(tituloModuloIA("nao-existe")).toBe("Outros")
})

test("períodos da planilha: ano, ano passado e mês passado no fuso de Brasília", async () => {
  const { intervalo } = await import("../../src/app/painel/gestao/ia/periodos")
  // 1º/01/2027 às 01h de Brasília = 04h UTC: já é 2027 em Brasília.
  const agora = new Date("2027-01-01T04:00:00Z")
  expect(intervalo("ano", agora).de.toISOString()).toBe("2027-01-01T03:00:00.000Z")
  expect(intervalo("ano_anterior", agora)).toEqual({ de: new Date("2026-01-01T03:00:00Z"), ate: new Date("2027-01-01T03:00:00Z") })
  expect(intervalo("mes_anterior", agora)).toEqual({ de: new Date("2026-12-01T03:00:00Z"), ate: new Date("2027-01-01T03:00:00Z") })
  // 31/12/2026 às 23h de Brasília (02h UTC do dia 1º) ainda é 2026.
  expect(intervalo("ano", new Date("2027-01-01T02:00:00Z")).de.toISOString()).toBe("2026-01-01T03:00:00.000Z")
})
