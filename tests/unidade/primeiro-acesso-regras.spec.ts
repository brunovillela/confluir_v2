import { expect, test } from "playwright/test"

import {
  faltaNoPrimeiroAcesso,
  livreDoPrimeiroAcesso,
  type EditaveisDoCadastro,
} from "@/app/portal/primeiro-acesso/regras"

const TUDO: EditaveisDoCadastro = { emailPessoal: true, emailCorporativo: true, telefones: true, endereco: true }
const ENDERECO = {
  endereco_cep: "24000-000",
  endereco_logradouro: "Av. das Amendoeiras",
  endereco_numero: "58",
  endereco_bairro: "Centro",
  endereco_cidade: "Niterói",
  endereco_estado: "RJ",
}

test.describe("primeiro acesso: dado preenchido precisa ser utilizável", () => {
  test("telefone sem DDD conta como faltando; com DDD, não", () => {
    expect(faltaNoPrimeiroAcesso("telefone", { telefone_1: "27374700" }, TUDO)).toBe(true)
    expect(faltaNoPrimeiroAcesso("telefone", { telefone_1: "(21) 99900-0002" }, TUDO)).toBe(false)
    expect(faltaNoPrimeiroAcesso("telefone", {}, TUDO)).toBe(true)
  })

  test("telefone 2 inválido e editável falta mesmo com o 1 bom (Meu cadastro não salvaria)", () => {
    const v = { telefone_1: "(21) 99900-0002", telefone_2: "2737" }
    expect(faltaNoPrimeiroAcesso("telefone", v, TUDO)).toBe(true)
    // Travado pela entidade: a pessoa não teria como corrigir — não conta contra.
    expect(faltaNoPrimeiroAcesso("telefone", v, { ...TUDO, telefones: false })).toBe(false)
  })

  test("e-mail: precisa de um endereço válido; inválido editável também falta", () => {
    expect(faltaNoPrimeiroAcesso("email", { email_pessoal: "nao tem" }, TUDO)).toBe(true)
    expect(faltaNoPrimeiroAcesso("email", { email_pessoal: "ana@exemplo.com" }, TUDO)).toBe(false)
    expect(faltaNoPrimeiroAcesso("email", { email_corporativo: "ana@empresa.com.br" }, TUDO)).toBe(false)
    expect(
      faltaNoPrimeiroAcesso("email", { email_pessoal: "ana@exemplo.com", email_corporativo: "errado" }, TUDO)
    ).toBe(true)
    // Corporativo inválido mas travado: o pessoal válido basta.
    expect(
      faltaNoPrimeiroAcesso(
        "email",
        { email_pessoal: "ana@exemplo.com", email_corporativo: "errado" },
        { ...TUDO, emailCorporativo: false }
      )
    ).toBe(false)
    // Só o travado preenchido, e inválido: falta (dá para preencher o pessoal).
    expect(
      faltaNoPrimeiroAcesso("email", { email_corporativo: "errado" }, { ...TUDO, emailCorporativo: false })
    ).toBe(true)
  })

  test("endereço: campo em branco ou CEP incompleto falta; o complemento não conta", () => {
    expect(faltaNoPrimeiroAcesso("endereco", ENDERECO, TUDO)).toBe(false)
    expect(faltaNoPrimeiroAcesso("endereco", { ...ENDERECO, endereco_numero: "" }, TUDO)).toBe(true)
    expect(faltaNoPrimeiroAcesso("endereco", { ...ENDERECO, endereco_cep: "2400" }, TUDO)).toBe(true)
  })
})

test.describe("primeiro acesso: o que abre antes dele", () => {
  test("direitos com prazo, canais e os passos abrem", () => {
    for (const rota of [
      "/portal/primeiro-acesso",
      "/portal/cadastro",
      "/portal/lgpd",
      "/portal/desfiliacao",
      "/portal/oposicao",
      "/portal/votacao",
      "/portal/votacao/rodada/abc",
      "/portal/sindicato",
      "/portal/ajuda/visao-geral",
      "/portal/avisos/preferencias",
    ]) {
      expect(livreDoPrimeiroAcesso(rota), rota).toBe(true)
    }
  })

  test("Hospedagem e Eventos abrem (só para cancelar — a recusa de pedir é no servidor)", () => {
    expect(livreDoPrimeiroAcesso("/portal/hospedagem")).toBe(true)
    expect(livreDoPrimeiroAcesso("/portal/hospedagem/reserva/123")).toBe(true)
    expect(livreDoPrimeiroAcesso("/portal/eventos#evento-1")).toBe(true)
  })

  test("o resto espera; prefixo parecido não vaza", () => {
    for (const rota of ["/portal/inicio", "/portal/carteirinha", "/portal/contribuicao", "/portal/atendimento", "/portal/eventosX", "/portal/cadastroX"]) {
      expect(livreDoPrimeiroAcesso(rota), rota).toBe(false)
    }
  })

  test("Atendimento só com a marca da desfiliação", () => {
    expect(livreDoPrimeiroAcesso("/portal/atendimento?motivo=desfiliacao")).toBe(true)
    expect(livreDoPrimeiroAcesso("/portal/atendimento/abc?motivo=desfiliacao")).toBe(true)
    expect(livreDoPrimeiroAcesso("/portal/atendimento/novo/x?motivo=desfiliacao")).toBe(false)
    expect(livreDoPrimeiroAcesso("/portal/carteirinha?motivo=desfiliacao")).toBe(false)
  })
})
