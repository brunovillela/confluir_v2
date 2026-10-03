import { expect, test } from "playwright/test"

import { DEMO, limparContaDeTeste, servico, tokenDeEntrada } from "./_helpers"

test.describe.serial("portal do filiado", () => {
  test.beforeAll(async () => {
    await limparContaDeTeste(DEMO.camila.email)
  })
  test.afterAll(async () => {
    await limparContaDeTeste(DEMO.camila.email)
    await servico().from("lgpd_solicitacoes").delete().eq("emp_proprietaria_id", DEMO.tenant).eq("tipo", "portabilidade")
  })

  test("filiada pede o link, entra e baixa os próprios dados", async ({ page }) => {
    // O pedido pela tela registra o vínculo pendente (e-mail do cadastro ↔ CPF).
    await page.goto("/portal")
    await page.getByPlaceholder("000.000.000-00").fill(DEMO.camila.cpf)
    await page.getByRole("button", { name: "Enviar link de acesso" }).click()
    await expect(page.getByText(/Link de acesso enviado/)).toBeVisible()

    const token = await tokenDeEntrada(DEMO.camila.email)
    await page.goto(`/auth/confirm?token_hash=${token}&type=magiclink&next=%2Fportal%2Finicio`)
    await expect(page).toHaveURL(/\/portal\/inicio/)
    await expect(page.getByText("Olá, Camila")).toBeVisible()

    await page.goto("/portal/lgpd")
    await expect(page.getByText("Seus dados", { exact: true })).toBeVisible()
    await expect(page.getByRole("link", { name: "Baixar meus dados" })).toBeVisible()
    const resposta = await page.request.get("/portal/lgpd/meus-dados")
    expect(resposta.status()).toBe(200)
    expect(resposta.headers()["content-disposition"]).toContain("attachment")
    const json = (await resposta.json()) as { titular?: { cpf?: string }; filiacoes?: unknown[] }
    expect(json.titular?.cpf).toBe(DEMO.camila.cpf)
    expect(Array.isArray(json.filiacoes)).toBe(true)
  })
})
