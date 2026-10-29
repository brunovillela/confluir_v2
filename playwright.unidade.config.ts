import { defineConfig } from "playwright/test"

/**
 * Testes de UNIDADE das regras puras (padronização, casamento, utilitários):
 * sem navegador e sem servidor — rodam em segundos, inclusive antes do commit.
 *
 *   npm run test:unidade
 *
 * Os de ponta a ponta continuam em playwright.config.ts (tests/e2e).
 */
export default defineConfig({
  testDir: "./tests/unidade",
  timeout: 10_000,
  reporter: [["list"]],
})
