import { expect, test } from "playwright/test"

import { codigoDeEntrada, limparContaDeTeste } from "./_helpers"

const EMAIL = "teste-e2e-oposicao@confluir.local"
const CPF = "11144477735" // válido e não filiado no demo

test.describe("oposição à contribuição — trabalhador não filiado", () => {
  test.beforeAll(async () => {
    await limparContaDeTeste(EMAIL, CPF)
  })
  test.afterAll(async () => {
    await limparContaDeTeste(EMAIL, CPF)
  })

  test("pede o código, confirma e entra como não filiado", async ({ page }) => {
    // As duas abas ficam montadas (a inativa só escondida, A180): "CPF" exato,
    // senão casa também com o "CPF do filiado" da outra aba.
    await page.goto("/portal/oposicao")
    await page.getByLabel("Nome completo").fill("Teste E2E Oposição")
    await page.getByLabel("CPF", { exact: true }).fill(CPF)
    await page.getByLabel("E-mail").fill(EMAIL)
    await page.getByRole("button", { name: "Enviar código" }).click()
    await expect(page.getByText(/Código enviado para/)).toBeVisible()

    // O campo do código tem rótulo e não tem mais placeholder (A168).
    await page.getByLabel("Código recebido por e-mail").fill(await codigoDeEntrada(EMAIL))
    await page.getByRole("button", { name: "Entrar" }).click()
    await expect(page.getByText("Não filiado")).toBeVisible()
    await expect(page.getByText("Teste E2E Oposição")).toBeVisible()
  })
})
