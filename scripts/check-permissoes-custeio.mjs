// LEITURA (não altera nada): lista quem tem as permissões do Custeio
// Institucional, por tenant — ver / criar (edição) / autorizar.
//
// USO:  node scripts/check-permissoes-custeio.mjs
// Opcional: passe um slug de tenant para filtrar. Ex.:
//   node scripts/check-permissoes-custeio.mjs sindipetronf

import { readFileSync } from "node:fs"

const FILTRO_SLUG = process.argv[2] || null
const DEMO_EMP = "11111111-1111-4111-8111-111111111111"

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

const { data: perms, error: e1 } = await admin
  .from("permissoes")
  .select(
    "usuario_id, custeio_institucional, custeio_institucional_edicao, custeio_institucional_autorizacao"
  )
  .not("usuario_id", "is", null)
if (e1) {
  console.error("Falha ao ler permissoes:", e1.message)
  process.exit(1)
}

const ids = perms.map((p) => p.usuario_id)
const { data: usuarios } = await admin
  .from("usuarios")
  .select("id, nome_completo, nome_guerra, emp_proprietaria_id, inativo, deletado")
  .in("id", ids)
const { data: tenants } = await admin.from("tenants").select("empresa_id, slug")

const slugPorEmp = new Map((tenants ?? []).map((t) => [t.empresa_id, t.slug]))
const usuPorId = new Map((usuarios ?? []).map((u) => [u.id, u]))

const marca = (v) => (v === true ? "✓" : "·")
const linhas = []
for (const p of perms) {
  const u = usuPorId.get(p.usuario_id)
  if (!u) continue
  if (u.inativo === true || u.deletado === true) continue
  if (u.emp_proprietaria_id === DEMO_EMP) continue
  const slug = slugPorEmp.get(u.emp_proprietaria_id) || "(sem tenant)"
  if (FILTRO_SLUG && slug !== FILTRO_SLUG) continue
  linhas.push({
    slug,
    nome: u.nome_completo || u.nome_guerra || "(sem nome)",
    ver: p.custeio_institucional === true,
    criar: p.custeio_institucional_edicao === true,
    autorizar: p.custeio_institucional_autorizacao === true,
  })
}

linhas.sort((a, b) => a.slug.localeCompare(b.slug) || a.nome.localeCompare(b.nome))

let tenantAtual = null
for (const l of linhas) {
  if (l.slug !== tenantAtual) {
    tenantAtual = l.slug
    console.log(`\n=== tenant: ${l.slug} ===`)
    console.log("ver  criar  autorizar   nome")
  }
  console.log(
    `${marca(l.ver)}    ${marca(l.criar)}      ${marca(l.autorizar)}         ${l.nome}`
  )
}

const podeCriar = linhas.filter((l) => l.criar)
const podeAutorizar = linhas.filter((l) => l.autorizar)
const autorizarSemCriar = linhas.filter((l) => l.autorizar && !l.criar)
const verSemNada = linhas.filter((l) => l.ver && !l.criar && !l.autorizar)

console.log("\n--- Resumo (usuários ativos, fora da demo) ---")
console.log(`Operadores com alguma permissão de Custeio: ${linhas.length}`)
console.log(`Podem CRIAR (edição): ${podeCriar.length} — ${podeCriar.map((l) => l.nome).join(", ") || "ninguém"}`)
console.log(`Podem AUTORIZAR: ${podeAutorizar.length} — ${podeAutorizar.map((l) => l.nome).join(", ") || "ninguém"}`)
if (autorizarSemCriar.length) {
  console.log(`Autorizam mas NÃO criam (ok se for por desenho): ${autorizarSemCriar.map((l) => l.nome).join(", ")}`)
}
if (verSemNada.length) {
  console.log(`Só visualizam (sem criar/autorizar): ${verSemNada.map((l) => l.nome).join(", ")}`)
}
