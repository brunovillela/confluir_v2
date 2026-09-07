// ===========================================================================
// cadastrar-empresas-faltantes.mjs
//
// Cadastra as fontes pagadoras que existem no Bubble e não vieram para o
// Supabase, e liga a elas os vínculos que ficaram sem fonte.
//
// COMO ELAS SUMIRAM: o cadastro delas no Bubble já traz um `Supabase_id`
// apontando para um registro nosso — mas esse registro nunca foi criado. A
// migração escreveu o ponteiro e não escreveu o destino. Foram descobertas ao
// reconstruir o histórico de filiação: 317 vínculos ficaram sem fonte porque
// a empresa não existia deste lado.
//
// O id gravado aqui é EXATAMENTE o `Supabase_id` que o Bubble já aponta, e
// não um novo: assim o ponteiro que estava quebrado passa a valer, e uma
// futura sincronização casa sem duplicar ninguém.
//
// USO:
//   node scripts/cadastrar-empresas-faltantes.mjs           (dry-run)
//   node scripts/cadastrar-empresas-faltantes.mjs --apply
// ===========================================================================

import { readFileSync } from "node:fs"

const APLICAR = process.argv.includes("--apply")

const env = Object.fromEntries(
  readFileSync(".env.local", "utf8")
    .split(/\r?\n/)
    .filter((l) => l.includes("="))
    .map((l) => {
      const i = l.indexOf("=")
      return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, "")]
    })
)

const { createClient } = await import("@supabase/supabase-js")
const db = createClient(
  env.NEXT_PUBLIC_SUPABASE_URL || env.SUPABASE_URL,
  env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false } }
)

const TENANT = "c763cb99-edfd-4840-8453-ed3fcb66d4a1"
const BASE = (env.BUBBLE_API_ROOT || "")
  .replace(/\/+$/, "")
  .replace(/\/obj$/, "")
  .replace("/version-test", "")
const TOKEN = env.BUBBLE_API_TOKEN

if (!BASE || !TOKEN) {
  console.error("Faltam BUBBLE_API_ROOT e/ou BUBBLE_API_TOKEN no .env.local.")
  process.exit(1)
}

async function lerTudo(tabela, colunas, extra = (q) => q) {
  const linhas = []
  for (let de = 0; ; de += 1000) {
    const { data, error } = await extra(
      db.from(tabela).select(colunas).order("id", { ascending: true }).range(de, de + 999)
    )
    if (error) throw new Error(`${tabela}: ${error.message}`)
    linhas.push(...data)
    if (data.length < 1000) break
  }
  return linhas
}

async function bubbleTudo(tipo) {
  const linhas = []
  for (let cursor = 0; ; ) {
    const r = await fetch(
      `${BASE}/obj/${encodeURIComponent(tipo)}?limit=100&cursor=${cursor}`,
      { headers: { Authorization: `Bearer ${TOKEN}` } }
    )
    if (r.status !== 200) throw new Error(`Bubble ${tipo}: ${r.status}`)
    const j = await r.json()
    const res = j.response?.results ?? []
    linhas.push(...res)
    cursor += res.length
    if (res.length === 0 || (j.response?.remaining ?? 0) === 0) break
  }
  return linhas
}

console.log(APLICAR ? "MODO APLICAR — vai gravar." : "DRY-RUN — nada será gravado.")
console.log("Lendo os dois lados…")
const [cadastros, empresasBubble, empresas, vinculos] = await Promise.all([
  bubbleTudo("filiação"),
  bubbleTudo("empresa"),
  lerTudo("empresa", "id, bubble_id"),
  lerTudo("filiacao_vinculos", "id, filiado_id, fonte_pagadora_id, reconstruido_de", (q) =>
    q.eq("emp_proprietaria_id", TENANT)
  ),
])

const idsNossos = new Set(empresas.map((e) => e.id))
const porBubbleId = new Map(empresas.filter((e) => e.bubble_id).map((e) => [e.bubble_id, e.id]))
const resolve = (idBubble) => {
  const e = empresasBubble.find((x) => x._id === idBubble)
  if (!e) return null
  if (e.Supabase_id && idsNossos.has(e.Supabase_id)) return e.Supabase_id
  return porBubbleId.get(idBubble) ?? null
}

// Quais fontes os cadastros usam e não resolvem em empresa?
const usoPorFonte = new Map()
for (const c of cadastros) {
  const f = c["FONTE PG"]
  if (!f) continue
  usoPorFonte.set(f, (usoPorFonte.get(f) ?? 0) + 1)
}
const faltantes = [...usoPorFonte.keys()].filter((f) => !resolve(f))

// Só o CNPJ, sem pontuação: é assim que os cadastros existentes guardam.
const soDigitos = (v) => (typeof v === "string" ? v.replace(/\D/g, "") : null)

const novas = []
for (const idBubble of faltantes) {
  const e = empresasBubble.find((x) => x._id === idBubble)
  if (!e) {
    console.log(`  ! fonte ${idBubble} não existe nem no Bubble — ignorada`)
    continue
  }
  if (!e.Supabase_id) {
    console.log(`  ! ${e["Nome razão"]} não tem Supabase_id no Bubble — ignorada`)
    continue
  }
  novas.push({
    id: e.Supabase_id,
    bubble_id: e._id,
    emp_proprietaria_id: TENANT,
    nome_razao: e["Nome razão"] ?? null,
    nome_fantasia: e["Nome fantasia_Nome completo "] ?? null,
    cnpj_cpf: soDigitos(e.CNPJ_CPF),
    pessoa_juridica: e["É Pessoa jurídica?"] === true,
    trabalhadores_rep_nf: e["Trabalhadores representados pelo NF?"] === true,
    quantidade_trabalhadores: e["Quantidade trabalhadores"] ?? null,
  })
}

console.log(`\nEMPRESAS A CADASTRAR: ${novas.length}`)
for (const n of novas) {
  const cadastrosDela = usoPorFonte.get(n.bubble_id) ?? 0
  console.log(
    `  ${(n.nome_fantasia ?? n.nome_razao ?? "").padEnd(16)} ${String(n.cnpj_cpf).padEnd(16)} ${cadastrosDela} cadastro(s) no Bubble`
  )
}

// Os vínculos que passariam a ter fonte: os sem fonte cujo cadastro de origem
// aponta para uma destas empresas.
const porOrigem = new Map(cadastros.map((c) => [c._id, c]))
const idsNovas = new Set(novas.map((n) => n.bubble_id))
const aLigar = []
for (const v of vinculos) {
  if (v.fonte_pagadora_id) continue
  if (!v.reconstruido_de) continue
  const c = porOrigem.get(v.reconstruido_de)
  const fonte = c?.["FONTE PG"]
  if (!fonte || !idsNovas.has(fonte)) continue
  const empresa = novas.find((n) => n.bubble_id === fonte)
  aLigar.push({ id: v.id, fonte_pagadora_id: empresa.id })
}

const porEmpresa = new Map()
for (const l of aLigar) porEmpresa.set(l.fonte_pagadora_id, (porEmpresa.get(l.fonte_pagadora_id) ?? 0) + 1)
console.log(`\nVÍNCULOS A LIGAR: ${aLigar.length}`)
for (const [id, n] of porEmpresa) {
  const e = novas.find((x) => x.id === id)
  console.log(`  ${String(n).padStart(4)} → ${e?.nome_fantasia ?? e?.nome_razao}`)
}

const semFonteRestantes = vinculos.filter(
  (v) => !v.fonte_pagadora_id && v.reconstruido_de
).length
console.log(`\nvínculos reconstruídos sem fonte hoje: ${semFonteRestantes}`)
console.log(`  ficariam sem fonte depois:          ${semFonteRestantes - aLigar.length}`)

if (!APLICAR) {
  console.log("\nDry-run. Nada gravado. Repita com --apply.")
  process.exit(0)
}

console.log("\nCadastrando as empresas…")
const { error: erroEmpresa } = await db.from("empresa").insert(novas)
if (erroEmpresa) {
  console.error("Falhou:", erroEmpresa.message)
  process.exit(1)
}
console.log(`  ${novas.length} cadastradas.`)

console.log("Ligando os vínculos…")
let feitos = 0
for (const { id, fonte_pagadora_id } of aLigar) {
  const { error } = await db
    .from("filiacao_vinculos")
    .update({ fonte_pagadora_id })
    .eq("id", id)
  if (error) {
    console.error(`\nFalhou em ${id}: ${error.message}`)
    console.error(`Ligados até aqui: ${feitos}.`)
    process.exit(1)
  }
  feitos++
  if (feitos % 50 === 0) process.stdout.write(".")
}
console.log(`\nPronto: ${novas.length} empresas cadastradas, ${feitos} vínculos ligados.`)
