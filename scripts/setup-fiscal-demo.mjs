// Provisiona o usuário de DEMONSTRAÇÃO do Conselho Fiscal (login + fixtures),
// para depois gerar os prints do "somente leitura em ação".
//
// Rápido, sem navegador. VOCÊ roda este (ele CRIA a conta de acesso do fiscal —
// criação de conta é ação sua). Depois o assistente roda a captura dos prints.
//
// USO (PowerShell):
//   cd 'C:\Users\nomos\Sistemas\Confluir 2.0\confluir'
//   node scripts\setup-fiscal-demo.mjs

import { readFileSync } from "node:fs"

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
      "  cd 'C:\\Users\\nomos\\Sistemas\\Confluir 2.0\\confluir'\n" +
      "  node scripts\\setup-fiscal-demo.mjs"
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

const perfil = (
  await svc
    .from("perfis")
    .select("id")
    .eq("emp_proprietaria_id", EMP)
    .eq("nome", PERFIL_NOME)
    .maybeSingle()
).data
if (!perfil) {
  console.error(`Perfil "${PERFIL_NOME}" não existe. Rode perfis-acesso.sql antes.`)
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
console.log("✓ Perfil Conselho Fiscal com as chaves de leitura.")

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
  console.log("✓ Conta de acesso do fiscal criada.")
} else {
  console.log("✓ Conta de acesso do fiscal já existia.")
}

const uExiste = (
  await svc.from("usuarios").select("id").eq("id", FISCAL_USUARIO_ID).maybeSingle()
).data
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
console.log("✓ Registro em usuarios.")

const pExiste = (
  await svc
    .from("permissoes")
    .select("id")
    .eq("usuario_id", FISCAL_USUARIO_ID)
    .eq("emp_proprietaria_id", EMP)
    .maybeSingle()
).data
if (!pExiste) {
  await svc
    .from("permissoes")
    .insert({ usuario_id: FISCAL_USUARIO_ID, emp_proprietaria_id: EMP })
}
console.log("✓ Registro em permissoes (vazio — só o perfil manda).")

const vExiste = (
  await svc
    .from("usuario_perfis")
    .select("id")
    .eq("usuario_id", FISCAL_USUARIO_ID)
    .eq("perfil_id", perfil.id)
    .maybeSingle()
).data
if (!vExiste) {
  await svc.from("usuario_perfis").insert({
    usuario_id: FISCAL_USUARIO_ID,
    perfil_id: perfil.id,
    emp_proprietaria_id: EMP,
  })
}
console.log("✓ Perfil Conselho Fiscal atribuído ao fiscal.")
console.log("\nPronto. Agora o assistente pode capturar os prints.")
