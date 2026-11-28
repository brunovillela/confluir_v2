import { expect, test } from "playwright/test"

import { mensagemDosEnvios } from "../../src/lib/oposicao-envio-codigo"

const m = (e: string) => e.replace(/^(..).*@/, "$1***@")

test("diz só os e-mails que receberam e por que o outro não", () => {
  const r = mensagemDosEnvios(
    ["joao@gmail.com"],
    [{ email: "joao@petrobras.com.br", erro: "Acabamos de enviar um código para este e-mail. Aguarde um minuto antes de pedir outro." }],
    m
  )
  expect(r.erro).toBeUndefined()
  expect(r.ok).toContain("o código foi para o e-mail do seu cadastro, jo***@gmail.com.")
  expect(r.ok).toContain("Não foi para jo***@petrobras.com.br (acabou de receber um; aguarde um minuto).")
})

test("nenhum enviado: erro, com o tempo de espera quando é a cadência", () => {
  const r = mensagemDosEnvios(
    [],
    [{ email: "ana@x.com", erro: "Muitos códigos pedidos para este e-mail em pouco tempo. Aguarde uma hora e tente de novo." }],
    m
  )
  expect(r.ok).toBeUndefined()
  expect(r.erro).toContain("Aguarde uma hora")
  const p = mensagemDosEnvios([], [{ email: "ana@x.com", erro: "Não foi possível enviar o código. Tente de novo." }], m)
  expect(p.erro).toContain("Não foi possível enviar o código agora para an***@x.com")
})

test("todos enviados: a mensagem de sempre", () => {
  expect(mensagemDosEnvios(["ana@x.com", "bia@y.com"], [], m).ok).toBe(
    "Você é filiado: o código foi para os e-mails do seu cadastro, an***@x.com, bi***@y.com. Use o código de qualquer um deles."
  )
})
