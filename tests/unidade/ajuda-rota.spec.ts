import { expect, test } from "playwright/test"

import { ajudaDaRota, type EntradaAjuda } from "../../src/lib/ajuda/rota"

// Mapa pequeno, na mesma ordem que mapaAjuda() produz (mais específico primeiro).
const MAPA: EntradaAjuda[] = [
  ["/painel/filiados/:id/lgpd", "/painel/ajuda/filiados/perfil#lgpd"],
  ["/painel/filiados/receitas", "/painel/ajuda/filiados/receitas"],
  ["/painel/filiados/:id", "/painel/ajuda/filiados/perfil"],
  ["/painel/filiados", "/painel/ajuda/filiados"],
  ["/painel", "/painel/ajuda/introducao"],
]

const UUID = "3f2a9c1e-0000-4000-8000-000000000001"

test("`:id` casa com o identificador do registro", () => {
  expect(ajudaDaRota(MAPA, `/painel/filiados/${UUID}`)).toBe("/painel/ajuda/filiados/perfil")
  expect(ajudaDaRota(MAPA, `/painel/filiados/${UUID}/editar`)).toBe("/painel/ajuda/filiados/perfil")
  expect(ajudaDaRota(MAPA, `/painel/filiados/${UUID}/lgpd`)).toBe("/painel/ajuda/filiados/perfil#lgpd")
})

test("`:id` não engole nome de rota", () => {
  expect(ajudaDaRota(MAPA, "/painel/filiados/coletivas")).toBe("/painel/ajuda/filiados")
  expect(ajudaDaRota(MAPA, "/painel/filiados/receitas/123")).toBe("/painel/ajuda/filiados/receitas")
})

test("prefixo casa por segmento inteiro e a home só exata", () => {
  expect(ajudaDaRota(MAPA, "/painel/filiadosx")).toBe("/painel/ajuda")
  expect(ajudaDaRota(MAPA, "/painel")).toBe("/painel/ajuda/introducao")
  expect(ajudaDaRota(MAPA, "/painel/outra")).toBe("/painel/ajuda")
})
