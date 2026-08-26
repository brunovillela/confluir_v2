// Prints do "Conselho Fiscal em ação" — um usuário SÓ LEITURA vendo Financeiro
// e Patrimônio sem botões de escrita, com a navegação restrita ao perfil.
//
// Provisiona um usuário de DEMONSTRAÇÃO (fiscal@confluir.local) no tenant demo,
// com APENAS o perfil "Conselho Fiscal (leitura)", e captura as telas logado
// como ele. Idempotente.
//
// POR QUE VOCÊ RODA (e não o assistente): este script CRIA uma conta de acesso
// (auth) para o usuário de demonstração — criação de conta é uma ação que o
// assistente não executa sozinho. Rodando você, a conta é criada por você.
//
// PRÉ-REQUISITOS:
//   - de dentro de confluir/ (lê .env.local);
//   - perfis-acesso.sql já rodado (o perfil "Conselho Fiscal (leitura)" existe);
//   - dev server da demo no ar na porta 3222 (NEXT_PUBLIC_EMP_PROPRIETARIA_ID=demo);
//   - playwright instalado.
//
// USO:  node scripts/prints-conselho-fiscal.mjs

import { readFileSync, mkdirSync } from "node:fs"
import { chromium } from "playwright"

const BASE = "http://localhost:3222"
const EMP = "11111111-1111-4111-8111-111111111111"
const FISCAL_EMAIL = "fiscal@confluir.local"
const FISCAL_SENHA = "ConselhoFiscal123"
const FISCAL_USUARIO_ID = "c0f15ca1-0000-4000-8000-000000000001"
const PERFIL_NOME = "Conselho Fiscal (leitura)"
const CHAVES = [
  "financeiro_leitura",
  "patrimonio_leitura",
  "aquisicoes_contratos",
  "custeio_institucional",
]

let envRaw
try {
  envRaw = readFileSync(".env.local", "utf8")
} catch {
  console.error(
    "Não achei .env.local — rode de DENTRO de confluir/:\n" +
      '  cd "C:\\Users\\nomos\\Sistemas\\Confluir 2.0\\confluir"\n' +
      "  node scripts/prints-conselho-fiscal.mjs"
  )
  process.exit(1)
}
const env = Object.fromEntries(
  envRaw
    .split("\n")
    .filter((l) => l.includes("="))
    .map((l) => {
      const i = l.indexOf("=")
      return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, "")]
    })
)

const { createClient } = await import("@supabase/supabase-js")
const svc = createClient(
  env.NEXT_PUBLIC_SUPABASE_URL || env.SUPABASE_URL,
  env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false } }
)

// 1) Perfil Conselho Fiscal + suas chaves de leitura ------------------------
const { data: perfil } = await svc
  .from("perfis")
  .select("id")
  .eq("emp_proprietaria_id", EMP)
  .eq("nome", PERFIL_NOME)
  .maybeSingle()
if (!perfil) {
  console.error(`Perfil "${PERFIL_NOME}" não existe no tenant demo. Rode perfis-acesso.sql.`)
  process.exit(1)
}
for (const chave of CHAVES) {
  const { data: ex } = await svc
    .from("perfil_permissoes")
    .select("id")
    .eq("perfil_id", perfil.id)
    .eq("chave", chave)
    .maybeSingle()
  if (!ex) {
    const { error } = await svc
      .from("perfil_permissoes")
      .insert({ perfil_id: perfil.id, chave, emp_proprietaria_id: EMP })
    if (error) {
      console.error(`Falha ao inserir a chave ${chave}:`, error.message)
      process.exit(1)
    }
  }
}

// 2) Conta de acesso (auth) do fiscal ---------------------------------------
let authId = null
for (let pagina = 1; pagina <= 20 && !authId; pagina++) {
  const { data } = await svc.auth.admin.listUsers({ page: pagina, perPage: 200 })
  const u = data.users.find((x) => x.email === FISCAL_EMAIL)
  if (u) authId = u.id
  if (data.users.length < 200) break
}
if (!authId) {
  const { data, error } = await svc.auth.admin.createUser({
    email: FISCAL_EMAIL,
    password: FISCAL_SENHA,
    email_confirm: true,
  })
  if (error) {
    console.error("Falha ao criar a conta do fiscal:", error.message)
    process.exit(1)
  }
  authId = data.user.id
}

// 3) Registro em usuarios (funcionário do sistema) --------------------------
const { data: uExiste } = await svc
  .from("usuarios")
  .select("id")
  .eq("id", FISCAL_USUARIO_ID)
  .maybeSingle()
if (!uExiste) {
  const { error } = await svc.from("usuarios").insert({
    id: FISCAL_USUARIO_ID,
    auth_user_id: authId,
    nome_completo: "Conselho Fiscal (demo)",
    email: FISCAL_EMAIL,
    emp_proprietaria_id: EMP,
  })
  if (error) {
    console.error("Falha ao criar o usuário do fiscal:", error.message)
    process.exit(1)
  }
} else {
  await svc.from("usuarios").update({ auth_user_id: authId }).eq("id", FISCAL_USUARIO_ID)
}

// 4) Registro em permissoes (define "funcionário do sistema") — vazio -------
const { data: pExiste } = await svc
  .from("permissoes")
  .select("id")
  .eq("usuario_id", FISCAL_USUARIO_ID)
  .eq("emp_proprietaria_id", EMP)
  .maybeSingle()
if (!pExiste) {
  await svc
    .from("permissoes")
    .insert({ usuario_id: FISCAL_USUARIO_ID, emp_proprietaria_id: EMP })
}

// 5) Vincula SÓ o perfil Conselho Fiscal ------------------------------------
const { data: vExiste } = await svc
  .from("usuario_perfis")
  .select("id")
  .eq("usuario_id", FISCAL_USUARIO_ID)
  .eq("perfil_id", perfil.id)
  .maybeSingle()
if (!vExiste) {
  await svc.from("usuario_perfis").insert({
    usuario_id: FISCAL_USUARIO_ID,
    perfil_id: perfil.id,
    emp_proprietaria_id: EMP,
  })
}

console.log("Fiscal de demonstração pronto. Capturando prints…")

// 6) Login por magic link + capturas ----------------------------------------
const { data: link, error: eLink } = await svc.auth.admin.generateLink({
  type: "magiclink",
  email: FISCAL_EMAIL,
})
if (eLink) {
  console.error("Falha ao gerar o link de acesso:", eLink.message)
  process.exit(1)
}
const tokenHash = link.properties.hashed_token

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
  console.error("Login do fiscal falhou — confira o seed e o dev server.")
  process.exit(1)
}

const SHOTS = [
  ["/painel", "institucional/conselho-fiscal-painel.png", false],
  [
    "/painel/financeiro/ordens/eec00000-0000-4000-8000-000000000002",
    "institucional/conselho-fiscal-ordem.png",
    true,
  ],
  ["/painel/patrimonio/itens", "institucional/conselho-fiscal-patrimonio.png", false],
]

for (const [rota, arquivo, fullPage] of SHOTS) {
  const dir = `public/ajuda/${arquivo.split("/").slice(0, -1).join("/")}`
  mkdirSync(dir, { recursive: true })
  await page.goto(BASE + rota, { waitUntil: "load", timeout: 60000 })
  await page.waitForTimeout(1200)
  await page.screenshot({ path: `public/ajuda/${arquivo}`, fullPage })
  console.log("salvo:", arquivo)
}

await browser.close()
console.log("Concluído.")
