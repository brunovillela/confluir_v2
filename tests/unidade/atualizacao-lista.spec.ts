import { expect, test } from "playwright/test"

import {
  exibirValor,
  mesmoValor,
  nomeProprio,
  normalizarData,
  normalizarTelefone,
  padronizarLinha,
} from "@/lib/atualizacao-lista"

/** Padronização da lista de trabalhadores (lib/atualizacao-lista.ts). */

test.describe("normalizarData", () => {
  test("aceita ISO, DD/MM/AAAA e DD/MM/AA", () => {
    expect(normalizarData("2012-03-15")).toBe("2012-03-15")
    expect(normalizarData("15/03/2012")).toBe("2012-03-15")
    expect(normalizarData("5/3/2012")).toBe("2012-03-05")
    expect(normalizarData("15.03.2012")).toBe("2012-03-15")
    expect(normalizarData("2012-03-15T00:00:00")).toBe("2012-03-15")
  })
  test("ano de dois dígitos: futuro vira 19xx, passado vira 20xx", () => {
    expect(normalizarData("04/11/86")).toBe("1986-11-04")
    expect(normalizarData("01/02/20")).toBe("2020-02-01")
  })
  test("recusa data impossível, fora do intervalo ou vazia", () => {
    expect(normalizarData("31/02/2020")).toBeNull()
    expect(normalizarData("01/13/2020")).toBeNull()
    expect(normalizarData("01/01/1850")).toBeNull()
    expect(normalizarData("")).toBeNull()
    expect(normalizarData("ontem")).toBeNull()
  })
})

test.describe("normalizarTelefone", () => {
  test("só dígitos, com DDD", () => {
    expect(normalizarTelefone("(21) 98877-6655")).toBe("21988776655")
    expect(normalizarTelefone("21 2610-0005")).toBe("2126100005")
  })
  test("tira o 55 do país e o zero do DDD", () => {
    expect(normalizarTelefone("+55 21 98877-6655")).toBe("21988776655")
    expect(normalizarTelefone("021988776655")).toBe("21988776655")
    expect(normalizarTelefone("0 21 2610-0005")).toBe("2126100005")
  })
  test("recusa número sem DDD ou grande demais", () => {
    expect(normalizarTelefone("98877-6655")).toBeNull()
    expect(normalizarTelefone("219887766551234")).toBeNull()
    expect(normalizarTelefone("")).toBeNull()
  })
})

test.describe("nomeProprio", () => {
  test("caixa alta vira nome próprio, com as partículas em minúsculas", () => {
    expect(nomeProprio("MARIA DAS DORES DE SOUZA E SILVA")).toBe("Maria das Dores de Souza e Silva")
    expect(nomeProprio("  JOSÉ   CARLOS  ")).toBe("José Carlos")
  })
  test("caixa mista fica como está", () => {
    expect(nomeProprio("Maria das Dores")).toBe("Maria das Dores")
    expect(nomeProprio("João McDonald")).toBe("João McDonald")
  })
})

test.describe("padronizarLinha", () => {
  test("linha completa vira campos de cadastro e de vínculo", () => {
    const l = padronizarLinha(
      {
        nome: "MARINA COUTO FERREIRA",
        cpf: "529.982.247-25",
        matricula: " 40512 ",
        nascimento: "04/11/1986",
        sexo: "F",
        email: "Marina@Exemplo.COM",
        telefone_1: "(21) 98877-6655",
        telefone_2: "21 98877-6655",
        cep: "24000-000",
        uf: "rj",
        cidade: "NITERÓI",
        cargo: "TÉCNICA DE OPERAÇÃO",
        lotacao: "UN-REDUC",
        admissao: "15/03/2012",
        regime: "TURNO",
        condicao: "ativo",
      },
      1
    )
    expect(l).not.toBeNull()
    expect(l!.cpf).toBe("52998224725")
    expect(l!.matricula).toBe("40512")
    expect(l!.cadastro).toMatchObject({
      nome_completo: "Marina Couto Ferreira",
      nascimento_data: "1986-11-04",
      sexo: "Feminino",
      email_pessoal: "marina@exemplo.com",
      telefone_1: "21988776655",
      endereco_cep: "24000000",
      endereco_estado: "RJ",
      endereco_cidade: "Niterói",
    })
    // O mesmo número nos dois telefones não vira dois.
    expect(l!.cadastro.telefone_2).toBeUndefined()
    expect(l!.vinculo).toMatchObject({
      cargo: "Técnica de Operação",
      lotacao: "UN-REDUC",
      data_entrada_admissao: "2012-03-15",
      regime_trabalho: "Ininterrupto de revezamento",
      condicao_na_fonte: "Trabalhador(a) da ativa",
    })
    expect(l!.invalidos).toEqual([])
  })

  test("valor fora do padrão é ignorado e contado; o resto da linha segue", () => {
    const l = padronizarLinha({ nome: "JOÃO TESTE", cpf: "123.456.789-00", admissao: "31/02/2020", uf: "XX" }, 8)
    expect(l).not.toBeNull()
    expect(l!.cpf).toBeNull()
    expect(l!.vinculo.data_entrada_admissao).toBeUndefined()
    expect(l!.invalidos).toEqual(expect.arrayContaining(["CPF", "Admissão na fonte", "UF"]))
  })

  test("regime e condição na fonte encaixam nas listas do sistema", () => {
    const regime = (r: string) => padronizarLinha({ nome: "ANA LIMA", regime: r }, 1)!.vinculo.regime_trabalho
    expect(regime("ADM")).toBe("Administrativo")
    expect(regime("Embarcado")).toBe("Ininterrupto de revezamento offshore")
    expect(regime("IRT")).toBe("Ininterrupto de revezamento")
    expect(regime("misto")).toBe("Misto")
    const condicao = (c: string) => padronizarLinha({ nome: "ANA LIMA", condicao: c }, 1)!.vinculo.condicao_na_fonte
    expect(condicao("Aposentado")).toBe("Beneficiário(a) aposentado(a)")
    expect(condicao("pensionista")).toBe("Beneficiário(a) pensionista")
  })

  test("CPF sem zeros à esquerda é completado", () => {
    expect(padronizarLinha({ cpf: "1000000028" }, 1)?.cpf).toBe("01000000028")
  })

  test("sem CPF válido, matrícula ou nome não há como achar a pessoa", () => {
    expect(padronizarLinha({ cpf: "111", cargo: "ASSISTENTE" }, 1)).toBeNull()
    expect(padronizarLinha({ nome: "AB" }, 1)).toBeNull()
  })
})

test.describe("mesmoValor", () => {
  test("ignora acento, caixa e espaços", () => {
    expect(mesmoValor("cargo", "Técnica de Operação", "TECNICA  DE OPERACAO")).toBe(true)
    expect(mesmoValor("cargo", "Operador", "Operadora")).toBe(false)
  })
  test("compara datas pelo dia, telefone e CEP pelos dígitos", () => {
    expect(mesmoValor("data_entrada_admissao", "2012-03-15", "2012-03-15T00:00:00")).toBe(true)
    expect(mesmoValor("telefone_1", "(21) 99900-0006", "21999000006")).toBe(true)
    expect(mesmoValor("endereco_cep", "24000-000", "24000000")).toBe(true)
  })
  test("matrícula ignora zeros à esquerda e pontuação", () => {
    expect(mesmoValor("matricula", "003002", "3002")).toBe(true)
    expect(mesmoValor("fonte_pg_matricula", "12.345-6", "123456")).toBe(true)
  })
  test("vazio só é igual a vazio", () => {
    expect(mesmoValor("cargo", null, "")).toBe(true)
    expect(mesmoValor("cargo", null, "Operador")).toBe(false)
  })
})

test("exibirValor formata data, telefone e CEP", () => {
  expect(exibirValor("data_saida_demissao", "2026-09-30")).toBe("30/09/2026")
  expect(exibirValor("telefone_2", "21976543210")).toBe("(21) 97654-3210")
  expect(exibirValor("telefone_1", "2126100005")).toBe("(21) 2610-0005")
  expect(exibirValor("endereco_cep", "24000000")).toBe("24000-000")
  expect(exibirValor("cargo", null)).toBe("—")
})
