// Captura os prints do manual (/painel/ajuda) a partir do TENANT DE
// DEMONSTRAÇÃO, salvando PNGs em public/ajuda/<area>/.
//
// Login SEM SENHA: gera um magic link pelo service role (admin.generateLink)
// e abre /auth/confirm — o handler cria a sessão por cookie. Nenhuma senha é
// digitada.
//
// PRÉ-REQUISITOS:
//   1. Seed do tenant demo rodado (supabase/demo-seed-*.sql) e login
//      demo@confluir.local criado no Supabase Auth.
//   2. Dev server da demo no ar na porta 3222:
//      $env:NEXT_PUBLIC_EMP_PROPRIETARIA_ID='11111111-1111-4111-8111-111111111111'; npm run dev -- -p 3222
//   3. Playwright instalado: npm i -D playwright && npx playwright install chromium
//
// USO:  node scripts/manual-prints.mjs
// Edite SHOTS abaixo para cada módulo (rota → arquivo em public/ajuda/<area>/).

import { readFileSync, mkdirSync } from "node:fs"
import { chromium } from "playwright"

const BASE = "http://localhost:3222"
const EMAIL = "demo@confluir.local"

// [rota, arquivo relativo a public/ajuda/] — edite por módulo a cada rodada.
const SHOTS = [
  // Hospedagem (seed: demo-seed-hospedagem.sql)
  ["/painel/hospedagem", "hospedagem/painel.png"],
  ["/painel/hospedagem/servicos/40030000-0000-4000-8000-000000000001", "hospedagem/reserva.png"],
  ["/painel/hospedagem/hoteis/40010000-0000-4000-8000-000000000001", "hospedagem/faturamento.png", { scrollTo: "Faturas em aberto" }],

  // Veículos (já capturado — seed: demo-seed-veiculos.sql)
  // ["/painel/veiculos", "veiculos/painel.png"],
  // ["/painel/veiculos/agendamentos", "veiculos/agendamentos.png"],
  // ["/painel/veiculos/infracoes/41000000-0000-4000-8000-000000000001", "veiculos/infracao.png"],

  // Compras (já capturado — seed: demo-seed-compras.sql)
  // ["/painel/compras", "compras/painel.png"],
  // ["/painel/compras/nova", "compras/nova.png"],
  // ["/painel/compras/contratos/c1100000-0000-4000-8000-000000000001", "compras/contrato.png"],
  // ["/painel/compras/fornecedores/f0f0f0f0-0000-4000-8000-000000000004", "compras/fornecedor.png"],

  // Representação (já capturado — seed: demo-seed-representacao.sql)
  // ["/painel/representacao", "representacao/painel.png"],
  // ["/painel/representacao/assembleias/campanhas/aa000000-0000-4000-8000-000000000001", "representacao/campanha.png"],
  // ["/painel/representacao/oposicao/ba000000-0000-4000-8000-000000000001", "representacao/oposicao-fila.png"],
  // ["/painel/representacao/empregadores/f0f0f0f0-0000-4000-8000-000000000003", "representacao/empregador.png"],

  // Financeiro (já capturado — seed: demo-seed-financeiro.sql)
  // ["/painel/financeiro", "financeiro/painel.png"],
  // ["/painel/financeiro/ordens/ee000000-0000-4000-8000-000000000001", "financeiro/ordem-detalhe.png"],
  // ["/painel/financeiro/caixas/ca100000-0000-4000-8000-000000000001", "financeiro/caixa-detalhe.png"],
  // ["/painel/financeiro/centros-custo", "financeiro/centros-custo.png"],

  // Filiados (já capturado — seed: demo-seed-filiados.sql)
  // ["/painel/filiados/lista", "filiados/lista.png"],
  // ["/painel/filiados/77777777-7777-4777-8777-000000000001", "filiados/perfil.png"],
  // ["/painel/filiados/solicitacoes/88888888-8888-4888-8888-000000000001", "filiados/solicitacao-avaliacao.png"],

  // Pessoal (já capturado — seed: demo-seed-pessoal.sql)
  // ["/painel/pessoal", "pessoal/painel-visao-geral.png"],
  // ["/painel/pessoal/funcionarios", "pessoal/funcionarios-lista.png"],
  // ["/painel/pessoal/33333333-3333-4333-8333-000000000001", "pessoal/funcionarios-ficha.png"],
  // ["/painel/pessoal/contracheques/44444444-4444-4444-8444-000000000001", "pessoal/contracheques-remessa.png"],
  // ["/painel/pessoal/ponto", "pessoal/ponto-remessas.png"],
  // ["/painel/pessoal/ferias", "pessoal/ferias-periodos.png"],
]

const env = Object.fromEntries(
  readFileSync(".env.local", "utf8")
    .split("\n")
    .filter((l) => l.includes("="))
    .map((l) => {
      const i = l.indexOf("=")
      return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, "")]
    })
)

const { createClient } = await import("@supabase/supabase-js")
const admin = createClient(
  env.NEXT_PUBLIC_SUPABASE_URL || env.SUPABASE_URL,
  env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false } }
)

const { data, error } = await admin.auth.admin.generateLink({
  type: "magiclink",
  email: EMAIL,
})
if (error) {
  console.error("generateLink falhou:", error.message)
  process.exit(1)
}
const tokenHash = data.properties.hashed_token

const browser = await chromium.launch()
const ctx = await browser.newContext({
  viewport: { width: 1440, height: 1024 },
  deviceScaleFactor: 2,
})
const page = await ctx.newPage()

await page.goto(
  `${BASE}/auth/confirm?token_hash=${tokenHash}&type=magiclink&next=/painel`,
  { waitUntil: "networkidle" }
)
if (page.url().includes("/login")) {
  console.error("Login falhou — confira o usuário no Supabase Auth e o seed.")
  process.exit(1)
}

for (const [route, file, opts] of SHOTS) {
  const dir = `public/ajuda/${file.split("/").slice(0, -1).join("/")}`
  mkdirSync(dir, { recursive: true })
  await page.goto(BASE + route, { waitUntil: "networkidle" })
  await page.waitForTimeout(700)
  // opts.scrollTo: rola até o texto (foca uma seção abaixo da dobra).
  if (opts?.scrollTo) {
    try {
      await page.getByText(opts.scrollTo, { exact: false }).first()
        .evaluate((el) => el.scrollIntoView({ block: "start", behavior: "instant" }))
      await page.waitForTimeout(400)
    } catch {
      console.log("  (scrollTo não encontrado:", opts.scrollTo + ")")
    }
  }
  await page.screenshot({ path: `public/ajuda/${file}`, fullPage: opts?.fullPage ?? false })
  console.log("salvo:", file)
}

await browser.close()
console.log("Concluído.")
