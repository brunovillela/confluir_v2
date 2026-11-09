// ===========================================================================
// migrar-faltas-justificadas-bubble.mjs — faltas justificadas que o Bubble
// tinha e não chegaram ao Confluir.
//
// A migração de junho trouxe 480 faltas (pessoal-faltasjustificadas →
// pessoal_faltas_justificadas). O Pessoal seguiu lançando no Bubble até a área
// existir no Confluir (02/10/2026): em 09/11/2026 havia 17 só lá, criadas de
// junho a setembro, 16 autorizadas e 1 em branco (sem data da falta).
//
// Só INSERE o que não casa por bubble_id, no mesmo formato das 480: ANO, MÊS,
// Falta #, Solicitação #, a comprovação com o endereço do arquivo no Bubble,
// funcionário e autorizador pelo bubble_id de usuarios, período pelo bubble_id
// de pessoal_faltas_justificadas_periodo. Fica de fora (e é contado): falta
// sem data, funcionário que não resolve e a que já tem no Confluir o mesmo
// funcionário na mesma data (lançada à mão). Como as 480, entra sem ausência
// espelhada (pessoal_ausencias), que no fluxo novo nasce da autorização.
//
// USO:
//   node scripts/migrar-faltas-justificadas-bubble.mjs            (simulação)
//   node scripts/migrar-faltas-justificadas-bubble.mjs --apply
// ===========================================================================
import { readFileSync } from "node:fs"
import { createClient } from "@supabase/supabase-js"

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
const db = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } })
const SINDIPETRO = "c763cb99-edfd-4840-8453-ed3fcb66d4a1"

async function todos(tipo) {
  const out = []
  for (let cursor = 0; ; ) {
    const r = await fetch(`${BASE}/obj/${tipo}?limit=100&cursor=${cursor}`, { headers: HB })
    if (!r.ok) throw new Error(`${tipo}: HTTP ${r.status}`)
    const j = (await r.json()).response
    out.push(...j.results)
    if (!j.remaining) break
    cursor += j.results.length
    await new Promise((s) => setTimeout(s, 150))
  }
  return out
}

/** Data do Bubble vem em UTC às 03:00 (meia-noite de Brasília): o dia é o da string. */
const dia = (v) => (v ? String(v).slice(0, 10) : null)

const bubble = await todos("pessoal-faltasjustificadas")
const { data: aqui, error } = await db
  .from("pessoal_faltas_justificadas")
  .select("bubble_id, funcionario_id, data_falta")
  .range(0, 9999)
if (error) throw error
const jaVeio = new Set(aqui.filter((a) => a.bubble_id).map((a) => a.bubble_id))
const novas = bubble.filter((b) => !jaVeio.has(b._id))

const refsUsuario = [...new Set(novas.flatMap((b) => [b["FUNCIONÁRIO"], b["AUTORIZADOR"], b["Created By"]]).filter(Boolean))]
const { data: us } = refsUsuario.length ? await db.from("usuarios").select("id, bubble_id").in("bubble_id", refsUsuario) : { data: [] }
const usuario = new Map(us.map((u) => [u.bubble_id, u.id]))
const refsPeriodo = [...new Set(novas.map((b) => b["PERÍODO"]).filter(Boolean))]
const { data: ps } = refsPeriodo.length
  ? await db.from("pessoal_faltas_justificadas_periodo").select("id, bubble_id, emp_proprietaria_id").in("bubble_id", refsPeriodo)
  : { data: [] }
const periodo = new Map(ps.map((p) => [p.bubble_id, p]))

const fora = { semData: 0, semFuncionario: 0, jaLancada: 0 }
const linhas = []
for (const b of novas) {
  const data_falta = dia(b["Data da falta"])
  const funcionario_id = usuario.get(b["FUNCIONÁRIO"]) ?? null
  if (!data_falta) { fora.semData++; continue }
  if (!funcionario_id) { fora.semFuncionario++; continue }
  if (aqui.some((a) => a.funcionario_id === funcionario_id && a.data_falta === data_falta)) { fora.jaLancada++; continue }
  const p = periodo.get(b["PERÍODO"])
  linhas.push({
    bubble_id: b._id,
    funcionario_id,
    data_falta,
    justificativa_tipo: b["Justificativa (tipo)"] ?? null,
    comprovacao: b["Comprovação"] ?? null,
    autorizado: b["Autorizado?"] === true,
    data_autorizacao: dia(b["Data da autorização"]),
    autorizador_id: usuario.get(b["AUTORIZADOR"]) ?? null,
    falta_numero: b["Falta #"] ?? null,
    solicitacao_numero: b["Solicitação #"] ?? null,
    ano: b.ANO ?? null,
    mes: b["MÊS"] ?? null,
    periodo_id: p?.id ?? null,
    emp_proprietaria_id: p?.emp_proprietaria_id ?? SINDIPETRO,
    created_at: b["Created Date"] ?? undefined,
  })
}

console.log(`Bubble: ${bubble.length} · já no Confluir: ${bubble.length - novas.length} · só no Bubble: ${novas.length}`)
console.log(`A inserir: ${linhas.length} (${linhas.filter((l) => l.autorizado).length} autorizadas)`)
console.log(`Fora: ${fora.semData} sem data da falta · ${fora.semFuncionario} sem funcionário no cadastro · ${fora.jaLancada} já lançadas à mão`)
console.log(`Sem período: ${linhas.filter((l) => !l.periodo_id).length} · sem autorizador: ${linhas.filter((l) => l.autorizado && !l.autorizador_id).length}`)
console.log(`Datas das faltas: ${linhas.map((l) => l.data_falta).sort()[0] ?? "—"} a ${linhas.map((l) => l.data_falta).sort().at(-1) ?? "—"}`)

if (!APLICAR) {
  console.log("\nSimulação: nada gravado. Use --apply para inserir.")
  process.exit(0)
}
if (linhas.length === 0) {
  console.log("Nada a inserir.")
  process.exit(0)
}
const { data: ins, error: e2 } = await db.from("pessoal_faltas_justificadas").insert(linhas).select("id")
if (e2) throw e2
console.log(`Inseridas: ${ins.length}.`)
