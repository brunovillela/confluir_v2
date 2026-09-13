// ===========================================================================
// migrar-cat-bubble.mjs — CATs do Bubble para saude_cat (módulo Saúde).
//
// A carga inicial (20/07/2026) veio de um CSV exportado do Bubble e passou
// pelas funções public.cat_* do SQL. Este script lê o Bubble direto pela Data
// API e converte cada campo com as MESMAS regras que a importação do painel
// usa (src/lib/saude-campos.ts + src/lib/saude-normalizacao.ts, que espelham
// o SQL), para que registro novo entre igual aos antigos:
//
//   1. INSERE as CATs que só existem no Bubble (casamento por Supabase_id ou
//      bubble_id). Número de CAT que já existe aqui com outro bubble_id NÃO
//      entra: é listado para decisão (reenvio em duplicidade).
//   2. COMPLETA campos vazios aqui que estão preenchidos lá.
//   3. APLICA edições feitas no Bubble depois da última gravação daqui
//      (Modified Date > updated_at + 10 min). Edição mais recente no Confluir
//      é preservada. Valor vazio no Bubble não apaga valor daqui.
//   4. Recalcula `descricao_truncada` (fila de revisão) com a regra do painel:
//      campo 31/32/34/45 com descrição e sem código oficial.
//   5. --documentos: traz o "00 Arquivo" do CDN do Bubble para o bucket
//      privado `saude` (cat/<id>/...).
//
// Nunca apaga. `filiado_id` (ligação manual feita no Confluir) não é tocado.
//
// Baixa o Bubble a cada execução (as CATs sobem em lote no Bubble; cache
// velho perderia as novas). --cache reaproveita o último download.
//
// USO:
//   node scripts/migrar-cat-bubble.mjs                    (dry-run, com exemplos)
//   node scripts/migrar-cat-bubble.mjs --apply
//   node scripts/migrar-cat-bubble.mjs --documentos [--apply] [--limite 5]
// ===========================================================================

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs"
import { createRequire } from "node:module"
import { randomUUID } from "node:crypto"
import { join } from "node:path"

const args = process.argv.slice(2)
const APLICAR = args.includes("--apply")
const DOCUMENTOS = args.includes("--documentos")
const USAR_CACHE = args.includes("--cache")
const LIMITE = (() => { const i = args.indexOf("--limite"); return i >= 0 ? Number(args[i + 1]) || null : null })()
const CACHE = ".auditoria-bubble"
const ARQUIVO_CACHE = join(CACHE, "saudecat.json")
const TIPO = "saúdecat"
const TENANT = "c763cb99-edfd-4840-8453-ed3fcb66d4a1"
const FOLGA_MS = 10 * 60 * 1000

const env = Object.fromEntries(
  readFileSync(".env.local", "utf8").split(/\r?\n/).filter((l) => l.includes("=")).map((l) => {
    const i = l.indexOf("=")
    return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, "")]
  })
)
const req = createRequire(join(process.cwd(), "package.json"))
const { createClient } = req("@supabase/supabase-js")
const db = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } })
const BASE = (env.BUBBLE_API_ROOT || "").replace(/\/+$/, "").replace(/\/obj$/, "").replace("/version-test", "")
const TOKEN = env.BUBBLE_API_TOKEN

// As regras de conversão do app, carregadas do TypeScript (alias @/ → src/).
const { createJiti } = req("jiti")
const jiti = createJiti(import.meta.url, { alias: { "@/": join(process.cwd(), "src") + "/" } })
const { acharCampo, valorParaColunas, CAMPOS_CAT, CAMPOS_COM_CODIGO_OFICIAL } = await jiti.import(join(process.cwd(), "src/lib/saude-campos.ts"))

console.log(APLICAR ? "MODO APLICAR — vai gravar." : "DRY-RUN — nada será gravado.")

// ── leitura ────────────────────────────────────────────────────────────────

async function baixarBubble() {
  if (USAR_CACHE && existsSync(ARQUIVO_CACHE)) return JSON.parse(readFileSync(ARQUIVO_CACHE, "utf8"))
  process.stdout.write("Baixando CATs do Bubble")
  const linhas = []
  for (let cursor = 0; ; ) {
    const params = new URLSearchParams({ limit: "100", cursor: String(cursor), sort_field: "Created Date", descending: "false" })
    let r
    for (let t = 1; t <= 4; t++) {
      r = await fetch(`${BASE}/obj/${encodeURIComponent(TIPO)}?${params}`, { headers: { Authorization: `Bearer ${TOKEN}` } })
      if (r.status === 200) break
      await new Promise((ok) => setTimeout(ok, 800 * t))
    }
    if (r.status !== 200) throw new Error(`Bubble ${TIPO} em ${cursor}: ${r.status}`)
    const j = await r.json()
    const res = j.response?.results ?? []
    linhas.push(...res)
    cursor += res.length
    if (cursor % 2000 < 100) process.stdout.write(".")
    if (res.length === 0 || (j.response?.remaining ?? 0) === 0) break
  }
  console.log(` ${linhas.length}`)
  mkdirSync(CACHE, { recursive: true })
  writeFileSync(ARQUIVO_CACHE, JSON.stringify(linhas))
  return linhas
}

async function lerTudo(tabela, colunas, comTenant = true) {
  const linhas = []
  for (let de = 0; ; de += 1000) {
    let q = db.from(tabela).select(colunas).order("id", { ascending: true }).range(de, de + 999)
    if (comTenant) q = q.eq("emp_proprietaria_id", TENANT)
    const { data, error } = await q
    if (error) throw new Error(`${tabela}: ${error.message}`)
    linhas.push(...data)
    if (data.length < 1000) break
  }
  return linhas
}

// ── conversão ──────────────────────────────────────────────────────────────

const vazio = (v) => v === undefined || v === null || (typeof v === "string" && v.trim() === "")
const dataSP = (iso) => new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date(iso))

/** Valor do Bubble → texto que a normalização do app espera. */
function paraTexto(bruto, tipoBubble) {
  if (vazio(bruto)) return ""
  if (typeof bruto === "boolean") return bruto ? "true" : "false"
  // Campo date do Bubble chega em ISO UTC (meia-noite de SP = 03:00Z): o dia
  // é o de São Paulo, não o do prefixo UTC.
  if (tipoBubble === "date") return dataSP(bruto)
  return String(bruto)
}

// Campo numerado do Bubble ("19 - ACIDENTE Data do acidente") → campo do
// formulário, pela numeração — a mesma chave da importação por planilha.
function mapaDeCampos(meta) {
  const def = meta[TIPO]
  const mapa = []
  const semCampo = []
  for (const f of def.fields) {
    const campo = acharCampo(f.display)
    if (campo) mapa.push({ rotulo: f.display, tipoBubble: f.type, campo })
    else if (!/^(Created|Modified|unique|Slug|Supabase_id)/.test(f.display)) semCampo.push(f.display)
  }
  const numeros = new Set(mapa.map((m) => m.campo.n))
  const faltando = CAMPOS_CAT.filter((c) => !numeros.has(c.n)).map((c) => c.n)
  return { mapa, semCampo, faltando }
}

function registroDoBubble(r, mapa, empresaPorBubble) {
  let reg = {}
  for (const { rotulo, tipoBubble, campo } of mapa) {
    const bruto = r[rotulo]
    if (vazio(bruto)) continue
    reg = { ...reg, ...valorParaColunas(campo, paraTexto(bruto, tipoBubble)) }
  }
  for (const k of Object.keys(reg)) if (reg[k] === null) delete reg[k]
  const emp = r["00 EMPREGADOR"] ? empresaPorBubble.get(r["00 EMPREGADOR"]) : null
  if (emp) reg.empregador_id = emp
  if (r["00 Arquivo"]) reg.arquivo_url = String(r["00 Arquivo"])
  return reg
}

/** Mesma regra de src/app/painel/saude/cat/actions.ts (marcarTruncada). */
function truncada(linha) {
  return CAMPOS_COM_CODIGO_OFICIAL.some((numero) => {
    const campo = CAMPOS_CAT.find((c) => c.n === numero)
    return campo?.colunaCodigo && linha[campo.coluna] != null && linha[campo.colunaCodigo] == null
  })
}

function igual(a, b) {
  if (vazio(a) && vazio(b)) return true
  if (vazio(a) || vazio(b)) return false
  if (typeof a === "number" || typeof b === "number") return Number(a) === Number(b)
  if (typeof a === "boolean" || typeof b === "boolean") return String(a) === String(b)
  return String(a).trim() === String(b).trim()
}

// ── registros ──────────────────────────────────────────────────────────────

async function migrarRegistros() {
  const meta = (await (await fetch(`${BASE}/meta`, { headers: { Authorization: `Bearer ${TOKEN}` } })).json()).types ?? {}
  if (!meta[TIPO]) throw new Error(`Tipo ${TIPO} não exposto no /meta do Bubble.`)
  const { mapa, semCampo, faltando } = mapaDeCampos(meta)
  console.log(`Campos do Bubble casados com o formulário: ${mapa.length}${faltando.length ? ` · campos do formulário sem par no Bubble: ${faltando.join(", ")}` : ""}`)
  if (semCampo.length) console.log(`  fora do formulário: ${semCampo.join(" · ")}`)

  const [bubble, aqui, empresas] = await Promise.all([
    baixarBubble(),
    lerTudo("saude_cat", "*"),
    lerTudo("empresa", "id, bubble_id", false),
  ])
  const empresaPorBubble = new Map(empresas.filter((e) => e.bubble_id).map((e) => [e.bubble_id, e.id]))
  const porId = new Map(aqui.map((a) => [a.id, a]))
  const porBubble = new Map(aqui.filter((a) => a.bubble_id).map((a) => [a.bubble_id, a]))
  const porNumero = new Map()
  for (const a of aqui) if (a.numero_cat) porNumero.set(a.numero_cat, a)

  const inserir = []
  const atualizar = []
  const duplicadasPorNumero = []
  const semConteudo = []
  const preencher = {}
  const editar = {}
  const exemplos = {}
  let preservadas = 0
  const soma = (m, k) => (m[k] = (m[k] ?? 0) + 1)
  const exemplo = (k, antes, depois) => { exemplos[k] ??= []; if (exemplos[k].length < 3) exemplos[k].push([antes, depois]) }
  const numerosNovos = new Set()

  for (const r of bubble) {
    const atual = (r.Supabase_id && porId.get(r.Supabase_id)) || porBubble.get(r._id)
    const reg = registroDoBubble(r, mapa, empresaPorBubble)

    if (!atual) {
      if (!reg.trabalhador_nome && !reg.data_acidente && !reg.numero_cat) { semConteudo.push(r); continue }
      const dono = reg.numero_cat ? porNumero.get(reg.numero_cat) : null
      if (dono || (reg.numero_cat && numerosNovos.has(reg.numero_cat))) {
        duplicadasPorNumero.push({ bubble: r._id, numero: reg.numero_cat, jaAqui: dono?.id ?? "(repetida no próprio lote)" })
        continue
      }
      if (reg.numero_cat) numerosNovos.add(reg.numero_cat)
      const linha = { ...reg, bubble_id: r._id, emp_proprietaria_id: TENANT, created_at: r["Created Date"], updated_at: r["Modified Date"] ?? r["Created Date"] }
      linha.descricao_truncada = truncada(linha)
      inserir.push(linha)
      continue
    }

    const referencia = new Date(atual.updated_at ?? atual.created_at).getTime()
    const bubbleMaisNovo = r["Modified Date"] && new Date(r["Modified Date"]).getTime() > referencia + FOLGA_MS
    if (!bubbleMaisNovo && r["Modified Date"] && new Date(atual.updated_at ?? 0).getTime() > new Date(r["Modified Date"]).getTime() + FOLGA_MS && atual.updated_at !== atual.created_at) preservadas++

    const patch = {}
    for (const [coluna, v] of Object.entries(reg)) {
      if (vazio(atual[coluna])) {
        patch[coluna] = v; soma(preencher, coluna); exemplo(`preencher ${coluna}`, atual[coluna], v)
      } else if (bubbleMaisNovo && !igual(atual[coluna], v)) {
        patch[coluna] = v; soma(editar, coluna); exemplo(`editar ${coluna}`, atual[coluna], v)
      }
    }
    if (Object.keys(patch).length) {
      const t = truncada({ ...atual, ...patch })
      if (t !== atual.descricao_truncada) { patch.descricao_truncada = t; soma(editar, "descricao_truncada (recalculado)") }
      if (bubbleMaisNovo) patch.updated_at = r["Modified Date"]
      atualizar.push([atual.id, patch])
    }
  }

  const idsBubble = new Set(bubble.map((r) => r._id))
  const sumiram = aqui.filter((a) => a.bubble_id && !idsBubble.has(a.bubble_id)).length
  const anoCriacao = {}
  for (const l of inserir) soma(anoCriacao, String(l.created_at).slice(0, 7))

  console.log(`\nBubble ${bubble.length} · aqui ${aqui.length} · inserir ${inserir.length} · atualizar ${atualizar.length}`)
  if (Object.keys(anoCriacao).length) console.log(`  novas por mês de criação no Bubble: ${Object.entries(anoCriacao).sort().map(([k, n]) => `${k}:${n}`).join("  ")}`)
  if (inserir.length) {
    const truncadas = inserir.filter((l) => l.descricao_truncada).length
    console.log(`  novas na fila de revisão (sem código oficial): ${truncadas} · com CPF: ${inserir.filter((l) => l.trabalhador_cpf).length} · com empregador vinculado: ${inserir.filter((l) => l.empregador_id).length} · com arquivo: ${inserir.filter((l) => l.arquivo_url).length}`)
    const sem = inserir.filter((l) => !l.trabalhador_nome || !l.data_acidente).length
    if (sem) console.log(`  ⚠ ${sem} nova(s) sem nome do acidentado ou data do acidente (a tela exige os dois ao cadastrar)`)
  }
  if (semConteudo.length) console.log(`  ${semConteudo.length} registro(s) vazios no Bubble (sem nome, data e número) — não entram`)
  if (duplicadasPorNumero.length) {
    console.log(`  ⚠ ${duplicadasPorNumero.length} com número de CAT que já existe aqui (não entram):`)
    for (const d of duplicadasPorNumero.slice(0, 15)) console.log(`     ${d.numero} · Bubble ${d.bubble} · aqui ${d.jaAqui}`)
  }
  if (preservadas) console.log(`  ${preservadas} editadas no Confluir depois do Bubble (preservadas)`)
  if (sumiram) console.log(`  ${sumiram} com bubble_id que não existe mais no Bubble (mantidas)`)
  for (const [c, n] of Object.entries(preencher).sort((a, b) => b[1] - a[1])) console.log(`    preencher ${String(n).padStart(6)}  ${c}`)
  for (const [c, n] of Object.entries(editar).sort((a, b) => b[1] - a[1])) console.log(`    editar    ${String(n).padStart(6)}  ${c}`)
  if (!APLICAR) {
    const chaves = Object.keys(exemplos).slice(0, 12)
    if (chaves.length) console.log("\n  exemplos (aqui → Bubble):")
    for (const k of chaves) for (const [a, b] of exemplos[k]) console.log(`    ${k}: ${JSON.stringify(a)} → ${JSON.stringify(b)}`)
    if (inserir[0]) console.log(`\n  exemplo de CAT nova: ${JSON.stringify(inserir.at(-1)).slice(0, 900)}`)
    return
  }

  for (let de = 0; de < inserir.length; de += 500) {
    const lote = inserir.slice(de, de + 500)
    const { error } = await db.from("saude_cat").insert(lote)
    if (error) throw new Error(`insert a partir de ${de}: ${error.message} (as anteriores já foram gravadas; rodar de novo não duplica)`)
  }
  let feitos = 0
  for (const [id, patch] of atualizar) {
    const { error } = await db.from("saude_cat").update(patch).eq("id", id)
    if (error) throw new Error(`update ${id}: ${error.message}`)
    if (++feitos % 1000 === 0) process.stdout.write(".")
  }
  console.log(`\nGravado: ${inserir.length} inseridas, ${feitos} atualizadas. O painel da Saúde atualiza em até 10 minutos (cache das facetas).`)
}

// ── documentos ─────────────────────────────────────────────────────────────

const ehCdn = (v) => typeof v === "string" && (v.startsWith("//") || /^https?:\/\/[^/]*(bubble|amazonaws)/i.test(v))
function tipoDoArquivo(buf) {
  if (buf.subarray(0, 5).toString("latin1") === "%PDF-") return { ext: "pdf", mime: "application/pdf" }
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return { ext: "jpg", mime: "image/jpeg" }
  if (buf[0] === 0x89 && buf.subarray(1, 4).toString("latin1") === "PNG") return { ext: "png", mime: "image/png" }
  return null
}

async function migrarDocumentos() {
  const linhas = (await lerTudo("saude_cat", "id, arquivo_url")).filter((l) => ehCdn(l.arquivo_url))
  const alvo = LIMITE ? linhas.slice(0, LIMITE) : linhas
  console.log(`Arquivos de CAT no CDN do Bubble: ${linhas.length}${LIMITE ? ` (limite ${LIMITE})` : ""}`)
  if (!APLICAR) return
  let ok = 0
  const falhas = []
  for (const l of alvo) {
    const url = l.arquivo_url.startsWith("//") ? `https:${l.arquivo_url}` : l.arquivo_url
    try {
      const r = await fetch(url)
      const buf = Buffer.from(await r.arrayBuffer())
      const tipo = r.ok && buf.length ? tipoDoArquivo(buf) : null
      if (!tipo) { falhas.push(`${l.id}: ${r.ok ? (buf.length ? "formato não reconhecido" : "arquivo vazio") : `HTTP ${r.status}`}`); continue }
      const caminho = `cat/${l.id}/arquivo-${randomUUID().slice(0, 8)}.${tipo.ext}`
      const up = await db.storage.from("saude").upload(caminho, buf, { contentType: tipo.mime })
      if (up.error) { falhas.push(`${l.id}: upload ${up.error.message}`); continue }
      const { error } = await db.from("saude_cat").update({ arquivo_url: caminho }).eq("id", l.id)
      if (error) { await db.storage.from("saude").remove([caminho]); falhas.push(`${l.id}: update ${error.message}`); continue }
      ok++
    } catch (e) {
      falhas.push(`${l.id}: ${e.message}`)
    }
  }
  console.log(`Migrados ${ok} de ${alvo.length}.`)
  for (const f of falhas.slice(0, 30)) console.log(`  falha ${f}`)
}

try {
  if (DOCUMENTOS) await migrarDocumentos()
  else await migrarRegistros()
} catch (e) {
  console.error(`\nERRO: ${e.message}`)
  process.exit(1)
}
