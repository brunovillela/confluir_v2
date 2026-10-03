import { expect, test } from "playwright/test"

import { DEMO, entrarPorLink } from "./_helpers"

test.describe("conferência de arquivos enviados", () => {
  test("HTML renomeado para .png é recusado na notícia", async ({ page }) => {
    await entrarPorLink(page, DEMO.operador.email, "/painel/comunicacao/noticias")
    // O formulário de criação fica num <details> recolhido.
    await page.locator("details", { hasText: "Nova notícia" }).first().evaluate((d) => {
      ;(d as HTMLDetailsElement).open = true
    })
    await expect(page.getByLabel(/Manchete/)).toBeVisible()
    await page.getByLabel(/Manchete/).fill("TESTE E2E UPLOAD — não deve ser criada")
    await page.locator('input[name="imagem"]').setInputFiles({
      name: "foto.png",
      mimeType: "image/png",
      buffer: Buffer.from('<!DOCTYPE html><html><body><script>alert("xss")</script></body></html>'),
    })
    await page.getByRole("button", { name: "Publicar notícia" }).click()
    await expect(page.getByText(/Tipo de arquivo não aceito/)).toBeVisible()
  })
})
