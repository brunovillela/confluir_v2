// Linhas institucionais do Bubble (tipo "Telefones institucionais": número,
// operadora e chip) → linhas_institucionais. Pré-requisito:
// supabase/linhas-institucionais.sql rodado.
//
// - Linha já trazida (mesmo bubble_id): atualiza número, operadora e chip se
//   mudaram no Bubble. Nunca mexe em "com quem está" nem na observação — isso
//   é do Confluir (no Bubble não havia responsável).
// - Mesmo número cadastrado à mão no Confluir: liga ao bubble_id, sem duplicar.
//
//   node scripts/migrar-linhas-bubble.mjs            (simulação)
//   node scripts/migrar-linhas-bubble.mjs --apply [--tenant <uuid>]
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
// Sem "version-test": os dados de PRODUÇÃO do Bubble (a versão de teste está
// quase vazia — 51 linhas contra 71 na de produção).
const RAIZ = env.BUBBLE_API_ROOT.replace(/\/obj\/?$/, "").replace("/version-test", "") + "/obj/"

const digitos = (v) => String(v ?? "").replace(/\D/g, "")
const vazioNull = (v) => (String(v ?? "").trim() ? String(v).trim() : null)

async function bubble(tipo) {
  const todos = []
  for (let cursor = 0; ; ) {
    const r = await fetch(`${RAIZ}${encodeURIComponent(tipo)}?limit=100&cursor=${cursor}`, {
      headers: { Authorization: `Bearer ${env.BUBBLE_API_TOKEN}` },
    })
    if (!r.ok) throw new Error(`Bubble ${tipo}: HTTP ${r.status}`)
    const { response } = await r.json()
    todos.push(...response.results)
    cursor += response.results.length
    if (!response.remaining) break
  }
  return todos
}

console.log(APLICAR ? "APLICANDO" : "SIMULAÇÃO — nada será gravado", `· tenant ${TENANT}\n`)

const origem = await bubble("telefonesinstitucionais")
const { data: atuais, error } = await db
  .from("linhas_institucionais")
  .select("id, numero, operadora, chip, bubble_id")
  .eq("emp_proprietaria_id", TENANT)
if (error) {
  console.error("Falha ao ler linhas_institucionais — o SQL foi rodado?", error.message)
  process.exit(1)
}
const porBubble = new Map(atuais.filter((l) => l.bubble_id).map((l) => [l.bubble_id, l]))
const porNumero = new Map(atuais.map((l) => [l.numero, l]))

const inserir = []
const atualizar = []
const invalidos = []
const repetidos = []
const vistos = new Set()
for (const o of origem) {
  const numero = digitos(o["Número do telefone"])
  if (numero.length < 10 || numero.length > 11) {
    invalidos.push(`${o._id}: "${o["Número do telefone"] ?? ""}"`)
    continue
  }
  if (vistos.has(numero)) {
    repetidos.push(numero)
    continue
  }
  vistos.add(numero)
  const campos = {
    numero,
    operadora: vazioNull(o.Operadora),
    chip: digitos(o.Chip) || null,
  }
  const existente = porBubble.get(o._id) ?? porNumero.get(numero)
  if (!existente) {
    inserir.push({ ...campos, bubble_id: o._id, emp_proprietaria_id: TENANT, created_at: o["Created Date"] })
    continue
  }
  const mudou =
    existente.numero !== campos.numero ||
    (existente.operadora ?? null) !== campos.operadora ||
    (existente.chip ?? null) !== campos.chip ||
    existente.bubble_id !== o._id
  if (mudou) atualizar.push({ id: existente.id, ...campos, bubble_id: o._id })
}

console.log(`no Bubble: ${origem.length} · no Confluir: ${atuais.length}`)
console.log(`  a inserir: ${inserir.length}`)
console.log(`  a atualizar: ${atualizar.length}`)
console.log(`  número inválido (fora): ${invalidos.length}`, invalidos.slice(0, 5).join(" · "))
console.log(`  número repetido no Bubble (fora): ${repetidos.length}`, repetidos.slice(0, 5).join(" · "))
const operadoras = {}
for (const l of inserir) operadoras[l.operadora ?? "(sem)"] = (operadoras[l.operadora ?? "(sem)"] ?? 0) + 1
console.log("  operadoras:", operadoras)

if (APLICAR) {
  if (inserir.length) {
    const { error: e } = await db.from("linhas_institucionais").insert(inserir)
    if (e) throw new Error(`insert: ${e.message}`)
  }
  for (const a of atualizar) {
    const { id, ...campos } = a
    const { error: e } = await db
      .from("linhas_institucionais")
      .update({ ...campos, updated_at: new Date().toISOString() })
      .eq("id", id)
    if (e) console.log("  ✘", id, e.message)
  }
  console.log(`\n${inserir.length} inserida(s), ${atualizar.length} atualizada(s).`)
} else {
  console.log("\nPara gravar: node scripts/migrar-linhas-bubble.mjs --apply")
}
