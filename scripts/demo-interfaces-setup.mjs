// Dá à conta demo (demo@confluir.local) acesso às TRÊS interfaces, para o
// print do alternador na Introdução do manual:
//   - Painel interno .... já tem (usuarios + permissoes)
//   - Área do hotel ..... vincula em hospedagem_hotel_usuarios ao hotel demo
//   - Portal do associado  seta user_metadata.cpf = CPF de um filiado Ativo
//
// Idempotente. USO:  node scripts/demo-interfaces-setup.mjs
import { readFileSync } from "node:fs"

const EMAIL = "demo@confluir.local"
const TENANT = "11111111-1111-4111-8111-111111111111"
const HOTEL = "40010000-0000-4000-8000-000000000001"
const VINCULO = "40060000-0000-4000-8000-000000000001" // id fixo do vínculo demo
const CPF_FILIADO = "11122233301" // Roberto Alves Pereira (filiacao_condicao=Ativo)

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

// 1. Localiza a conta demo no Auth.
let userId = null
for (let page = 1; page <= 20 && !userId; page++) {
  const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 200 })
  if (error) { console.error("listUsers:", error.message); process.exit(1) }
  const u = data.users.find((x) => (x.email ?? "").toLowerCase() === EMAIL)
  if (u) userId = u.id
  if (data.users.length < 200) break
}
if (!userId) { console.error("Conta demo não encontrada no Auth:", EMAIL); process.exit(1) }
console.log("conta demo:", userId)

// 2. Portal: grava o CPF no user_metadata (mantém o resto do metadata).
const { error: metaErr } = await admin.auth.admin.updateUserById(userId, {
  user_metadata: { cpf: CPF_FILIADO },
})
if (metaErr) { console.error("updateUser:", metaErr.message); process.exit(1) }
console.log("portal: user_metadata.cpf =", CPF_FILIADO)

// 3. Hotel: vínculo ativo em hospedagem_hotel_usuarios (tabela de tenant).
const { error: vincErr } = await admin.from("hospedagem_hotel_usuarios").upsert(
  {
    id: VINCULO,
    hotel_id: HOTEL,
    email: EMAIL,
    nome: "Recepção (demonstração)",
    auth_user_id: userId,
    ativo: true,
    emp_proprietaria_id: TENANT,
  },
  { onConflict: "id" }
)
if (vincErr) { console.error("vínculo hotel:", vincErr.message); process.exit(1) }
console.log("hotel: vínculo ativo em hospedagem_hotel_usuarios")

console.log("Pronto — a conta demo agora tem Painel + Hotel + Portal.")
