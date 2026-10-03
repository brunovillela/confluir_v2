import { expect, test } from "playwright/test"

import { DEMO, servico } from "./_helpers"

const CHAVE = `senha:${DEMO.operador.email}`

test.describe("bloqueio progressivo por conta", () => {
  test.beforeAll(async () => {
    await servico().from("login_tentativas").delete().eq("emp_proprietaria_id", DEMO.tenant).eq("chave", CHAVE)
  })
  test.afterAll(async () => {
    await servico().from("login_tentativas").delete().eq("emp_proprietaria_id", DEMO.tenant).eq("chave", CHAVE)
  })

  test("a sexta senha errada seguida é barrada por 15 minutos", async ({ page }) => {
    await page.goto("/login")
    const botao = page.getByRole("button", { name: "Entrar" })
    for (let i = 1; i <= 6; i++) {
      await page.getByRole("textbox", { name: /e-?mail|voce@/i }).fill(DEMO.operador.email)
      await page.getByLabel("Senha").fill(`senha-errada-${i}`)
      // Espera a action responder antes da próxima tentativa — senão a sexta
      // chega antes de a quinta falha ser contada.
      const resposta = page.waitForResponse((r) => r.request().method() === "POST" && r.url().includes("/login"))
      await botao.click()
      await resposta
      await expect(botao).toBeEnabled()
      if (i < 6) await expect(page.getByText("Email ou senha incorretos.")).toBeVisible()
    }
    await expect(page.getByText(/Muitas tentativas de acesso/)).toBeVisible()
  })
})
