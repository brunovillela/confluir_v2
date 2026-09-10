// ===========================================================================
// sincronizar-condicao-bubble.mjs — condição sindical e condição na fonte:
// o Bubble manda, cadastro a cadastro, enquanto ele for a origem.
//
// Por quê: 366 cadastros tiveram a condição alterada no Bubble entre julho e
// setembro/2026 (desfiliações concluídas, falecimentos, filiações efetivadas)
// e a sincronização do n8n não trouxe a mudança. O `completar-campos --desde`
// só olha registros alterados depois do desligamento do n8n (08/09), e o
// modo sem --desde só preenche coluna vazia — nenhum dos dois pega isso.
//
// Regra: para cada cadastro casado por bubble_id, compara
//   filiação."FILIAÇÃO CONDIÇÃO"       × filiacoes.filiacao_condicao
//   filiação."FILIAÇÃO CONDIÇÃO FONTE" × filiacoes.condicao_na_fonte
// Onde difere, grava o valor do Bubble — EXCETO se o app daqui avançou etapa
// nesse cadastro DEPOIS da alteração no Bubble (condicao_desde mais novo que
// o Modified Date): a mudança local é preservada e listada como "protegido".
// Vazio no Bubble não apaga o daqui.
//
// Lê o cache .auditoria-bubble/filiacao.json; sem cache, baixa. No dia da
// virada: apagar o cache antes (Remove-Item .auditoria-bubble\*.json).
//
// USO:
//   node scripts/sincronizar-condicao-bubble.mjs            (dry-run, lista nominal)
//   node scripts/sincronizar-condicao-bubble.mjs --apply
//   node scripts/sincronizar-condicao-bubble.mjs --so-sindical   (ignora a condição na fonte)
// ===========================================================================

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs"
import { join } from "node:path"

const args = process.argv.slice(2)
const APLICAR = args.includes("--apply")
const SO_SINDICAL = args.includes("--so-sindical")
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
const BASE = (env.BUBBLE_API_ROOT || "")
  .replace(/\/+$/, "")
  .replace(/\/obj$/, "")
  .replace("/version-test", "")
const TOKEN = env.BUBBLE_API_TOKEN

async function cadastrosDoBubble() {
  mkdirSync(CACHE, { recursive: true })
  const arquivo = join(CACHE, "filiacao.json")
  if (existsSync(arquivo)) {
    console.log(`Cache: ${arquivo} (apague para baixar de novo)`)
    return JSON.parse(readFileSync(arquivo, "utf8"))
  }
  const linhas = []
  for (let cursor = 0; ; ) {
    const r = await fetch(
      `${BASE}/obj/${encodeURIComponent("filiação")}?limit=100&cursor=${cursor}`,
      { headers: { Authorization: `Bearer ${TOKEN}` } }
    )
    if (r.status !== 200) throw new Error(`Bubble filiação: ${r.status}`)
    const j = await r.json()
    const res = j.response?.results ?? []
    linhas.push(...res)
    cursor += res.length
    if (!res.length || (j.response?.remaining ?? 0) === 0) break
  }
  writeFileSync(arquivo, JSON.stringify(linhas))
  return linhas
}

async function cadastrosDaqui(colunas) {
  const out = []
  for (let de = 0; ; de += 1000) {
    const { data, error } = await db
      .from("filiacoes")
      .select(colunas)
      .eq("emp_proprietaria_id", TENANT)
      .order("id", { ascending: true })
      .range(de, de + 999)
    if (error) throw new Error(error.message)
    out.push(...data)
    if (data.length < 1000) break
  }
  return out
}
const texto = (v) => (typeof v === "string" && v.trim() ? v.trim() : null)

const bubble = await cadastrosDoBubble()
const porBubble = new Map(bubble.map((c) => [c._id, c]))
const aqui = await cadastrosDaqui(
  "id, bubble_id, nome_completo, filiacao_condicao, condicao_na_fonte, condicao_desde"
)
const casados = aqui.filter((a) => a.bubble_id && porBubble.has(a.bubble_id)).length
console.log(`Bubble: ${bubble.length} cadastros · aqui: ${aqui.length} (${casados} casados)`)

const CAMPOS = [
  { rotulo: "condição sindical", bubble: "FILIAÇÃO CONDIÇÃO", coluna: "filiacao_condicao" },
  ...(SO_SINDICAL
    ? []
    : [{ rotulo: "condição na fonte", bubble: "FILIAÇÃO CONDIÇÃO FONTE", coluna: "condicao_na_fonte" }]),
]

const patches = new Map() // id → { coluna: valor, _nome, _motivos }
const protegidos = []
const resumo = {}
for (const a of aqui) {
  const b = a.bubble_id && porBubble.get(a.bubble_id)
  if (!b) continue
  for (const c of CAMPOS) {
    const la = texto(b[c.bubble])
    const ca = texto(a[c.coluna])
    if (!la || la === ca) continue
    const mudanca = `${c.rotulo}: ${ca ?? "(vazio)"} → ${la}`
    const etapaAqui = a.condicao_desde ? new Date(a.condicao_desde) : null
    const alteradoLa = b["Modified Date"] ? new Date(b["Modified Date"]) : null
    if (c.coluna === "filiacao_condicao" && etapaAqui && alteradoLa && etapaAqui > alteradoLa) {
      protegidos.push({ nome: a.nome_completo, aqui: ca, bubble: la, desde: a.condicao_desde })
      continue
    }
    resumo[mudanca] = (resumo[mudanca] ?? 0) + 1
    const p = patches.get(a.id) ?? { _nome: a.nome_completo, _motivos: [] }
    p[c.coluna] = la
    p._motivos.push(mudanca)
    patches.set(a.id, p)
  }
}

console.log(`\nCadastros a atualizar: ${patches.size}`)
console.table(
  Object.entries(resumo)
    .sort((x, y) => y[1] - x[1])
    .map(([mudanca, n]) => ({ mudanca, n }))
)
if (protegidos.length) {
  console.log(
    `\nProtegidos (o app avançou etapa aqui DEPOIS da alteração no Bubble — mantidos): ${protegidos.length}`
  )
  for (const p of protegidos) {
    console.log(`  ${p.nome} — aqui ${p.aqui}, Bubble ${p.bubble}, etapa aqui em ${p.desde}`)
  }
}
console.log("\nLista nominal:")
for (const [, p] of patches) {
  console.log(`  ${(p._nome ?? "").padEnd(45).slice(0, 45)}  ${p._motivos.join(" · ")}`)
}

if (!APLICAR) {
  console.log(`\nDRY-RUN — nada gravado. Rode com --apply para gravar ${patches.size} cadastros.`)
  process.exit(0)
}

let gravados = 0
const entradas = [...patches]
for (let i = 0; i < entradas.length; i += 25) {
  const r = await Promise.all(
    entradas.slice(i, i + 25).map(([id, p]) => {
      const { _nome, _motivos, ...dados } = p
      return db.from("filiacoes").update(dados).eq("id", id).eq("emp_proprietaria_id", TENANT)
    })
  )
  const erro = r.find((x) => x.error)
  if (erro) throw new Error(`Falha ao gravar: ${erro.error.message}`)
  gravados += r.length
}
console.log(`\nGRAVADO: ${gravados} cadastros.`)
