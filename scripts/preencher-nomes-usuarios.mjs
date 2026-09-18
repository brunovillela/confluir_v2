// Cadastros de usuário SEM NOME (vieram do Bubble só com CPF e e-mail) ganham
// o nome da diretoria (integrante ligado ao usuário ou ao CPF) ou, sem isso,
// da filiação pelo CPF. Só preenche nome vazio — não troca nome existente.
// CPF com nomes diferentes na filiação fica de fora (confira à mão).
//
//   node scripts/preencher-nomes-usuarios.mjs            (simulação)
//   node scripts/preencher-nomes-usuarios.mjs --apply [--tenant <uuid>]
import { readFileSync } from "node:fs"
import { createRequire } from "node:module"

const require = createRequire(import.meta.url)
const { createClient } = require("@supabase/supabase-js")

const env = Object.fromEntries(
  readFileSync(".env.local", "utf8")
    .split(/\r?\n/)
    .filter((l) => l.includes("=") && !l.trim().startsWith("#"))
    .map((l) => {
      const i = l.indexOf("=")
      return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, "")]
    })
)
const db = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
})
const args = process.argv.slice(2)
const APLICAR = args.includes("--apply")
const i = args.indexOf("--tenant")
const TENANT = i >= 0 ? args[i + 1] : "c763cb99-edfd-4840-8453-ed3fcb66d4a1"

const vazio = (v) => !String(v ?? "").trim()
const digitos = (v) => String(v ?? "").replace(/\D/g, "")

async function tudo(tabela, colunas, filtro = (q) => q) {
  const linhas = []
  for (let de = 0; ; de += 1000) {
    const { data, error } = await filtro(db.from(tabela).select(colunas)).range(de, de + 999)
    if (error) throw new Error(`${tabela}: ${error.message}`)
    linhas.push(...data)
    if (data.length < 1000) break
  }
  return linhas
}

console.log(APLICAR ? "APLICANDO" : "SIMULAÇÃO — nada será gravado", `· tenant ${TENANT}\n`)

const usuarios = await tudo("usuarios", "id, cpf, nome_completo, nome_guerra, deletado, conta_funcao", (q) =>
  q.eq("emp_proprietaria_id", TENANT).order("id")
)
const semNome = usuarios.filter(
  (u) => vazio(u.nome_completo) && vazio(u.nome_guerra) && u.deletado !== true && u.conta_funcao !== true
)
const [diretoria, filiacoes] = await Promise.all([
  tudo("diretoria_integrantes", "usuario_id, cpf, nome", (q) => q.eq("emp_proprietaria_id", TENANT).order("id")),
  tudo("filiacoes", "cpf, nome_completo", (q) => q.eq("emp_proprietaria_id", TENANT).not("cpf", "is", null).order("id")),
])
const dirPorUsuario = new Map(diretoria.filter((d) => d.usuario_id && !vazio(d.nome)).map((d) => [d.usuario_id, d.nome.trim()]))
const dirPorCpf = new Map(diretoria.filter((d) => digitos(d.cpf).length === 11 && !vazio(d.nome)).map((d) => [digitos(d.cpf), d.nome.trim()]))
const filPorCpf = new Map()
for (const f of filiacoes) {
  const cpf = digitos(f.cpf)
  if (cpf.length !== 11 || vazio(f.nome_completo)) continue
  const nomes = filPorCpf.get(cpf) ?? new Set()
  nomes.add(f.nome_completo.trim())
  filPorCpf.set(cpf, nomes)
}

const preencher = []
let ambiguos = 0
let semFonte = 0
for (const u of semNome) {
  const cpf = digitos(u.cpf)
  let nome = dirPorUsuario.get(u.id) ?? (cpf ? dirPorCpf.get(cpf) : undefined)
  let fonte = nome ? "diretoria" : null
  if (!nome && cpf) {
    const nomes = filPorCpf.get(cpf)
    if (nomes?.size === 1) {
      nome = [...nomes][0]
      fonte = "filiação"
    } else if (nomes && nomes.size > 1) ambiguos++
  }
  if (nome) preencher.push({ id: u.id, nome, fonte })
  else if (!filPorCpf.get(cpf)?.size) semFonte++
}

console.log(`usuários sem nome: ${semNome.length}`)
console.log(`  a preencher: ${preencher.length} (diretoria ${preencher.filter((p) => p.fonte === "diretoria").length}, filiação ${preencher.filter((p) => p.fonte === "filiação").length})`)
console.log(`  CPF com nomes diferentes na filiação (fora): ${ambiguos}`)
console.log(`  sem diretoria nem filiação (fora): ${semFonte}`)
console.log("  amostra:", preencher.slice(0, 5).map((p) => `${p.nome} (${p.fonte})`).join(" · "))

if (APLICAR) {
  let feitos = 0
  for (const p of preencher) {
    const { error } = await db
      .from("usuarios")
      .update({ nome_completo: p.nome, updated_at: new Date().toISOString() })
      .eq("id", p.id)
      .or("nome_completo.is.null,nome_completo.eq.")
    if (error) console.log("  ✘", p.id, error.message)
    else feitos++
  }
  console.log(`\n${feitos} nome(s) preenchido(s).`)
} else {
  console.log("\nPara gravar: node scripts/preencher-nomes-usuarios.mjs --apply")
}
