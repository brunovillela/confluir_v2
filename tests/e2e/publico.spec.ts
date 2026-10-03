import { expect, test } from "playwright/test"

test.describe("páginas públicas", () => {
  test("login traz os cabeçalhos de segurança e o formulário", async ({ page }) => {
    const resposta = await page.goto("/login")
    expect(resposta?.status()).toBe(200)
    const h = resposta!.headers()
    expect(h["x-frame-options"]).toBe("DENY")
    expect(h["x-content-type-options"]).toBe("nosniff")
    expect(h["strict-transport-security"]).toContain("max-age=")
    expect(h["referrer-policy"]).toBe("strict-origin-when-cross-origin")
    await expect(page.getByRole("textbox", { name: /e-?mail|voce@/i })).toBeVisible()
    await expect(page.getByRole("button", { name: "Entrar" })).toBeVisible()
  })

  test("página inexistente responde 404 em português", async ({ page }) => {
    const resposta = await page.goto("/esta-pagina-nao-existe")
    expect(resposta?.status()).toBe(404)
    await expect(page.getByText("Página não encontrada")).toBeVisible()
  })

  test("ficha de filiação pública abre", async ({ page }) => {
    await page.goto("/filiar")
    await expect(page.getByText("Ficha de filiação").first()).toBeVisible()
  })

  test("link público de espaço abre", async ({ page }) => {
    await page.goto("/espaco/auditorio-plateia")
    await expect(page.getByText("Auditório — plateia").first()).toBeVisible()
  })

  test("oposição à contribuição abre com as duas portas", async ({ page }) => {
    await page.goto("/portal/oposicao")
    await expect(page.getByRole("button", { name: "Sou trabalhador" })).toBeVisible()
    await expect(page.getByRole("button", { name: "Sou filiado" })).toBeVisible()
  })
})
