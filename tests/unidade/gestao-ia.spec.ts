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

test("sugestão de troca de modelo: só processo simples, com economia relevante", async () => {
  const { custoComPrecos, sugerirTrocasDeModelo, simplesComGasto } = await import("../../src/lib/ia-sugestao-modelo")
  // 1 milhão de entrada (200 mil em cache) e 100 mil de saída.
  const base = { entrada: 1_000_000, cache: 200_000, saida: 100_000 }
  expect(custoComPrecos(base, { entrada: 1, cache: 0.1, saida: 10 })).toBeCloseTo(0.8 + 0.02 + 1, 6)
  // Sem preço de cache, o cache paga como entrada.
  expect(custoComPrecos(base, { entrada: 1, cache: null, saida: 0 })).toBeCloseTo(1, 6)

  const usos = [
    { processo: "compras.descricao", chamadas: 40, ...base, custo: 1.82 },
    { processo: "saude.cat_leitura", chamadas: 40, ...base, custo: 5 }, // não é simples
    { processo: "painel.ajuda", chamadas: 3, entrada: 1000, cache: 0, saida: 100, custo: 0.002 }, // gasto irrisório
    { processo: "telegram.conversa", chamadas: 9, ...base, custo: null }, // modelo sem preço
  ]
  const candidatos = [
    { modelo: "grande", precos: { entrada: 1, cache: 0.1, saida: 10 } },
    { modelo: "mini", precos: { entrada: 0.25, cache: 0.025, saida: 2 } },
    { modelo: "nano", precos: { entrada: 0.05, cache: 0.005, saida: 0.4 } },
  ]
  const s = sugerirTrocasDeModelo(usos, () => "grande", candidatos)
  expect(s).toHaveLength(1)
  expect(s[0]).toMatchObject({ processo: "compras.descricao", modeloAtual: "grande", sugerido: "nano" })
  expect(s[0].economia).toBeCloseTo(1.82 - 0.081, 6)
  // Já no mais barato: nada a sugerir.
  const noNano = usos.map((u) => (u.processo === "compras.descricao" ? { ...u, custo: 0.081 } : u))
  expect(sugerirTrocasDeModelo(noNano, () => "nano", candidatos)).toHaveLength(0)
  // Sem candidatos, mas há processo simples gastando.
  expect(sugerirTrocasDeModelo(usos, () => "grande", [])).toHaveLength(0)
  expect(simplesComGasto(usos)).toBe(1)
})
