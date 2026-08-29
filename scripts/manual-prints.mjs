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
  // Patrimônio (seed: scripts/seed-patrimonio-demo.mjs).
  ["/painel/patrimonio", "patrimonio/painel.png"],
  ["/painel/patrimonio/itens", "patrimonio/itens.png"],
  ["/painel/patrimonio/recintos", "patrimonio/recintos.png"],
  ["/painel/patrimonio/notas", "patrimonio/notas.png"],

  // Perfis de acesso / RBAC (já capturado — seed: demo-seed-perfis.sql).
  // ["/painel/institucional/usuarios/perfis", "institucional/perfis.png"],
  // ["/painel/institucional/usuarios/perfis/a0510000-0000-4000-8000-000000000001", "institucional/perfil-detalhe.png", { fullPage: true }],

  // Custeio Institucional (já capturado — seed: demo-seed-custeio.sql).
  // ["/painel/institucional/custeios", "institucional/custeios.png"],
  // ["/painel/institucional/custeios/c0570000-0000-4000-8000-000000000001", "institucional/custeio-detalhe.png", { fullPage: true }],
  // ["/painel/institucional/custeios/finalidades", "institucional/custeio-finalidades.png"],

  // Filiados — áreas extras (já capturado — seed: demo-seed-filiados-extra.sql).
  // ["/painel/filiados/receitas", "filiados/receitas.png"],
  // ["/painel/filiados/receitas/60100000-0000-4000-8000-000000000001", "filiados/receita-remessa.png", { fullPage: true }],
  // ["/painel/filiados/prontuarios", "filiados/prontuarios.png"],
  // ["/painel/filiados/importar", "filiados/importar.png"],

  // Pessoal — áreas extras (já capturado — seed: demo-seed-pessoal-extra.sql)
  // ["/painel/pessoal/niveis", "pessoal/niveis.png"],
  // ["/painel/pessoal/anuenios", "pessoal/anuenios.png"],
  // ["/painel/pessoal/diarias", "pessoal/diarias.png"],
  // ["/painel/pessoal/atestados", "pessoal/atestados.png"],
  // ["/painel/pessoal/aso", "pessoal/aso.png"],
  // ["/painel/pessoal/treinamentos", "pessoal/treinamentos.png"],
  // ["/painel/pessoal/reembolsos", "pessoal/reembolsos.png"],
  // ["/painel/pessoal/informes", "pessoal/informes.png"],

  // Fluxos públicos (já capturado — seed: demo-seed-publicos.sql)
  // ["/filiar", "fluxos-publicos/filiar.png", { anon: true, fullPage: true }],
  // ["/ficha/a4a4a4a4-0000-4000-8000-000000000001", "fluxos-publicos/ficha.png", { anon: true, fullPage: true }],
  // ["/portal/oposicao", "fluxos-publicos/oposicao.png", { anon: true }],
  // ["/votar/ac000000-0000-4000-8000-000000000001", "fluxos-publicos/votacao.png", { anon: true }],

  // Área do hotel (já capturado — seed: demo-seed-hotel.sql)
  // ["/hotel/inicio", "hotel/inicio.png", { fullPage: true }],
  // ["/hotel/reservas/40310000-0000-4000-8000-000000000001", "hotel/reserva.png", { fullPage: true }],
  // ["/hotel/faturamento", "hotel/faturamento.png", { fullPage: true }],
  // ["/hotel/contas", "hotel/contas.png"],
  // ["/hotel/acordo", "hotel/acordo.png", { fullPage: true }],

  // Portal do associado (já capturado — seed: demo-seed-portal.sql)
  // ["/portal/inicio", "portal/inicio.png"],
  // ["/portal/cadastro", "portal/cadastro.png", { fullPage: true }],
  // ["/portal/hospedagem", "portal/hospedagem.png", { fullPage: true }],
  // ["/portal/saude", "portal/saude.png"],
  // ["/portal/noticias", "portal/noticias.png"],
  // ["/portal/agenda", "portal/agenda.png"],
  // ["/portal/oposicao", "portal/oposicao.png"],
  // ["/portal/lgpd", "portal/lgpd.png", { fullPage: true }],

  // Introdução — alternador de interfaces (já capturado)
  // ["/painel", "introducao/alternador.png", { openMenu: true }],

  // Saúde (seed: demo-seed-saude.sql) — já capturado
  // ["/painel/saude", "saude/painel.png"],
  // ["/painel/saude/cat", "saude/cat.png"],
  // ["/painel/saude/cipa/ad800000-0000-4000-8000-000000000001", "saude/cipa.png", { fullPage: true }],
  // ["/painel/saude/atendimentos/ad400000-0000-4000-8000-000000000001", "saude/atendimentos.png", { fullPage: true }],

  // Comunicação (já capturado — seed: demo-seed-comunicacao.sql)
  // ["/painel/comunicacao", "noticias/painel.png"],
  // ["/painel/comunicacao/noticias", "noticias/noticias.png"],
  // ["/painel/comunicacao/resumo", "noticias/resumo-ia.png"],

  // Jurídico (já capturado — seed: demo-seed-juridico.sql)
  // ["/painel/juridico", "juridico/painel.png"],
  // ["/painel/juridico/homologacoes", "juridico/homologacoes.png"],
  // ["/painel/juridico/processos/a8200000-0000-4000-8000-000000000001", "juridico/processos.png"],
  // ["/painel/juridico/reembolsos", "juridico/reembolsos.png"],

  // Institucional (já capturado — seed: demo-seed-institucional.sql)
  // ["/painel/institucional", "institucional/painel.png"],
  // ["/painel/institucional/diretoria/fe600000-0000-4000-8000-000000000001", "institucional/diretoria.png", { fullPage: true }],
  // ["/painel/institucional/usuarios/44d991c1-a5b7-431f-9957-b061ee0a9449", "institucional/usuarios.png"],
  // ["/painel/institucional/ajudas", "institucional/ajudas.png"],

  // Ferramentas (já capturado — seed: demo-seed-ferramentas.sql)
  // ["/painel/ferramentas", "ferramentas/painel.png"],
  // ["/painel/ferramentas/demandas", "ferramentas/projetos.png"],
  // ["/painel/ferramentas/documentos", "ferramentas/documentos.png"],
  // ["/painel/ferramentas/oficios/fe800000-0000-4000-8000-000000000001", "ferramentas/oficios.png"],

  // Hospedagem (já capturado — seed: demo-seed-hospedagem.sql)
  // ["/painel/hospedagem", "hospedagem/painel.png"],
  // ["/painel/hospedagem/servicos/40030000-0000-4000-8000-000000000001", "hospedagem/reserva.png"],
  // ["/painel/hospedagem/hoteis/40010000-0000-4000-8000-000000000001", "hospedagem/faturamento.png", { scrollTo: "Faturas em aberto" }],

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

// Contexto SEM sessão (cookies próprios), para telas públicas anônimas.
let pageAnon = null
async function anonPage() {
  if (!pageAnon) {
    const ctxAnon = await browser.newContext({
      viewport: { width: 1440, height: 1024 },
      deviceScaleFactor: 2,
    })
    pageAnon = await ctxAnon.newPage()
  }
  return pageAnon
}

for (const [route, file, opts] of SHOTS) {
  const dir = `public/ajuda/${file.split("/").slice(0, -1).join("/")}`
  mkdirSync(dir, { recursive: true })
  const p = opts?.anon ? await anonPage() : page
  // `load` + buffer é mais robusto que networkidle (páginas SSR pesadas ou
  // compilação a frio no dev podem não atingir networkidle em 30s).
  await p.goto(BASE + route, { waitUntil: "load", timeout: 60000 })
  await p.waitForTimeout(1200)
  // opts.openMenu: abre o dropdown do rodapé (nome do usuário) para o print
  // do alternador de interfaces.
  if (opts?.openMenu) {
    await p.getByText(EMAIL).first().click()
    await p.getByRole("menuitem", { name: "Meu perfil" }).waitFor({ timeout: 4000 })
    await p.waitForTimeout(300)
  }
  // opts.scrollTo: rola até o texto (foca uma seção abaixo da dobra).
  if (opts?.scrollTo) {
    try {
      await p.getByText(opts.scrollTo, { exact: false }).first()
        .evaluate((el) => el.scrollIntoView({ block: "start", behavior: "instant" }))
      await p.waitForTimeout(400)
    } catch {
      console.log("  (scrollTo não encontrado:", opts.scrollTo + ")")
    }
  }
  await p.screenshot({ path: `public/ajuda/${file}`, fullPage: opts?.fullPage ?? false })
  console.log("salvo:", file)
}

await browser.close()
console.log("Concluído.")
