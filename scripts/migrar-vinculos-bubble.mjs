// ===========================================================================
// migrar-vinculos-bubble.mjs — os vínculos de filiação REAIS do Bubble.
//
// O Bubble tem 21.819 vínculos de filiação (tipo "filiaçãovínculos"); a
// migração trouxe 10.821. Em 07/09 reconstruí 8.537 a partir do cadastro para
// tapar o buraco — e 8.536 deles têm um vínculo real lá, mais rico (matrícula,
// admissão, ficha, carta…). Este script faz três coisas, nesta ordem:
//
//   1. SUBSTITUI cada vínculo reconstruído pelo real da mesma pessoa, NO
//      MESMO REGISTRO (mesmo id): a linha ganha o bubble_id real, todos os
//      campos do Bubble, e perde a marca `reconstruido_de`. Manter o id é o
//      que preserva documento já anexado e qualquer referência.
//   2. INSERE os vínculos reais que não têm par aqui e cuja pessoa não tinha
//      reconstruído (1.477 sem vínculo nenhum; 377 com um legítimo, que
//      ganham o segundo — é um segundo vínculo de verdade).
//   3. COMPLETA os 10.821 que já casavam: matrícula (8.653 vazias), admissão
//      (4.261), demissão, cartas, fichas — só coluna vazia.
//
// Regras de valor:
//   • campo do Bubble preenchido MANDA sobre o reconstruído (o reconstruído
//     era derivação; o real é a origem). Campo vazio no Bubble não apaga o
//     que já havia aqui.
//   • arquivo (ficha/carta): se a linha daqui já tem caminho no NOSSO bucket
//     (não é URL), fica; senão entra a URL do CDN e o
//     migrar-documentos-bubble.mjs traz o arquivo depois. A URL original vai
//     também para filiacao_ficha / filiacao_desfiliacao_carta, como nas demais.
//   • referência que não resolve (pessoa, fonte, filiação vinculada) entra
//     nula e é contada. Nada é inventado.
//
// Idempotente: vínculo já casado por bubble_id não é inserido de novo.
//
// USO:
//   node scripts/migrar-vinculos-bubble.mjs                 (dry-run)
//   node scripts/migrar-vinculos-bubble.mjs --limite 20 --apply
//   node scripts/migrar-vinculos-bubble.mjs --apply
//   node scripts/migrar-vinculos-bubble.mjs --conferir
// ===========================================================================

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs"
import { join } from "node:path"

const args = process.argv.slice(2)
const APLICAR = args.includes("--apply")
const CONFERIR = args.includes("--conferir")
const LIMITE = (() => {
  const i = args.indexOf("--limite")
  return i >= 0 ? Number(args[i + 1]) : null
})()
const CACHE = ".auditoria-bubble"

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
const BASE = (env.BUBBLE_API_ROOT || "").replace(/\/+$/, "").replace(/\/obj$/, "").replace("/version-test", "")
const TOKEN = env.BUBBLE_API_TOKEN

// ── leitura ────────────────────────────────────────────────────────────────

const normalizar = (s) =>
  String(s).normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "")

async function bubble(tipo) {
  mkdirSync(CACHE, { recursive: true })
  const arquivo = join(CACHE, normalizar(tipo) + ".json")
  if (existsSync(arquivo)) return JSON.parse(readFileSync(arquivo, "utf8"))
  const linhas = []
  for (let cursor = 0; ; ) {
    const r = await fetch(`${BASE}/obj/${encodeURIComponent(tipo)}?limit=100&cursor=${cursor}`, {
      headers: { Authorization: `Bearer ${TOKEN}` },
    })
    if (r.status !== 200) throw new Error(`Bubble ${tipo}: ${r.status}`)
    const j = await r.json()
    const res = j.response?.results ?? []
    linhas.push(...res)
    cursor += res.length
    if (!res.length || (j.response?.remaining ?? 0) === 0) break
  }
  writeFileSync(arquivo, JSON.stringify(linhas))
  return linhas
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

function resolvedor(registrosBubble, linhasAqui) {
  const idsAqui = new Set(linhasAqui.map((l) => l.id))
  const porBubble = new Map(linhasAqui.filter((l) => l.bubble_id).map((l) => [l.bubble_id, l.id]))
  const supaDe = new Map(registrosBubble.map((r) => [r._id, r.Supabase_id]))
  return (idBubble) => {
    if (!idBubble) return null
    const s = supaDe.get(idBubble)
    if (s && idsAqui.has(s)) return s
    return porBubble.get(idBubble) ?? null
  }
}

const dia = (v) => (v ? String(v).slice(0, 10) : null)
const texto = (v) => (typeof v === "string" && v.trim() !== "" ? v.trim() : null)
const bool = (v) => (v === true ? true : v === false ? false : null)
const vazio = (v) => v === null || v === undefined || v === ""
const ehUrl = (v) => typeof v === "string" && (v.startsWith("//") || /^https?:\/\//i.test(v))

// ── conferir ───────────────────────────────────────────────────────────────

if (CONFERIR) {
  const vb = await bubble("filiaçãovínculos")
  const aqui = await lerTudo("filiacao_vinculos", "id, bubble_id, reconstruido_de, matricula, filiado_id", (q) =>
    q.eq("emp_proprietaria_id", TENANT)
  )
  const porBubble = new Set(aqui.map((a) => a.bubble_id).filter(Boolean))
  const porId = new Set(aqui.map((a) => a.id))
  const soLa = vb.filter((v) => !((v.Supabase_id && porId.has(v.Supabase_id)) || porBubble.has(v._id)))
  console.log(`Bubble ${vb.length} | aqui ${aqui.length} | só no Bubble ${soLa.length}`)
  console.log(`reconstruídos restantes: ${aqui.filter((a) => a.reconstruido_de).length}`)
  console.log(`com matrícula: ${aqui.filter((a) => a.matricula).length}`)
  process.exit(0)
}

console.log(APLICAR ? "MODO APLICAR — vai gravar." : "DRY-RUN — nada será gravado.")

// ── o trabalho ─────────────────────────────────────────────────────────────

const [vinculosB, cadastrosB, empresasB] = await Promise.all([
  bubble("filiaçãovínculos"),
  bubble("filiação"),
  bubble("empresa"),
])
const [aqui, filiacoes, empresas] = await Promise.all([
  lerTudo(
    "filiacao_vinculos",
    "id, bubble_id, filiado_id, reconstruido_de, cargo, lotacao, matricula, data_entrada_admissao, data_saida_demissao, data_filiacao, data_desfiliacao, ficha_filiacao, ficha_filiacao_aceita, carta_desfiliacao, carta_desfiliacao_aceita, fonte_pagadora_id, filiacao_vinculada_id, filiacao_vinculada_tipo, filiacao_ficha, filiacao_desfiliacao_carta, lotacao_offshore",
    (q) => q.eq("emp_proprietaria_id", TENANT)
  ),
  lerTudo("filiacoes", "id, bubble_id", (q) => q.eq("emp_proprietaria_id", TENANT)),
  lerTudo("empresa", "id, bubble_id"),
])
console.log(`Bubble: ${vinculosB.length} vínculos | aqui: ${aqui.length}`)

const filiado = resolvedor(cadastrosB, filiacoes)
const empresa = resolvedor(empresasB, empresas)

const aquiPorId = new Map(aqui.map((a) => [a.id, a]))
const aquiPorBubble = new Map(aqui.filter((a) => a.bubble_id).map((a) => [a.bubble_id, a]))
const reconstruidoDe = new Map() // filiado_id → linha reconstruída ainda livre
for (const a of aqui) if (a.reconstruido_de && a.filiado_id) reconstruidoDe.set(a.filiado_id, a)

const perdas = { pessoa: 0, fonte: 0, vinculada: 0 }

/** Os campos do vínculo, na forma da tabela daqui, a partir do registro do Bubble. */
function camposDe(v) {
  const f = filiado(v.FILIADO)
  if (v.FILIADO && !f) perdas.pessoa++
  const fonte = v["FONTE PAGADORA"] ? empresa(v["FONTE PAGADORA"]) : null
  if (v["FONTE PAGADORA"] && !fonte) perdas.fonte++
  const vinculada = v["FILIAÇÃO VINCULADA"] ? filiado(v["FILIAÇÃO VINCULADA"]) : null
  if (v["FILIAÇÃO VINCULADA"] && !vinculada) perdas.vinculada++
  return {
    filiado_id: f,
    fonte_pagadora_id: fonte,
    data_filiacao: dia(v["Data de filiação"]),
    data_desfiliacao: dia(v["Data de desfiliação"]),
    cargo: texto(v.Cargo),
    lotacao: texto(v["Lotação"]),
    matricula: v["Matrícula"] == null ? null : String(v["Matrícula"]).trim() || null,
    data_entrada_admissao: dia(v["Data de entrada_admissao"]),
    data_saida_demissao: dia(v["Data de saída_demissao"]),
    ficha_filiacao: texto(v["Ficha de filiação"]),
    ficha_filiacao_aceita: bool(v["Ficha de filiação aceita?"]),
    carta_desfiliacao: texto(v["Carta de desfiliação"]),
    carta_desfiliacao_aceita: bool(v["Carta de desfiliação aceita?"]),
    filiacao_vinculada_id: vinculada,
    filiacao_vinculada_tipo: texto(v["FILIAÇÃO VINCULADA Tipo"]),
    lotacao_offshore: bool(v["Lotação offshore?"]),
  }
}

/**
 * Mescla o real por cima do que já existe: Bubble preenchido manda; Bubble
 * vazio não apaga; arquivo já no nosso bucket não é trocado por URL.
 */
function mesclar(existente, real) {
  const patch = {}
  for (const [k, v] of Object.entries(real)) {
    const atual = existente[k]
    if (k === "ficha_filiacao" || k === "carta_desfiliacao") {
      if (!vazio(atual) && !ehUrl(atual)) continue // já é nosso
      if (!vazio(v) && v !== atual) patch[k] = v
      continue
    }
    if (vazio(v)) continue
    if (v !== atual) patch[k] = v
  }
  // URL original preservada nas colunas legadas, como o migrar-documentos faz
  if (patch.ficha_filiacao && ehUrl(patch.ficha_filiacao) && vazio(existente.filiacao_ficha)) patch.filiacao_ficha = patch.ficha_filiacao
  if (patch.carta_desfiliacao && ehUrl(patch.carta_desfiliacao) && vazio(existente.filiacao_desfiliacao_carta)) patch.filiacao_desfiliacao_carta = patch.carta_desfiliacao
  return patch
}

const substituir = [] // { id, patch }  — reconstruído vira o real
const inserir = []    // linhas novas
const completar = []  // { id, patch } — já casava, ganha o que faltava

// Ordem: por Created Date, para que, quando a pessoa tem mais de um real
// faltando, o mais antigo tome o lugar do reconstruído e os demais entrem novos.
const ordenados = [...vinculosB].sort((a, b) => String(a["Created Date"]).localeCompare(String(b["Created Date"])))

for (const v of ordenados) {
  const existente = (v.Supabase_id && aquiPorId.get(v.Supabase_id)) || aquiPorBubble.get(v._id) || null
  const real = camposDe(v)
  if (existente) {
    const patch = mesclar(existente, real)
    if (Object.keys(patch).length) completar.push({ id: existente.id, patch })
    continue
  }
  const recon = real.filiado_id ? reconstruidoDe.get(real.filiado_id) : null
  if (recon) {
    reconstruidoDe.delete(real.filiado_id)
    const patch = mesclar(recon, real)
    patch.bubble_id = v._id
    patch.reconstruido_de = null
    substituir.push({ id: recon.id, patch, pessoa: real.filiado_id })
    continue
  }
  inserir.push({
    bubble_id: v._id,
    emp_proprietaria_id: TENANT,
    ...real,
    filiacao_ficha: ehUrl(real.ficha_filiacao) ? real.ficha_filiacao : null,
    filiacao_desfiliacao_carta: ehUrl(real.carta_desfiliacao) ? real.carta_desfiliacao : null,
    created_at: v["Created Date"],
  })
}

const conta = (lista, f) => lista.filter(f).length
console.log(`\nSUBSTITUIR (reconstruído → real, mesmo id): ${substituir.length}`)
console.log(`  ganham matrícula ${conta(substituir, (s) => s.patch.matricula)} · admissão ${conta(substituir, (s) => s.patch.data_entrada_admissao)} · desfiliação ${conta(substituir, (s) => s.patch.data_desfiliacao)} · ficha ${conta(substituir, (s) => s.patch.ficha_filiacao)} · carta ${conta(substituir, (s) => s.patch.carta_desfiliacao)}`)
console.log(`INSERIR (sem par e sem reconstruído): ${inserir.length}`)
console.log(`  com pessoa ${conta(inserir, (i) => i.filiado_id)} · com fonte ${conta(inserir, (i) => i.fonte_pagadora_id)} · com matrícula ${conta(inserir, (i) => i.matricula)} · em aberto ${conta(inserir, (i) => !i.data_desfiliacao)}`)
console.log(`COMPLETAR (já casavam): ${completar.length}`)
console.log(`  ganham matrícula ${conta(completar, (c) => c.patch.matricula)} · admissão ${conta(completar, (c) => c.patch.data_entrada_admissao)} · demissão ${conta(completar, (c) => c.patch.data_saida_demissao)} · ficha ${conta(completar, (c) => c.patch.ficha_filiacao)} · carta ${conta(completar, (c) => c.patch.carta_desfiliacao)}`)
console.log(`reconstruídos que FICAM (pessoa sem vínculo real lá): ${reconstruidoDe.size}`)
console.log(`referências sem resolver: pessoa ${perdas.pessoa} · fonte ${perdas.fonte} · filiação vinculada ${perdas.vinculada}`)
const arquivosNovos = conta(substituir, (s) => s.patch.ficha_filiacao || s.patch.carta_desfiliacao) + conta(inserir, (i) => i.ficha_filiacao || i.carta_desfiliacao) + conta(completar, (c) => c.patch.ficha_filiacao || c.patch.carta_desfiliacao)
console.log(`vínculos com arquivo apontando para o CDN depois disto: ${arquivosNovos} → migrar-documentos-bubble.mjs --apply`)

const s = LIMITE ? substituir.slice(0, LIMITE) : substituir
const i = LIMITE ? inserir.slice(0, LIMITE) : inserir
const c = LIMITE ? completar.slice(0, LIMITE) : completar
if (!APLICAR) {
  console.log(`\nDry-run. Repita com --apply para substituir ${s.length}, inserir ${i.length} e completar ${c.length}.`)
  process.exit(0)
}

async function atualizar(lista, rotulo) {
  let n = 0
  for (const { id, patch } of lista) {
    const { error } = await db.from("filiacao_vinculos").update(patch).eq("id", id)
    if (error) {
      console.error(`\nFalhou (${rotulo}) em ${id}: ${error.message}\nFeitos até aqui: ${n}.`)
      process.exit(1)
    }
    n++
    if (n % 250 === 0) process.stdout.write(".")
  }
  console.log(`\n  ${rotulo}: ${n}`)
}

console.log("\nSubstituindo…")
await atualizar(s, "substituídos")
console.log("Inserindo…")
let ins = 0
for (let de = 0; de < i.length; de += 500) {
  const lote = i.slice(de, de + 500)
  // insert, não upsert: a tabela migrada não tem índice único em bubble_id, e
  // a idempotência já vem de cima — vínculo que casa não entra nesta lista.
  const { error } = await db.from("filiacao_vinculos").insert(lote)
  if (error) {
    console.error(`\nFalhou (inserir) a partir de ${de}: ${error.message}\nInseridos até aqui: ${ins}.`)
    process.exit(1)
  }
  ins += lote.length
  process.stdout.write(".")
}
console.log(`\n  inseridos: ${ins}`)
console.log("Completando…")
await atualizar(c, "completados")
console.log("\nPronto. Confira com --conferir; depois rode migrar-documentos-bubble.mjs --apply para os arquivos.")
