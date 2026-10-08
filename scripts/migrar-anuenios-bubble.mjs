// ===========================================================================
// migrar-anuenios-bubble.mjs — anuênios que o Bubble gerou e não chegaram.
//
// A rotina agendada do Bubble cria, no dia 1º de cada mês, o anuênio de quem
// avança de nível (pessoal-anuênio → pessoal_anuenio). A migração de junho
// trouxe até junho/2026; os de julho em diante só existiam lá (08/10/2026:
// 11 registros, julho a outubro).
//
// Só INSERE o que não casa por bubble_id. Funcionário pelo bubble_id de
// usuarios; nível atual e próximo pelo bubble_id de pessoal_anuenio_base.
// Referência que não resolve é contada e o registro fica de fora.
//
// USO:
//   node scripts/migrar-anuenios-bubble.mjs            (simulação)
//   node scripts/migrar-anuenios-bubble.mjs --apply
// ===========================================================================
import { readFileSync } from "node:fs"

const APLICAR = process.argv.includes("--apply")
const env = Object.fromEntries(
  readFileSync(".env.local", "utf8")
    .split(/\r?\n/)
    .filter((l) => l.includes("=") && !l.startsWith("#"))
    .map((l) => {
      const i = l.indexOf("=")
      return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, "")]
    })
)
const BASE = (env.BUBBLE_API_ROOT || "").replace(/\/+$/, "").replace(/\/obj$/, "").replace("/version-test", "")
const HB = { Authorization: `Bearer ${env.BUBBLE_API_TOKEN}` }
const URL_DB = env.NEXT_PUBLIC_SUPABASE_URL
const H = { apikey: env.SUPABASE_SERVICE_ROLE_KEY, Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}` }
const TENANT = "c763cb99-edfd-4840-8453-ed3fcb66d4a1"

console.log(APLICAR ? "MODO APLICAR — vai gravar." : "SIMULAÇÃO — nada será gravado.")

const bubble = []
for (let cursor = 0; ; cursor += 100) {
  const j = await (await fetch(`${BASE}/obj/${encodeURIComponent("pessoal-anuênio")}?cursor=${cursor}&limit=100`, { headers: HB })).json()
  bubble.push(...j.response.results)
  if (!j.response.remaining) break
}
const get = async (q) => {
  const r = await fetch(`${URL_DB}/rest/v1/${q}`, { headers: H })
  if (!r.ok) throw new Error(`${q}: ${await r.text()}`)
  return r.json()
}
const aqui = new Set((await get(`pessoal_anuenio?emp_proprietaria_id=eq.${TENANT}&select=bubble_id&limit=10000`)).map((a) => a.bubble_id))
const faltam = bubble.filter((b) => !aqui.has(b._id))

const lista = (ids) => [...new Set(ids.filter(Boolean))].map((i) => `"${i}"`).join(",")
const usuarios = faltam.length
  ? await get(`usuarios?select=id,bubble_id,nome_completo&bubble_id=in.(${lista(faltam.map((b) => b["Funcionário"]))})`)
  : []
const niveis = faltam.length
  ? await get(`pessoal_anuenio_base?select=id,bubble_id&bubble_id=in.(${lista(faltam.flatMap((b) => [b["NÍVEL ATUAL"], b["PRÓXIMO NÍVEL"]]))})`)
  : []
const usuario = new Map(usuarios.map((u) => [u.bubble_id, u]))
const nivel = new Map(niveis.map((n) => [n.bubble_id, n.id]))
const dia = (v) => (v ? new Date(v).toISOString().slice(0, 10) : null)

const inserir = []
let semRef = 0
for (const b of faltam) {
  const u = usuario.get(b["Funcionário"])
  const nAtual = nivel.get(b["NÍVEL ATUAL"]) ?? null
  const nProx = b["PRÓXIMO NÍVEL"] ? (nivel.get(b["PRÓXIMO NÍVEL"]) ?? null) : null
  if (!u || !nAtual) {
    semRef++
    console.log(`  ✗ ${b.MÊS}/${b.ANO} ${b._id}: ${!u ? "funcionário" : "nível"} não encontrado aqui`)
    continue
  }
  inserir.push({
    bubble_id: b._id,
    emp_proprietaria_id: TENANT,
    ano: b.ANO ?? null,
    mes: b["MÊS"] ?? null,
    informado_contabilidade: b["Informado à Contabilidade?"] === true,
    id_schedule_proximo_anuenio: b["ID schedule próx anuênio"] ?? null,
    nivel_atual_data: dia(b["Nível atual data"]),
    proximo_nivel_data: dia(b["Próximo nível data"]),
    funcionario_id: u.id,
    nivel_atual_id: nAtual,
    proximo_nivel_id: nProx,
    created_at: b["Created Date"],
  })
  console.log(`  + ${b.MÊS}/${b.ANO} · ${u.nome_completo}`)
}
console.log(`Bubble ${bubble.length} · aqui ${aqui.size} · faltam ${faltam.length} · a inserir ${inserir.length} · sem referência ${semRef}`)

if (APLICAR && inserir.length) {
  const r = await fetch(`${URL_DB}/rest/v1/pessoal_anuenio`, {
    method: "POST",
    headers: { ...H, "Content-Type": "application/json", Prefer: "return=minimal" },
    body: JSON.stringify(inserir),
  })
  if (!r.ok) throw new Error(`insert: ${await r.text()}`)
  console.log(`✓ inseridos ${inserir.length}`)
}
