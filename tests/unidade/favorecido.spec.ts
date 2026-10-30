import { expect, test } from "playwright/test"

import { escolherFavorecido, nomeDaEmpresa, type FontesFavorecido } from "@/lib/favorecido"

const fontes = (): FontesFavorecido => ({
  empresas: new Map([
    ["emp-1", { nome: "Gráfica Modelo", documento: "11222333000181" }],
    ["emp-sem-nome", { nome: null, documento: "11222333000181" }],
  ]),
  usuarios: new Map([["usu-1", { nome: "Mariana Souza", documento: "01000000028" }]]),
  filiados: new Map([["ordem-reembolso", { id: "fil-1", nome: "Antônio Nunes", documento: null }]]),
})

test.describe("escolherFavorecido", () => {
  test("fornecedor beneficiário vem antes de tudo", () => {
    const f = escolherFavorecido({ id: "o", beneficiario_fornecedor_id: "emp-1", beneficiario_usuario_id: "usu-1" }, fontes())
    expect(f).toEqual({ tipo: "fornecedor", id: "emp-1", nome: "Gráfica Modelo", documento: "11222333000181" })
  })

  test("sem beneficiário, usa o fornecedor da ordem", () => {
    expect(escolherFavorecido({ id: "o", fornecedor_id: "emp-1" }, fontes())?.id).toBe("emp-1")
  })

  test("empresa sem nome cai para o próximo candidato", () => {
    const f = escolherFavorecido({ id: "o", beneficiario_fornecedor_id: "emp-sem-nome", beneficiario_usuario_id: "usu-1" }, fontes())
    expect(f?.tipo).toBe("usuario")
  })

  test("pessoa do quadro", () => {
    expect(escolherFavorecido({ id: "o", beneficiario_usuario_id: "usu-1" }, fontes())).toEqual({
      tipo: "usuario",
      id: "usu-1",
      nome: "Mariana Souza",
      documento: "01000000028",
    })
  })

  test("filiado do reembolso, com o CPF do avulso quando a ficha não tem", () => {
    const f = escolherFavorecido({ id: "ordem-reembolso", beneficiario_nome_avulso: "Antonio N.", beneficiario_doc_avulso: "01000000028" }, fontes())
    expect(f).toEqual({ tipo: "filiado", id: "fil-1", nome: "Antônio Nunes", documento: "01000000028" })
  })

  test("avulso quando não há cadastro", () => {
    const f = escolherFavorecido({ id: "o", beneficiario_nome_avulso: " Convidado ", beneficiario_doc_avulso: "01000000028" }, fontes())
    expect(f).toEqual({ tipo: "avulso", id: null, nome: "Convidado", documento: "01000000028" })
  })

  test("id de cadastro que não carregou (null legado) não quebra", () => {
    expect(escolherFavorecido({ id: "o", beneficiario_fornecedor_id: null, beneficiario_usuario_id: "usu-inexistente" }, fontes())).toBeNull()
  })

  test("ordem sem favorecido", () => {
    expect(escolherFavorecido({ id: "o" }, fontes())).toBeNull()
  })
})

test("nomeDaEmpresa prefere o nome do cadastro, depois fantasia e razão", () => {
  expect(nomeDaEmpresa({ empresa: "", nome_fantasia: "Fantasia", nome_razao: "Razão" })).toBe("Fantasia")
  expect(nomeDaEmpresa({ nome_razao: "Razão" })).toBe("Razão")
  expect(nomeDaEmpresa({})).toBeNull()
})
