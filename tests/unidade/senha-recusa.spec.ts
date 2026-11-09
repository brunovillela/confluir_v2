import { expect, test } from "playwright/test"

import { mensagemSenhaRecusada } from "@/lib/senha-recusa"

// 09/11/2026: "Não foi possível salvar a senha" escondia o motivo da recusa.
test.describe("senha nova recusada", () => {
  test("mesma senha", () => {
    expect(mensagemSenhaRecusada({ code: "same_password" })).toMatch(/diferente da anterior/)
    expect(
      mensagemSenhaRecusada({ message: "New password should be different from the old password." })
    ).toMatch(/diferente da anterior/)
  })

  test("senha fraca diz o porquê", () => {
    expect(mensagemSenhaRecusada({ code: "weak_password", reasons: ["pwned"] })).toMatch(/vazamentos/)
    expect(mensagemSenhaRecusada({ code: "weak_password", reasons: ["characters"] })).toMatch(/maiúsculas/)
    expect(mensagemSenhaRecusada({ code: "weak_password", reasons: ["length"] })).toMatch(/curta/)
    expect(mensagemSenhaRecusada({ code: "weak_password" })).toMatch(/fraca/)
  })

  test("outro erro continua genérico", () => {
    expect(mensagemSenhaRecusada({ code: "unexpected_failure" })).toMatch(/Tente novamente/)
  })
})
