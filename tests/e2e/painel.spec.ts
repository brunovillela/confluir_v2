import { expect, test } from "playwright/test"

import { DEMO, entrarPorLink, removerFatores2FA, totpSeguro } from "./_helpers"

test.describe.serial("painel", () => {
  test.afterAll(async () => {
    await removerFatores2FA(DEMO.operador.authId)
  })

  test("entra por link mágico e abre o painel e a auditoria", async ({ page }) => {
    await entrarPorLink(page, DEMO.operador.email, "/painel")
    await expect(page).toHaveURL(/\/painel$/)
    await expect(page.getByText("Consulta de filiação")).toBeVisible()

    await page.goto("/painel/institucional/auditoria")
    await expect(page.getByRole("heading", { name: "Auditoria" })).toBeVisible()
  })

  test("2FA: cadastra o autenticador, exige o código na sessão nova e aceita o código certo", async ({ browser }) => {
    await removerFatores2FA(DEMO.operador.authId)

    // Cadastro
    const ctx1 = await browser.newContext()
    const page = await ctx1.newPage()
    await entrarPorLink(page, DEMO.operador.email, "/conta/seguranca")
    await page.getByRole("button", { name: "Ativar com aplicativo autenticador" }).click()
    const segredo = (await page.locator("p.font-mono").first().textContent())?.trim() ?? ""
    expect(segredo.length).toBeGreaterThan(16)
    await page.getByLabel("Código do aplicativo").fill(await totpSeguro(segredo))
    await page.getByRole("button", { name: "Confirmar e ativar" }).click()
    await expect(page.getByText("Verificação em duas etapas ativa", { exact: true })).toBeVisible()
    await ctx1.close()

    // Sessão nova: barrada antes do painel
    const ctx2 = await browser.newContext()
    const page2 = await ctx2.newPage()
    await entrarPorLink(page2, DEMO.operador.email, "/painel")
    await expect(page2).toHaveURL(/\/login\/verificacao/)
    await page2.getByLabel("Código").fill("000000")
    await page2.getByRole("button", { name: "Confirmar" }).click()
    await expect(page2.getByText(/Código inválido/)).toBeVisible()
    await page2.getByLabel("Código").fill(await totpSeguro(segredo))
    await page2.getByRole("button", { name: "Confirmar" }).click()
    await expect(page2).toHaveURL(/\/painel$/)
    await ctx2.close()
  })
})
