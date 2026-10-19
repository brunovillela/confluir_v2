// Link de ENTRADA no painel da DEMO, sem senha e sem captcha.
//
// Por quê: o Supabase de produção tem a proteção por captcha ligada, e o
// widget do Turnstile só existe com as chaves de produção — no localhost o
// login por senha sempre falha ("Email ou senha incorretos"). O link mágico
// gerado pela Admin API (service role) não passa pelo captcha: a rota
// /auth/confirm troca o token pela sessão.
//
// USO (com o servidor da demo no ar, porta 3222):
//   node scripts/link-demo.mjs                 # entra no /painel
//   node scripts/link-demo.mjs /painel/financeiro/cartoes
// Abra o link impresso no navegador. Vale uma vez e expira em pouco tempo.
// No Git Bash, o caminho vira caminho do Windows: use MSYS_NO_PATHCONV=1 antes.

import { readFileSync } from "node:fs"

const EMAIL = "demo@confluir.local"
const BASE = "http://localhost:3222"
const destino = /^\/(?![/\\])/.test(process.argv[2] ?? "") ? process.argv[2] : "/painel"

const env = Object.fromEntries(
  readFileSync(".env.local", "utf8")
    .split("\n")
    .filter((l) => l.includes("="))
    .map((l) => {
      const i = l.indexOf("=")
      return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, "")]
    })
)

const url = env.NEXT_PUBLIC_SUPABASE_URL || env.SUPABASE_URL
const serviceKey = env.SUPABASE_SERVICE_ROLE_KEY
if (!url || !serviceKey) {
  console.error("Faltou NEXT_PUBLIC_SUPABASE_URL/SUPABASE_URL ou SUPABASE_SERVICE_ROLE_KEY no .env.local.")
  process.exit(1)
}

const { createClient } = await import("@supabase/supabase-js")
const admin = createClient(url, serviceKey, { auth: { persistSession: false } })
const { data, error } = await admin.auth.admin.generateLink({ type: "magiclink", email: EMAIL })
if (error || !data?.properties?.hashed_token) {
  console.error(`Não foi possível gerar o link: ${error?.message ?? "sem token"}`)
  process.exit(1)
}
const link = new URL("/auth/confirm", BASE)
link.searchParams.set("token_hash", data.properties.hashed_token)
link.searchParams.set("type", "magiclink")
link.searchParams.set("next", destino)
console.log(link.toString())
