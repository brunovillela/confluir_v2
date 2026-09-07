// ===========================================================================
// reconstruir-vinculos-bubble.mjs
//
// Cria o histórico de filiação que falta, a partir do CADASTRO do Bubble.
//
// O PROBLEMA: os 10.824 vínculos do Supabase nasceram no Bubble num único
// lote de setembro de 2025 que cobriu só metade dos cadastros — e nenhuma
// filiação posterior ganhou o seu. Metade da base ficou sem histórico, e foi
// por isso que 4.549 pessoas que contribuem apareciam como desfiliadas.
//
// A SAÍDA: o cadastro do Bubble (tipo "filiação") guarda "Filiação data
// adesão" e "FONTE PG" — exatamente o que o vínculo precisa. A conferência
// dá confiança na fonte: para quem tem cadastro E vínculo, a data bate em 75%
// dos casos, com mediana de diferença ZERO (o resto é gente com mais de um
// vínculo, em que comparei com o mais recente).
//
// O QUE NÃO FAZ: não inventa cargo, lotação nem matrícula do empregador — o
// cadastro não tem essas coisas, e preenchê-las com palpite estragaria dado
// bom. Não toca em quem já tem vínculo. Não escreve nada no Bubble.
//
// PRÉ-REQUISITOS:
//   1. supabase/filiacao-vinculos-reconstruidos.sql rodado (coluna de marca)
//   2. BUBBLE_API_ROOT e BUBBLE_API_TOKEN no .env.local
//
// USO:
//   node scripts/reconstruir-vinculos-bubble.mjs                 (dry-run)
//   node scripts/reconstruir-vinculos-bubble.mjs --limite 20 --apply
//   node scripts/reconstruir-vinculos-bubble.mjs --apply
//   node scripts/reconstruir-vinculos-bubble.mjs --conferir
//   node scripts/reconstruir-vinculos-bubble.mjs --desfazer --apply
// ===========================================================================

import { readFileSync } from "node:fs"

const args = process.argv.slice(2)
const APLICAR = args.includes("--apply")
const CONFERIR = args.includes("--conferir")
const DESFAZER = args.includes("--desfazer")
const LIMITE = (() => {
  const i = args.indexOf("--limite")
  return i >= 0 ? Number(args[i + 1]) : null
})()

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

// A Data API do Bubble: a raiz do .env já termina em /obj, e "version-test" é
// o banco de TESTE — os dados de verdade estão na raiz sem ele.
const BASE = (env.BUBBLE_API_ROOT || "")
  .replace(/\/+$/, "")
  .replace(/\/obj$/, "")
  .replace("/version-test", "")
const TOKEN = env.BUBBLE_API_TOKEN

if (!DESFAZER && (!BASE || !TOKEN)) {
  console.error("Faltam BUBBLE_API_ROOT e/ou BUBBLE_API_TOKEN no .env.local.")
  process.exit(1)
}

// ── leitura paginada, dos dois lados ───────────────────────────────────────

/** O PostgREST corta em 1000 linhas sem avisar. Toda leitura pagina. */
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
    const url = `${BASE}/obj/${encodeURIComponent(tipo)}?limit=100&cursor=${cursor}`
    const r = await fetch(url, { headers: { Authorization: `Bearer ${TOKEN}` } })
    if (r.status !== 200) {
      throw new Error(`Bubble ${tipo} em ${cursor}: ${r.status} ${(await r.text()).slice(0, 120)}`)
    }
    const j = await r.json()
    const res = j.response?.results ?? []
    linhas.push(...res)
    cursor += res.length
    if (res.length === 0 || (j.response?.remaining ?? 0) === 0) break
  }
  return linhas
}

// ── desfazer ───────────────────────────────────────────────────────────────

if (DESFAZER) {
  const { count } = await db
    .from("filiacao_vinculos")
    .select("id", { count: "exact", head: true })
    .eq("emp_proprietaria_id", TENANT)
    .not("reconstruido_de", "is", null)
  console.log(`Vínculos reconstruídos hoje no banco: ${count}`)
  if (!APLICAR) {
    console.log("Dry-run. Repita com --apply para apagar todos eles.")
    process.exit(0)
  }
  const { error } = await db
    .from("filiacao_vinculos")
    .delete()
    .eq("emp_proprietaria_id", TENANT)
    .not("reconstruido_de", "is", null)
  if (error) {
    console.error("Falhou:", error.message)
    process.exit(1)
  }
  console.log(`Apagados ${count} vínculos reconstruídos.`)
  process.exit(0)
}

// ── conferir ───────────────────────────────────────────────────────────────

if (CONFERIR) {
  const vinculos = await lerTudo(
    "filiacao_vinculos",
    "filiado_id, reconstruido_de",
    (q) => q.eq("emp_proprietaria_id", TENANT).not("filiado_id", "is", null)
  )
  const comVinculo = new Set(vinculos.map((v) => v.filiado_id))
  const reconstruidos = vinculos.filter((v) => v.reconstruido_de).length
  const ativos = await lerTudo("filiacoes", "id", (q) =>
    q
      .eq("emp_proprietaria_id", TENANT)
      .eq("filiacao_condicao", "Ativo")
      .not("filiacao_excluida", "is", true)
      .is("anonimizada_em", null)
  )
  const semVinculo = ativos.filter((f) => !comVinculo.has(f.id)).length
  console.log(`Vínculos no total:            ${vinculos.length}`)
  console.log(`  reconstruídos por este script: ${reconstruidos}`)
  console.log(`Filiados ativos:              ${ativos.length}`)
  console.log(`  ainda SEM vínculo:            ${semVinculo}`)
  process.exit(0)
}

// ── o trabalho ─────────────────────────────────────────────────────────────

console.log(APLICAR ? "MODO APLICAR — vai gravar." : "DRY-RUN — nada será gravado.")
console.log("Lendo o Bubble…")
const [cadastros, empresasBubble] = await Promise.all([
  bubbleTudo("filiação"),
  bubbleTudo("empresa"),
])
console.log(`  cadastros: ${cadastros.length} | empresas: ${empresasBubble.length}`)

console.log("Lendo o Supabase…")
const [filiacoes, vinculos, empresas] = await Promise.all([
  lerTudo("filiacoes", "id, bubble_id, nome_completo, filiacao_condicao", (q) =>
    q.eq("emp_proprietaria_id", TENANT)
  ),
  lerTudo("filiacao_vinculos", "filiado_id", (q) =>
    q.eq("emp_proprietaria_id", TENANT).not("filiado_id", "is", null)
  ),
  lerTudo("empresa", "id, bubble_id"),
])
console.log(`  cadastros: ${filiacoes.length} | vínculos: ${vinculos.length}`)

const porId = new Map(filiacoes.map((f) => [f.id, f]))
const porBubbleId = new Map(filiacoes.filter((f) => f.bubble_id).map((f) => [f.bubble_id, f]))
const comVinculo = new Set(vinculos.map((v) => v.filiado_id))

// A fonte pagadora sai do Supabase_id que a empresa do Bubble carrega; onde
// ele falta, casa pelo bubble_id que a nossa empresa guardou. As duas pontas
// existem porque a migração foi feita em duas épocas.
const empresaPorId = new Set(empresas.map((e) => e.id))
const empresaPorBubbleId = new Map(
  empresas.filter((e) => e.bubble_id).map((e) => [e.bubble_id, e.id])
)
const fontePorBubbleId = new Map()
for (const e of empresasBubble) {
  const alvo =
    (e.Supabase_id && empresaPorId.has(e.Supabase_id) && e.Supabase_id) ||
    empresaPorBubbleId.get(e._id) ||
    null
  if (alvo) fontePorBubbleId.set(e._id, alvo)
}

const dataDia = (iso) => (iso ? String(iso).slice(0, 10) : null)

const novos = []
const motivos = { semPar: 0, jaTemVinculo: 0, semData: 0, fonteDesconhecida: 0 }
for (const b of cadastros) {
  const f =
    (b.Supabase_id && porId.get(b.Supabase_id)) ||
    (b._id && porBubbleId.get(b._id)) ||
    null
  if (!f) {
    motivos.semPar++
    continue
  }
  if (comVinculo.has(f.id)) {
    motivos.jaTemVinculo++
    continue
  }
  const data = dataDia(b["Filiação data adesão"])
  if (!data) {
    motivos.semData++
    continue
  }
  const fonteBubble = b["FONTE PG"]
  const fonte = fonteBubble ? (fontePorBubbleId.get(fonteBubble) ?? null) : null
  if (fonteBubble && !fonte) motivos.fonteDesconhecida++

  novos.push({
    emp_proprietaria_id: TENANT,
    filiado_id: f.id,
    // Só o que o cadastro realmente diz. Cargo, lotação e matrícula do
    // empregador ficam vazios: chutá-los estragaria dado bom mais tarde.
    data_filiacao: data,
    fonte_pagadora_id: fonte,
    reconstruido_de: b._id,
    // A condição mora no cadastro; no vínculo ela viria nula de qualquer
    // forma, como nos 10.823 que já existem.
  })
}

// ATIVOS PRIMEIRO. A ordem não muda o resultado de um --apply inteiro, mas
// muda tudo num --limite: na ordem do Bubble os primeiros são cadastros
// antigos e inativos (os "A" de CPF zero), e conferir vinte deles na tela não
// diz nada sobre o que importa. Quem se quer olhar antes de soltar oito mil é
// o filiado ativo.
novos.sort((a, b) => {
  const ativo = (n) =>
    porId.get(n.filiado_id)?.filiacao_condicao === "Ativo" ? 0 : 1
  return ativo(a) - ativo(b)
})

console.log("\nRESULTADO DA APURAÇÃO")
console.log(`  vínculos a criar:                 ${novos.length}`)
console.log(`  já tinham vínculo:                ${motivos.jaTemVinculo}`)
console.log(`  sem data de adesão no Bubble:     ${motivos.semData}`)
console.log(`  sem cadastro correspondente aqui: ${motivos.semPar}`)
console.log(`  com fonte pagadora desconhecida:  ${motivos.fonteDesconhecida} (entram sem fonte)`)
console.log(`  dos que entram, com fonte:        ${novos.filter((n) => n.fonte_pagadora_id).length}`)

const ativosNovos = novos.filter(
  (n) => porId.get(n.filiado_id)?.filiacao_condicao === "Ativo"
).length
console.log(`  dos que entram, ATIVOS:           ${ativosNovos}`)

console.log("\nAMOSTRA:")
for (const n of novos.slice(0, 5)) {
  const f = porId.get(n.filiado_id)
  console.log(
    `  ${n.data_filiacao} | fonte ${n.fonte_pagadora_id ? "sim" : "não"} | ${String(f?.filiacao_condicao).padEnd(8)} | ${f?.nome_completo?.slice(0, 38)}`
  )
}

const aGravar = LIMITE ? novos.slice(0, LIMITE) : novos
if (!APLICAR) {
  console.log(`\nDry-run. Nada gravado. Repita com --apply para criar ${aGravar.length}.`)
  process.exit(0)
}

console.log(`\nGravando ${aGravar.length} vínculos…`)
let gravados = 0
for (let de = 0; de < aGravar.length; de += 500) {
  const lote = aGravar.slice(de, de + 500)
  const { error } = await db.from("filiacao_vinculos").insert(lote)
  if (error) {
    console.error(`\nFalhou no lote a partir de ${de}: ${error.message}`)
    console.error(`Gravados até aqui: ${gravados}. Use --desfazer --apply para reverter.`)
    process.exit(1)
  }
  gravados += lote.length
  process.stdout.write(".")
}
console.log(`\nPronto: ${gravados} vínculos criados, todos marcados em reconstruido_de.`)
console.log("Confira com --conferir; reverta com --desfazer --apply.")
