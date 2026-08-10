// ===========================================================================
// backfill-patrimonio.mjs — POPULA as 5 tabelas de patrimônio a partir dos
// CSVs exportados do Bubble (elas vieram vazias da migração).
// ---------------------------------------------------------------------------
// SEGURANÇA:
//   • DRY-RUN por padrão: só RELATA o que faria. Passe --apply para gravar.
//   • Idempotente: upsert por `bubble_id` (re-rodar não duplica).
//   • Trava no TENANT REAL (emp_proprietaria_id) — não toca demo/outros.
//   • Referências resolvidas por `bubble_id`:
//       recinto/NF/item cruzam por unique id do Bubble → uuid Supabase;
//       EMP PROPRIETARIA/FORNECEDOR → empresa.bubble_id;
//       RESPONSÁVEL/FUNCIONÁRIO vêm como NOME (o export é "modified"),
//         casados contra usuarios.nome_completo (preferência a staff).
//   • RESPONSÁVEL CAUTELA (detentor atual) é DERIVADO das cautelas em aberto.
//
// USO:
//   node scripts/backfill-patrimonio.mjs            (dry-run)
//   node scripts/backfill-patrimonio.mjs --apply    (grava)
// ===========================================================================

import { readFileSync } from "node:fs"
import * as XLSX from "xlsx"

const APLICAR = process.argv.includes("--apply")
const TENANT = "c763cb99-edfd-4840-8453-ed3fcb66d4a1"
const DIR = "C:/Users/nomos/Downloads/"
const ARQ = {
  recinto: "export_All-Patrim-nio---Recintos-modified_2026-08-10_17-22-21.csv",
  nf: "export_All-Patrim-nio---Nota-fiscals-modified_2026-08-10_17-22-51.csv",
  item: "export_All-Patrim-nio---Items-modified_2026-08-10_17-23-40.csv",
  itemResp:
    "export_All-Patrim-nio---Item---Respons-vels-modified_2026-08-10_17-24-51.csv",
  recResp:
    "export_All-Patrim-nio---Recinto---Respons-vels-modified_2026-08-10_17-26-23.csv",
}

// ── helpers ─────────────────────────────────────────────────────────────────
const norm = (s) =>
  String(s ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim()

const txt = (v) => {
  const s = String(v ?? "").trim()
  return s === "" ? null : s
}

const bool = (v) => {
  const s = norm(v)
  if (s === "sim") return true
  if (s === "nao") return false
  return null
}

const MESES = { jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5, jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11 }
/** "Dec 13, 2023 12:00 am" → { date:'2023-12-13', iso:'2023-12-13T00:00:00.000Z' } */
function parseData(s) {
  const m = String(s ?? "").trim().match(/^([A-Za-z]{3}) (\d{1,2}), (\d{4})(?: (\d{1,2}):(\d{2}) (am|pm))?/i)
  if (!m) return null
  const mon = MESES[m[1].toLowerCase()]
  if (mon === undefined) return null
  let h = m[4] ? parseInt(m[4], 10) : 0
  const min = m[5] ? parseInt(m[5], 10) : 0
  const ap = m[6] ? m[6].toLowerCase() : null
  if (ap === "pm" && h < 12) h += 12
  if (ap === "am" && h === 12) h = 0
  const y = parseInt(m[3], 10), d = parseInt(m[2], 10)
  const dd = String(d).padStart(2, "0"), mm = String(mon + 1).padStart(2, "0")
  return { date: `${y}-${mm}-${dd}`, iso: new Date(Date.UTC(y, mon, d, h, min)).toISOString() }
}

function mapSede(v) {
  const s = norm(v)
  if (!s) return null
  if (s.startsWith("campos")) return "Campos"
  if (s === "macae") return "Macaé"
  if (s.includes("rio das ostras")) return "Rio das Ostras"
  if (s.startsWith("quissam")) return "Quissamã"
  if (s.startsWith("carapebus")) return "Carapebus"
  return "Outro"
}

/** URL de arquivo do Bubble (`//host/...`) → https absoluto. */
function urlArquivo(v) {
  const s = txt(v)
  if (!s) return null
  if (s.startsWith("//")) return `https:${s}`
  return s
}

const parse = (f) => {
  const wb = XLSX.read(readFileSync(DIR + f, "utf8"), { type: "string" })
  return XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { defval: null, raw: false })
}

// ── supabase (service role) ──────────────────────────────────────────────────
const env = Object.fromEntries(
  readFileSync(".env.local", "utf8").split(/\r?\n/).filter((l) => l.includes("=")).map((l) => {
    const i = l.indexOf("="); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, "")]
  })
)
const { createClient } = await import("@supabase/supabase-js")
const admin = createClient(env.NEXT_PUBLIC_SUPABASE_URL || env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } })

console.log(`\n=== BACKFILL PATRIMÔNIO · ${APLICAR ? "APLICAR (grava)" : "DRY-RUN"} · tenant ${TENANT} ===`)

// ── mapas de referência ──────────────────────────────────────────────────────
async function carregarTudo(tabela, colunas) {
  const linhas = []
  let de = 0
  for (;;) {
    const { data, error } = await admin.from(tabela).select(colunas).range(de, de + 999)
    if (error) throw new Error(`ler ${tabela}: ${error.message}`)
    linhas.push(...data)
    if (data.length < 1000) break
    de += 1000
  }
  return linhas
}

// empresa (fornecedor/emp): bubble_id → uuid
const empresaMap = new Map()
for (const e of await carregarTudo("empresa", "id, bubble_id")) {
  if (e.bubble_id) empresaMap.set(String(e.bubble_id), e.id)
}
const empTenant = empresaMap.get("1665512503308x967124311978278900") ?? TENANT

// usuarios: nome_completo normalizado → [ids], com marca de staff (tem permissoes)
const staff = new Set(
  (await carregarTudo("permissoes", "usuario_id")).map((p) => String(p.usuario_id ?? "")).filter(Boolean)
)
const nomeMap = new Map()
// Inclui INATIVOS de propósito: cautela é histórica — o detentor pode já ter
// saído da instituição. Só exclui deletados (LGPD).
for (const u of await carregarTudo("usuarios", "id, nome_completo, inativo, deletado")) {
  if (u.deletado === true) continue
  const n = norm(u.nome_completo)
  if (!n) continue
  if (!nomeMap.has(n)) nomeMap.set(n, [])
  nomeMap.get(n).push(u.id)
}
const nomesNaoResolvidos = new Set()
function resolverUsuario(nome) {
  const n = norm(nome)
  if (!n) return null
  const cand = nomeMap.get(n)
  if (!cand || cand.length === 0) { nomesNaoResolvidos.add(`${nome} (sem match)`); return null }
  if (cand.length === 1) return cand[0]
  const staffCand = cand.filter((id) => staff.has(id))
  if (staffCand.length === 1) return staffCand[0]
  nomesNaoResolvidos.add(`${nome} (ambíguo: ${cand.length} usuários${staffCand.length ? `, ${staffCand.length} staff` : ""})`)
  return (staffCand[0] ?? cand[0]) // pega o 1º (preferindo staff) e registra o aviso
}
console.log(`refs: empresa=${empresaMap.size} · usuarios=${nomeMap.size} nomes · staff=${staff.size}`)

// ── upsert em lote ───────────────────────────────────────────────────────────
async function upsert(tabela, linhas) {
  if (!APLICAR) return { count: linhas.length }
  let gravadas = 0
  for (let i = 0; i < linhas.length; i += 500) {
    const lote = linhas.slice(i, i + 500)
    let erro
    for (let tent = 1; tent <= 5; tent++) {
      const r = await admin.from(tabela).upsert(lote, { onConflict: "bubble_id" }).select("id")
      if (!r.error) { gravadas += (r.data?.length ?? 0); erro = null; break }
      erro = r.error
      await new Promise((res) => setTimeout(res, 400 * tent))
    }
    if (erro) { console.error(`  ✗ upsert ${tabela}:`, erro.message); throw erro }
  }
  return { count: gravadas }
}

async function mapaBubble(tabela) {
  const m = new Map()
  for (const r of await carregarTudo(tabela, "id, bubble_id")) {
    if (r.bubble_id) m.set(String(r.bubble_id), r.id)
  }
  return m
}

// ── 1. RECINTOS ──────────────────────────────────────────────────────────────
{
  const src = parse(ARQ.recinto)
  const linhas = src.map((r) => {
    const cd = parseData(r["Creation Date"])
    return {
      bubble_id: txt(r["unique id"]),
      emp_proprietaria_id: empresaMap.get(txt(r["EMP PROPRIETARIA"])) ?? empTenant,
      nome_recinto: txt(r["Nome do recinto"]),
      codigo: txt(r["Código"]),
      descricao_fisica: txt(r["Descrição física"]),
      sede: mapSede(r["SEDE"]),
      ...(cd ? { created_at: cd.iso } : {}),
    }
  }).filter((r) => r.bubble_id)
  const { count } = await upsert("patrimonio_recinto", linhas)
  console.log(`1. recintos: ${src.length} lidos → ${count} ${APLICAR ? "gravados" : "(dry-run)"}`)
}
const recintoMap = APLICAR ? await mapaBubble("patrimonio_recinto") : new Map(parse(ARQ.recinto).map((r) => [txt(r["unique id"]), "«id»"]))

// ── 2. NOTAS FISCAIS ─────────────────────────────────────────────────────────
{
  const src = parse(ARQ.nf)
  let semForn = 0
  const linhas = src.map((r) => {
    const cd = parseData(r["Creation Date"])
    const emis = parseData(r["Data da emissão"])
    const forn = empresaMap.get(txt(r["FORNECEDOR"])) ?? null
    if (txt(r["FORNECEDOR"]) && !forn) semForn++
    return {
      bubble_id: txt(r["unique id"]),
      emp_proprietaria_id: empresaMap.get(txt(r["EMP PROPRIETARIA"])) ?? empTenant,
      entrada: bool(r["Entrada?"]),
      numero_nota: txt(r["Número da nota"]),
      data_emissao: emis ? emis.date : null,
      arquivo_nota: urlArquivo(r["Arquivo nota"]),
      fornecedor_id: forn,
      ...(cd ? { created_at: cd.iso } : {}),
    }
  }).filter((r) => r.bubble_id)
  const { count } = await upsert("patrimonio_nota_fiscal", linhas)
  console.log(`2. notas fiscais: ${src.length} lidos → ${count} ${APLICAR ? "gravados" : "(dry-run)"}${semForn ? ` · fornecedor não resolvido: ${semForn}` : ""}`)
}
const nfMap = APLICAR ? await mapaBubble("patrimonio_nota_fiscal") : new Map(parse(ARQ.nf).map((r) => [txt(r["unique id"]), "«id»"]))

// ── 3. ITENS ─────────────────────────────────────────────────────────────────
{
  const src = parse(ARQ.item)
  let semRecinto = 0, semNf = 0
  const linhas = src.map((r) => {
    const cd = parseData(r["Creation Date"])
    const recBubble = txt(r["RECINTO"])
    const recinto_id = recBubble ? (recintoMap.get(recBubble) ?? null) : null
    if (recBubble && !recinto_id) semRecinto++
    const nfeBubble = txt(r["NOTA FISCAL ENTRADA"])
    const nfsBubble = txt(r["NOTA FISCAL SAÍDA"])
    const nfe = nfeBubble ? (nfMap.get(nfeBubble) ?? null) : null
    const nfs = nfsBubble ? (nfMap.get(nfsBubble) ?? null) : null
    if ((nfeBubble && !nfe) || (nfsBubble && !nfs)) semNf++
    return {
      bubble_id: txt(r["unique id"]),
      emp_proprietaria_id: empresaMap.get(txt(r["EMP PROPRIETARIA"])) ?? empTenant,
      nome: txt(r["Nome"]),
      descricao: txt(r["Descrição"]),
      numero_patrimonio: txt(r["Número de patrimônio"]),
      numero_patrimonio_antigo: txt(r["Número de patrimônio antigo"]),
      numero_unico: txt(r["Número único"]),
      ativo: bool(r["Ativo?"]) ?? true,
      recinto_id: APLICAR ? recinto_id : null,
      nota_fiscal_entrada_id: APLICAR ? nfe : null,
      nota_fiscal_saida_id: APLICAR ? nfs : null,
      ...(cd ? { created_at: cd.iso } : {}),
    }
  }).filter((r) => r.bubble_id)
  const { count } = await upsert("patrimonio_item", linhas)
  console.log(`3. itens: ${src.length} lidos → ${count} ${APLICAR ? "gravados" : "(dry-run)"} · recinto não resolvido: ${semRecinto} · NF não resolvida: ${semNf}`)
}
const itemMap = APLICAR ? await mapaBubble("patrimonio_item") : new Map(parse(ARQ.item).map((r) => [txt(r["unique id"]), "«id»"]))

// ── 4. ITEM — RESPONSÁVEL (cautelas) ─────────────────────────────────────────
const cautelasAbertas = [] // { item_id, responsavel_id } p/ derivar detentor atual
{
  const src = parse(ARQ.itemResp)
  let semItem = 0, semResp = 0
  const linhas = src.map((r) => {
    const cd = parseData(r["Creation Date"])
    const ini = parseData(r["Início"])
    const fim = parseData(r["Término"])
    const itemBubble = txt(r["ITEM"])
    const item_id = itemBubble ? (itemMap.get(itemBubble) ?? null) : null
    if (itemBubble && !item_id) semItem++
    const responsavel_id = resolverUsuario(r["RESPONSÁVEL"])
    if (txt(r["RESPONSÁVEL"]) && !responsavel_id) semResp++
    if (APLICAR && item_id && responsavel_id && !fim) cautelasAbertas.push({ item_id, responsavel_id })
    return {
      bubble_id: txt(r["unique id"]),
      emp_proprietaria_id: empresaMap.get(txt(r["EMP PROPRIETARIA"])) ?? empTenant,
      item_id: APLICAR ? item_id : null,
      responsavel_id: APLICAR ? responsavel_id : null,
      inicio: ini ? ini.date : null,
      termino: fim ? fim.date : null,
      arquivo_cautela: urlArquivo(r["Arquivo da Cautela"]),
      ...(cd ? { created_at: cd.iso } : {}),
    }
  }).filter((r) => r.bubble_id && (!APLICAR || r.item_id)) // sem item não há FK válida
  const { count } = await upsert("patrimonio_item_responsavel", linhas)
  console.log(`4. cautelas (item-resp): ${src.length} lidos → ${count} ${APLICAR ? "gravados" : "(dry-run)"} · item não resolvido: ${semItem} · responsável não resolvido: ${semResp}`)
}

// ── 5. RECINTO — RESPONSÁVEL ─────────────────────────────────────────────────
{
  const src = parse(ARQ.recResp)
  let semRec = 0, semFunc = 0
  const linhas = src.map((r) => {
    const cd = parseData(r["Creation Date"])
    const ini = parseData(r["Início"])
    const fim = parseData(r["Término"])
    const recBubble = txt(r["RECINTO"])
    const recinto_id = recBubble ? (recintoMap.get(recBubble) ?? null) : null
    if (recBubble && !recinto_id) semRec++
    const funcionario_id = resolverUsuario(r["FUNCIONÁRIO"])
    if (txt(r["FUNCIONÁRIO"]) && !funcionario_id) semFunc++
    return {
      bubble_id: txt(r["unique id"]),
      emp_proprietaria_id: empresaMap.get(txt(r["EMP PROPRIETARIA"])) ?? empTenant,
      recinto_id: APLICAR ? recinto_id : null,
      funcionario_id: APLICAR ? funcionario_id : null,
      inicio: ini ? ini.date : null,
      termino: fim ? fim.date : null,
      atual: bool(r["Atual"]) ?? false,
      ...(cd ? { created_at: cd.iso } : {}),
    }
  }).filter((r) => r.bubble_id && (!APLICAR || r.recinto_id))
  const { count } = await upsert("patrimonio_recinto_responsavel", linhas)
  console.log(`5. recinto-resp: ${src.length} lidos → ${count} ${APLICAR ? "gravados" : "(dry-run)"} · recinto não resolvido: ${semRec} · funcionário não resolvido: ${semFunc}`)
}

// ── 6. detentor atual do item (derivado das cautelas em aberto) ──────────────
if (APLICAR && cautelasAbertas.length) {
  let ok = 0
  for (const c of cautelasAbertas) {
    const { error } = await admin
      .from("patrimonio_item")
      .update({ responsavel_cautela_id: c.responsavel_id })
      .eq("id", c.item_id)
      .eq("emp_proprietaria_id", TENANT)
    if (!error) ok++
  }
  console.log(`6. detentor atual gravado em ${ok}/${cautelasAbertas.length} itens (cautelas em aberto)`)
} else {
  console.log(`6. detentor atual: (dry-run — derivaria das cautelas em aberto)`)
}

// ── avisos de nomes ──────────────────────────────────────────────────────────
if (nomesNaoResolvidos.size) {
  console.log("\n⚠ Nomes de usuário com atenção:")
  for (const n of nomesNaoResolvidos) console.log("   ·", n)
}

console.log(`\n=== FIM ${APLICAR ? "(gravado)" : "(DRY-RUN — nada gravado; rode com --apply)"} ===\n`)
