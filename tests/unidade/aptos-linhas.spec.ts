import { expect, test } from "playwright/test"

import { conferirLinhaApto } from "../../src/lib/aptos-linhas"

/** Conferência de uma linha da lista de aptos — CSV, IA e confirmação usam a mesma (17/11/2026). */

test("CPF válido com máscara vira só dígitos; e-mail em minúsculas", () => {
  const c = conferirLinhaApto({ cpf: "901.234.560-02", nome: " Ana  Ribeiro ", email: "Ana@Empresa.COM" }, 2)
  expect(c).toEqual({
    linha: { linha: 2, cpf: "90123456002", nome_completo: "Ana Ribeiro", matricula: null, email: "ana@empresa.com", telefone: null },
  })
})

test("CPF inválido é erro, mesmo com nome", () => {
  expect(conferirLinhaApto({ cpf: "123.456.789-00", nome: "Fábio" }, 3)).toEqual({ erro: "CPF inválido: 123.456.789-00" })
})

test("sem CPF, entra com nome ou matrícula; sem nada, é erro", () => {
  expect("linha" in conferirLinhaApto({ matricula: "04477" }, 4)).toBe(true)
  expect("linha" in conferirLinhaApto({ nome: "Gabriela" }, 5)).toBe(true)
  expect(conferirLinhaApto({ email: "x@y.com", telefone: "22999" }, 6)).toEqual({
    erro: "Linha sem CPF, nome ou matrícula — impossível identificar.",
  })
})

test("linha de exemplo da planilha modelo é pulada", () => {
  expect(conferirLinhaApto({ nome: "EXEMPLO Maria", cpf: "123" }, 7)).toEqual({ exemplo: true })
})
