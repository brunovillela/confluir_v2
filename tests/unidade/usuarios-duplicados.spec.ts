import { expect, test } from "playwright/test"

import {
  escolherPrincipal,
  nomeComparavel,
  padraoDoNome,
  preferencia,
} from "../../src/lib/usuarios-duplicados-regras"

test.describe("cadastros repetidos em usuarios", () => {
  test("nome comparável ignora acento, caixa e espaços repetidos", () => {
    expect(nomeComparavel("  Marcos Frederico  Dias Brêda ")).toBe("marcos frederico dias breda")
    expect(nomeComparavel("RAFAEL BARCELOS RIBEIRO")).toBe(nomeComparavel("Rafael Barcelos Ribeiro "))
    expect(nomeComparavel(null)).toBe("")
  })

  test("padrão do ilike: primeira e última palavra, vogais e c soltos", () => {
    expect(padraoDoNome("Antônio Alves da Silva")).toBe("_nt_n__%s_lv_")
    expect(padraoDoNome("Recepção")).toBeNull()
    // Curinga digitado não vira curinga.
    expect(padraoDoNome("Ana_% Souza")).toBe("_n_%s__z_")
  })

  test("preferência: login, depois acesso, depois o mais antigo", () => {
    const antigo = { temLogin: false, temAcesso: false, criadoEm: "2026-06-05" }
    const novo = { temLogin: false, temAcesso: false, criadoEm: "2026-09-08" }
    const comAcesso = { temLogin: false, temAcesso: true, criadoEm: "2026-10-01" }
    const comLogin = { temLogin: true, temAcesso: false, criadoEm: "2026-11-01" }
    expect([novo, comAcesso, antigo, comLogin].sort(preferencia)).toEqual([comLogin, comAcesso, antigo, novo])
  })

  test("quem fica na unificação", () => {
    const pagina = { usuarioId: "a", temLogin: false }
    const outroComLogin = { usuarioId: "b", temLogin: true }
    const outroSemLogin = { usuarioId: "c", temLogin: false }
    expect(escolherPrincipal(pagina, outroComLogin)).toEqual({ principal: "b", secundario: "a" })
    expect(escolherPrincipal(pagina, outroSemLogin)).toEqual({ principal: "a", secundario: "c" })
    expect(escolherPrincipal({ usuarioId: "a", temLogin: true }, outroSemLogin)).toEqual({
      principal: "a",
      secundario: "c",
    })
    expect("erro" in escolherPrincipal({ usuarioId: "a", temLogin: true }, outroComLogin)).toBe(true)
  })
})
