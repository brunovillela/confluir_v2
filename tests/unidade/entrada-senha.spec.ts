import { expect, test } from "playwright/test"

import { ERRO_HUMANO, mensagemDaRecusa } from "@/lib/entrada-senha-recusa"

// 06/11/2026: a tela dizia "senha incorreta" para qualquer recusa do Supabase.
const erro = (code: string, status = 400, message = "x") => ({ code, status, message })

test.describe("recusa na entrada por senha", () => {
  test("senha errada continua sendo senha errada (null)", () => {
    expect(mensagemDaRecusa(erro("invalid_credentials"))).toBeNull()
    expect(mensagemDaRecusa(erro("", 400, "Invalid login credentials"))).toBeNull()
    expect(mensagemDaRecusa(erro("user_banned"))).toBeNull()
  })

  test("captcha gasto não vira senha errada", () => {
    expect(mensagemDaRecusa(erro("captcha_failed"))).toBe(ERRO_HUMANO)
  })

  test("limite, rede e conta não ativada têm mensagem própria", () => {
    expect(mensagemDaRecusa(erro("over_request_rate_limit", 429))).toMatch(/Aguarde um minuto/)
    expect(mensagemDaRecusa(erro("unexpected_failure", 500))).toMatch(/falha de comunicação/)
    expect(mensagemDaRecusa(erro("email_not_confirmed"))).toMatch(/ainda não foi ativada/)
  })
})
