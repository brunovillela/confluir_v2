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
