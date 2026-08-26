// ===========================================================================
// bubble-probe.mjs — sonda da Data API do Bubble. NÃO grava nada.
// Mostra o formato REAL de um tipo (chaves de campo + como vêm as referências),
// para montarmos os mapas de sincronização com precisão.
//
// PRÉ-REQUISITOS (uma vez):
//   1. No editor do Bubble: Settings > API > marque "Enable Data API" e
//      selecione os tipos a expor (ou "expose all").
//   2. Gere um token privado (Settings > API > API Tokens > Generate a new
//      API token). Esse token é ADMIN (ignora privacy rules) — mantenha secreto.
//   3. No .env.local, adicione (SEM commitar):
//        BUBBLE_API_ROOT=https://<seuapp>.bubbleapps.io/api/1.1
//        BUBBLE_API_TOKEN=<o token privado>
//      (se usar domínio próprio, troque o host; para dados de PRODUÇÃO use a
//       raiz SEM "version-test".)
//
// USO:
//   node scripts/bubble-probe.mjs "<Nome do Tipo>"
//   ex.: node scripts/bubble-probe.mjs "Patrimônio - Item"
//   (o nome do tipo é como aparece no Bubble; a sonda testa variações de slug)
// ===========================================================================

import { readFileSync } from "node:fs"

const env = Object.fromEntries(
  readFileSync(".env.local", "utf8")
    .split(/\r?\n/)
    .filter((l) => l.includes("="))
    .map((l) => {
      const i = l.indexOf("=")
      return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, "")]
    })
)

const ROOT = (env.BUBBLE_API_ROOT || "").replace(/\/+$/, "")
const TOKEN = env.BUBBLE_API_TOKEN
if (!ROOT || !TOKEN) {
  console.error("Faltam BUBBLE_API_ROOT e/ou BUBBLE_API_TOKEN no .env.local (ver cabeçalho).")
  process.exit(1)
}

const tipo = process.argv[2]
if (!tipo) {
  console.error('uso: node scripts/bubble-probe.mjs "<Nome do Tipo>"')
  process.exit(1)
}

// A Data API costuma aceitar o nome do tipo em minúsculas. Testamos algumas
// variações comuns de slug até uma responder 200.
const variacoes = [
  tipo,
  tipo.toLowerCase(),
  tipo.toLowerCase().replace(/\s*-\s*/g, "-").replace(/\s+/g, "-"),
  tipo.toLowerCase().replace(/\s+/g, ""),
]

async function tenta(nome) {
  const url = `${ROOT}/obj/${encodeURIComponent(nome)}?limit=2`
  const r = await fetch(url, { headers: { Authorization: `Bearer ${TOKEN}` } })
  return { nome, status: r.status, body: r.status === 200 ? await r.json() : await r.text() }
}

let ok = null
for (const v of [...new Set(variacoes)]) {
  const res = await tenta(v)
  console.log(`  tentativa /obj/${v} → ${res.status}`)
  if (res.status === 200) { ok = res; break }
}

if (!ok) {
  console.error("\nNenhuma variação respondeu 200. Confira o nome do tipo e se a Data API expõe esse tipo.")
  process.exit(1)
}

const results = ok.body?.response?.results ?? []
console.log(`\n=== ${ok.nome} · ${ok.body?.response?.count ?? "?"} registros no total ===`)
if (results.length === 0) {
  console.log("(tipo exposto, mas sem registros)")
  process.exit(0)
}

const amostra = results[0]
console.log("\nCHAVES DE CAMPO:", Object.keys(amostra).join(" | "))
console.log("\nPRIMEIRO REGISTRO (valores longos truncados):")
const enxuto = Object.fromEntries(
  Object.entries(amostra).map(([k, v]) => {
    const s = typeof v === "string" ? v : JSON.stringify(v)
    return [k, s.length > 120 ? s.slice(0, 120) + "…" : v]
  })
)
console.log(JSON.stringify(enxuto, null, 2))
