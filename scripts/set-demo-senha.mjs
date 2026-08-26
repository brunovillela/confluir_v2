// Define (ou redefine) a senha do usuário de DEMONSTRAÇÃO via Admin API.
//
// O e-mail demo@confluir.local é fictício, então "esqueci minha senha" por
// e-mail não funciona (não há caixa de entrada). Este script usa o service
// role para gravar a senha direto — sem enviar e-mail.
//
// USO:
//   node scripts/set-demo-senha.mjs "MinhaNovaSenha123"
//   node scripts/set-demo-senha.mjs                # usa a senha padrão abaixo
//
// Depois: entre em http://localhost:3222/login com demo@confluir.local + senha.

import { readFileSync } from "node:fs"

const EMAIL = "demo@confluir.local"
const SENHA = process.argv[2] || "ConfluirDemo123"

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
  console.error(
    "Faltou NEXT_PUBLIC_SUPABASE_URL/SUPABASE_URL ou SUPABASE_SERVICE_ROLE_KEY no .env.local."
  )
  process.exit(1)
}

const { createClient } = await import("@supabase/supabase-js")
const admin = createClient(url, serviceKey, { auth: { persistSession: false } })

// Procura o usuário pela lista paginada (a demo tem poucos usuários).
let alvo = null
for (let pagina = 1; pagina <= 20 && !alvo; pagina++) {
  const { data, error } = await admin.auth.admin.listUsers({ page: pagina, perPage: 200 })
  if (error) {
    console.error("Falha ao listar usuários:", error.message)
    process.exit(1)
  }
  alvo = data.users.find((u) => u.email === EMAIL)
  if (data.users.length < 200) break // última página
}

if (!alvo) {
  console.error(
    `Usuário ${EMAIL} não existe no Supabase Auth. Crie-o primeiro (ele é o login do tenant demo).`
  )
  process.exit(1)
}

const { error } = await admin.auth.admin.updateUserById(alvo.id, {
  password: SENHA,
  email_confirm: true,
})
if (error) {
  console.error("Falha ao atualizar a senha:", error.message)
  process.exit(1)
}

console.log(`Senha de ${EMAIL} atualizada.`)
console.log(`Entre em http://localhost:3222/login com essa senha: ${SENHA}`)
