import { defineConfig, devices } from "playwright/test"

/**
 * Smoke E2E (onda 1, E2). Roda contra um servidor JÁ no ar — em dev, o
 * `confluir-demo-sandbox` (tenant demo, e-mail em sandbox) na porta 3222:
 *
 *   npm run test:e2e
 *
 * As entradas são por link mágico gerado com a service role (tests/e2e/_helpers.ts),
 * porque o captcha do Supabase barra login por senha em navegador automatizado.
 * `workers: 1` porque os testes compartilham o tenant demo.
 */
export default defineConfig({
  testDir: "./tests/e2e",
  timeout: 90_000,
  expect: { timeout: 15_000 },
  workers: 1,
  retries: 0,
  reporter: [["list"]],
  use: {
    baseURL: process.env.E2E_BASE_URL ?? "http://localhost:3222",
    trace: "retain-on-failure",
    locale: "pt-BR",
    ...devices["Desktop Chrome"],
  },
})
