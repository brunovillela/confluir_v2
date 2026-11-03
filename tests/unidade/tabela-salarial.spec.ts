import { expect, test } from "playwright/test"

import { nomeTabelaSalarial, planejarVigencia, type DegrauDestino, type NivelAtual } from "@/lib/tabela-salarial"

/** Tabelas salariais (lib/tabela-salarial.ts). */

const chave = { cargo_id: "c1", nivel_vertical: "428", nivel_horizontal: "A", nivel_carreira: "Júnior" }
const destino = (id: string, extra: Partial<DegrauDestino> = {}): DegrauDestino => ({ ...chave, id, salario_base: 4000, ...extra })
const nivel = (extra: Partial<NivelAtual> = {}): NivelAtual => ({
  lancamentoId: "l1",
  funcionarioId: "f1",
  funcionarioNome: "Fulano",
  desde: "2025-09-01",
  nivelAtualId: "antigo",
  atual: { ...chave, salario_base: 3000 },
  proximoId: null,
  proximo: null,
  ...extra,
})

test("nome: ano de início - ano de término", () => {
  expect(nomeTabelaSalarial("2025-09-01", "2026-08-31")).toBe("2025 - 2026")
})

test.describe("planejarVigencia", () => {
  test("acha o degrau equivalente, sem diferenciar maiúsculas e espaços", () => {
    const n = nivel({ atual: { ...chave, nivel_horizontal: " a ", salario_base: 3000 } })
    const p = planejarVigencia([n], [destino("novo")], "2026-09-01")
    expect(p.mudam[0].para.id).toBe("novo")
    expect(p.mudam[0].modo).toBe("novo")
  })
  test("outro cargo ou carreira não é equivalente", () => {
    const p = planejarVigencia([nivel()], [destino("x", { cargo_id: "c2" }), destino("y", { nivel_carreira: "Pleno" })], "2026-09-01")
    expect(p.mudam).toHaveLength(0)
    expect(p.semEquivalente).toHaveLength(1)
  })
  test("lançamento sem degrau fica sem equivalente", () => {
    expect(planejarVigencia([nivel({ atual: null })], [destino("novo")], "2026-09-01").semEquivalente).toHaveLength(1)
  })
  test("quem já está na tabela não muda", () => {
    const p = planejarVigencia([nivel({ nivelAtualId: "novo" })], [destino("novo")], "2026-09-01")
    expect(p.jaNaTabela).toBe(1)
    expect(p.mudam).toHaveLength(0)
  })
  test("lançamento da data de início ou mais recente é atualizado, não duplicado", () => {
    const degrau = [destino("novo")]
    expect(planejarVigencia([nivel({ desde: "2026-09-01" })], degrau, "2026-09-01").mudam[0].modo).toBe("atualiza")
    expect(planejarVigencia([nivel({ desde: "2026-10-15" })], degrau, "2026-09-01").mudam[0].modo).toBe("atualiza")
    expect(planejarVigencia([nivel({ desde: "2026-08-31" })], degrau, "2026-09-01").mudam[0].modo).toBe("novo")
  })
  test("próximo nível: leva ao equivalente ou avisa que não há", () => {
    const proximo = { ...chave, nivel_horizontal: "B" }
    const comB = planejarVigencia([nivel({ proximo })], [destino("novo"), destino("b", { nivel_horizontal: "B" })], "2026-09-01")
    expect(comB.mudam[0].proximoPara?.id).toBe("b")
    const semB = planejarVigencia([nivel({ proximo })], [destino("novo")], "2026-09-01")
    expect(semB.mudam[0].proximoPara).toBeNull()
    expect(semB.mudam[0].proximoSemEquivalente).toBe(true)
  })
})
