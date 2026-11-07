import { expect, test } from "playwright/test"

import {
  dataValida,
  diasDesde,
  emailValido,
  faltaNoPasso,
  linkWhatsapp,
  mesmoNascimento,
  primeiroPassoIncompleto,
  type DadosFicha,
} from "@/lib/ficha-filiacao"

/** Ficha de filiação online (lib/ficha-filiacao.ts). */

const completa: DadosFicha = {
  nome_completo: "Ana Lima",
  nascimento: "1986-11-04",
  sexo: "Prefiro não informar",
  telefone_1: "(22) 99888-7766",
  endereco_cep: "27910-000",
  endereco_logradouro: "Rua A",
  endereco_numero: "s/n",
  endereco_bairro: "Centro",
  endereco_cidade: "Macaé",
  endereco_estado: "rj",
  empregador_id: "f",
  matricula: "1234",
}

test.describe("o que cada passo exige", () => {
  test("ficha completa passa nos três passos", () => {
    expect(primeiroPassoIncompleto(completa)).toBeNull()
  })
  test("nome precisa de nome e sobrenome", () => {
    expect(faltaNoPasso(1, { ...completa, nome_completo: "Ana" })?.campo).toBe("nome_completo")
  })
  test("\"Prefiro não informar\" conta como resposta do sexo; vazio não", () => {
    expect(faltaNoPasso(1, completa)).toBeNull()
    expect(faltaNoPasso(1, { ...completa, sexo: "" })?.campo).toBe("sexo")
  })
  test("telefone com DDD, CEP com 8 dígitos, UF com 2 letras", () => {
    expect(faltaNoPasso(2, { ...completa, telefone_1: "99888-7766" })?.campo).toBe("telefone_1")
    expect(faltaNoPasso(2, { ...completa, endereco_cep: "2791" })?.campo).toBe("endereco_cep")
    expect(faltaNoPasso(2, { ...completa, endereco_estado: "R" })?.campo).toBe("endereco_estado")
  })
  test("empresa e matrícula são obrigatórias; cargo e lotação não", () => {
    expect(faltaNoPasso(3, { ...completa, matricula: " " })?.campo).toBe("matricula")
    expect(faltaNoPasso(3, { ...completa, cargo: null, lotacao: null })).toBeNull()
  })
  test("o primeiro passo com falta é o que a tela reabre", () => {
    expect(primeiroPassoIncompleto({ ...completa, endereco_bairro: null })).toBe(2)
  })
})

test.describe("conferências do começo", () => {
  test("nascimento: só o dia importa", () => {
    expect(mesmoNascimento("1986-11-04", "1986-11-04T00:00:00")).toBe(true)
    expect(mesmoNascimento("1986-11-04", "1986-04-11")).toBe(false)
    expect(mesmoNascimento("1986-11-04", null)).toBe(false)
  })
  test("data de verdade, de 1900 até hoje", () => {
    expect(dataValida("1986-11-04")).toBe(true)
    expect(dataValida("1986-02-30")).toBe(false)
    expect(dataValida("1850-01-01")).toBe(false)
    expect(dataValida("2999-01-01")).toBe(false)
  })
  test("e-mail precisa de @ e de final", () => {
    expect(emailValido("ana@exemplo.com")).toBe(true)
    expect(emailValido("ana@exemplo")).toBe(false)
    expect(emailValido("ana exemplo.com")).toBe(false)
  })
})

test.describe("avisos para a gestão", () => {
  test("dias parada", () => {
    const agora = Date.parse("2026-11-07T12:00:00Z")
    expect(diasDesde("2026-11-04T11:00:00Z", agora)).toBe(3)
    expect(diasDesde(null, agora)).toBe(0)
  })
  test("link do WhatsApp só com DDD", () => {
    expect(linkWhatsapp("(22) 99888-7766")).toBe("https://wa.me/5522998887766")
    expect(linkWhatsapp("99888-7766")).toBeNull()
  })
})
