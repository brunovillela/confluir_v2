// ===========================================================================
// migrar-contatos-bubble.mjs — e-mails, telefones e endereços do Bubble.
//
// Passo 4 da virada da Filiação. O Bubble guarda o contato em DOIS lugares:
// dentro do cadastro (dois telefones, dois e-mails, um endereço — isso veio)
// e em três tabelas próprias, com vários por pessoa (isso não veio: as
// tabelas daqui estavam vazias). Não é redundância: 8.961 filiados têm um
// e-mail nessas tabelas que o cadastro não tem, e 3.593 têm telefones a mais.
//
// O que faz:
//   1. Traz TODOS os contatos de filiado e de usuário para as tabelas
//      normalizadas daqui (emails, telefones, enderecos), casando por
//      bubble_id — a partir daí elas são a fonte de "outros contatos".
//      Endereço de empresa entra também (enderecos tem empresa_id); telefone
//      e e-mail de empresa NÃO têm coluna aqui e ficam de fora, contados.
//   2. Preenche no CADASTRO o que estava vazio: email_pessoal sem e-mail
//      ganha o favorito (ou o primeiro); telefone_2 vazio ganha um número
//      que não seja o telefone_1. Só coluna vazia — o cadastro nunca é
//      sobrescrito.
//
// Idempotente: contato com bubble_id já presente aqui não entra de novo.
// Valores normalizados: e-mail em minúsculas; telefone só dígitos, com DDD.
// Lê o cache de .auditoria-bubble/.
//
// USO:
//   node scripts/migrar-contatos-bubble.mjs            (dry-run)
//   node scripts/migrar-contatos-bubble.mjs --apply
// ===========================================================================

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs"
import { join } from "node:path"

const args = process.argv.slice(2)
const APLICAR = args.includes("--apply")
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

console.log(APLICAR ? "MODO APLICAR — vai gravar." : "DRY-RUN — nada será gravado.")

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

const texto = (v) => (typeof v === "string" && v.trim() !== "" ? v.trim() : null)
const email = (v) => {
  const t = texto(v)?.toLowerCase() ?? null
  return t && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(t) ? t : null
}
const fone = (v) => {
  const d = String(v ?? "").replace(/\D/g, "")
  return d.length >= 8 ? d : null
}

// ── leitura dos dois lados ─────────────────────────────────────────────────

const [emailsB, telefonesB, enderecosB, cadastrosB, usersB, empresasB] = await Promise.all([
  bubble("emails"),
  bubble("telefones"),
  bubble("endereços"),
  bubble("filiação"),
  bubble("user"),
  bubble("empresa"),
])
const [filiacoes, usuarios, empresas, emailsA, telefonesA, enderecosA] = await Promise.all([
  lerTudo("filiacoes", "id, bubble_id, email_pessoal, email_corporativo, telefone_1, telefone_2", (q) => q.eq("emp_proprietaria_id", TENANT)),
  lerTudo("usuarios", "id, bubble_id", (q) => q.eq("emp_proprietaria_id", TENANT)),
  lerTudo("empresa", "id, bubble_id"),
  lerTudo("emails", "id, bubble_id"),
  lerTudo("telefones", "id, bubble_id"),
  lerTudo("enderecos", "id, bubble_id"),
])
const filiado = resolvedor(cadastrosB, filiacoes)
const usuario = resolvedor(usersB, usuarios)
const empresa = resolvedor(empresasB, empresas)
const jaAqui = (lista) => new Set(lista.map((l) => l.bubble_id).filter(Boolean))
const emailsJa = jaAqui(emailsA), telefonesJa = jaAqui(telefonesA), enderecosJa = jaAqui(enderecosA)

/** Dono do contato, na ordem em que o Bubble o guarda. */
function dono(x) {
  if (x.FILIADO) return { filiado_id: filiado(x.FILIADO), tipo: "filiado" }
  if (x["USUÁRIO"]) return { usuario_id: usuario(x["USUÁRIO"]), tipo: "usuario" }
  if (x.EMPRESA) return { empresa_id: empresa(x.EMPRESA), tipo: "empresa" }
  return null
}

const contagem = () => ({ entram: 0, jaAqui: 0, semDono: 0, donoSemPar: 0, semValor: 0, empresaSemColuna: 0, duplicado: 0 })

// ── 1. e-mails ─────────────────────────────────────────────────────────────
const cE = contagem()
const emailsNovos = []
const emailsPorFiliado = new Map() // filiado_id → [{ email, favorito }]
{
  const vistos = new Set()
  for (const x of emailsB) {
    const v = email(x.Email)
    if (!v) { cE.semValor++; continue }
    const d = dono(x)
    if (!d) { cE.semDono++; continue }
    if (d.tipo === "empresa") { cE.empresaSemColuna++; continue }
    const idDono = d.filiado_id ?? d.usuario_id
    if (!idDono) { cE.donoSemPar++; continue }
    if (d.filiado_id) {
      const l = emailsPorFiliado.get(d.filiado_id) ?? []
      l.push({ email: v, favorito: x["É favorito?"] === true })
      emailsPorFiliado.set(d.filiado_id, l)
    }
    if (emailsJa.has(x._id)) { cE.jaAqui++; continue }
    const chave = `${idDono}|${v}`
    if (vistos.has(chave)) { cE.duplicado++; continue }
    vistos.add(chave)
    emailsNovos.push({
      bubble_id: x._id,
      emp_proprietaria_id: TENANT,
      email: v,
      tipo_email: texto(x["Tipo de email"]),
      pessoa_contato: texto(x["Pessoa de contato"]),
      favorito: x["É favorito?"] === true,
      filiado_id: d.filiado_id ?? null,
      usuario_id: d.usuario_id ?? null,
      created_at: x["Created Date"],
    })
    cE.entram++
  }
}

// ── 2. telefones ───────────────────────────────────────────────────────────
const cT = contagem()
const telefonesNovos = []
const fonesPorFiliado = new Map()
{
  const vistos = new Set()
  for (const x of telefonesB) {
    const v = fone(x.Telefone)
    if (!v) { cT.semValor++; continue }
    const d = dono(x)
    if (!d) { cT.semDono++; continue }
    if (d.tipo === "empresa") { cT.empresaSemColuna++; continue }
    const idDono = d.filiado_id ?? d.usuario_id
    if (!idDono) { cT.donoSemPar++; continue }
    if (d.filiado_id) {
      const l = fonesPorFiliado.get(d.filiado_id) ?? []
      l.push({ numero: v, favorito: x["É favorito?"] === true })
      fonesPorFiliado.set(d.filiado_id, l)
    }
    if (telefonesJa.has(x._id)) { cT.jaAqui++; continue }
    const chave = `${idDono}|${v}`
    if (vistos.has(chave)) { cT.duplicado++; continue }
    vistos.add(chave)
    telefonesNovos.push({
      bubble_id: x._id,
      emp_proprietaria_id: TENANT,
      numero: v,
      tipo: texto(x["Tipo de contato"]),
      whatsapp: x["Whatsapp?"] === true,
      favorito: x["É favorito?"] === true,
      filiado_id: d.filiado_id ?? null,
      usuario_id: d.usuario_id ?? null,
      created_at: x["Created Date"],
    })
    cT.entram++
  }
}

// ── 3. endereços ───────────────────────────────────────────────────────────
const cA = contagem()
const enderecosNovos = []
for (const x of enderecosB) {
  if (!texto(x.Logradouro) && !texto(x.CEP)) { cA.semValor++; continue }
  const d = dono(x)
  if (!d) { cA.semDono++; continue }
  const idDono = d.filiado_id ?? d.usuario_id ?? d.empresa_id
  if (!idDono) { cA.donoSemPar++; continue }
  if (enderecosJa.has(x._id)) { cA.jaAqui++; continue }
  enderecosNovos.push({
    bubble_id: x._id,
    emp_proprietaria_id: TENANT,
    cep: texto(x.CEP), logradouro: texto(x.Logradouro), numero: texto(x["Número"]),
    complemento: texto(x.Complemento), complemento_correios: texto(x["Complemento Correios"]),
    bairro: texto(x.Bairro), cidade: texto(x.Cidade), estado: texto(x.Estado),
    nome_endereco: texto(x["Nome do endereço"]), tipo_endereco: texto(x["Tipo de endereço"]),
    favorito: x["É favorito?"] === true,
    filiado_id: d.filiado_id ?? null,
    usuario_id: d.usuario_id ?? null,
    empresa_id: d.empresa_id ?? null,
    created_at: x["Created Date"],
  })
  cA.entram++
}

// ── 4. o cadastro ganha o que estava vazio ─────────────────────────────────
const cadastroEmail = []
const cadastroFone = []
for (const f of filiacoes) {
  if (!f.email_pessoal) {
    const lista = emailsPorFiliado.get(f.id)
    if (lista?.length) {
      const escolhido = (lista.find((e) => e.favorito) ?? lista[0]).email
      if (escolhido !== (f.email_corporativo ?? "").toLowerCase()) cadastroEmail.push({ id: f.id, email_pessoal: escolhido })
    }
  }
  if (!f.telefone_2) {
    const lista = fonesPorFiliado.get(f.id)
    if (lista?.length) {
      const t1 = fone(f.telefone_1)
      const outro = (lista.find((t) => t.favorito && t.numero !== t1) ?? lista.find((t) => t.numero !== t1))?.numero
      if (outro) cadastroFone.push({ id: f.id, telefone_2: outro })
    }
  }
}

const mostra = (nome, c, extra = "") =>
  console.log(`  ${nome.padEnd(10)} entram ${String(c.entram).padStart(6)} · já aqui ${c.jaAqui} · sem valor ${c.semValor} · sem dono ${c.semDono} · dono sem par ${c.donoSemPar} · duplicado ${c.duplicado}${c.empresaSemColuna ? ` · de empresa (sem coluna aqui) ${c.empresaSemColuna}` : ""}${extra}`)
console.log("\nCONTATOS")
mostra("e-mails", cE)
mostra("telefones", cT)
mostra("endereços", cA)
const porDono = (lista) => `filiado ${lista.filter((l) => l.filiado_id).length} · usuário ${lista.filter((l) => l.usuario_id).length}${lista.some((l) => l.empresa_id) ? ` · empresa ${lista.filter((l) => l.empresa_id).length}` : ""}`
console.log(`  por dono: e-mails ${porDono(emailsNovos)} | telefones ${porDono(telefonesNovos)} | endereços ${porDono(enderecosNovos)}`)
console.log("\nCADASTRO (só coluna vazia)")
console.log(`  email_pessoal ganha valor em ${cadastroEmail.length} filiados · telefone_2 em ${cadastroFone.length}`)

if (!APLICAR) {
  console.log("\nDry-run. Repita com --apply.")
  process.exit(0)
}

async function inserir(tabela, linhas) {
  let n = 0
  for (let de = 0; de < linhas.length; de += 500) {
    const lote = linhas.slice(de, de + 500)
    const { error } = await db.from(tabela).insert(lote)
    if (error) {
      console.error(`\nFalhou em ${tabela} a partir de ${de}: ${error.message}\nInseridos até aqui: ${n}.`)
      process.exit(1)
    }
    n += lote.length
    process.stdout.write(".")
  }
  console.log(`\n  ${tabela}: ${n} inseridos`)
}
async function preencher(coluna, pares) {
  let n = 0
  for (const p of pares) {
    const { error, count } = await db.from("filiacoes").update({ [coluna]: p[coluna] }, { count: "exact" }).eq("id", p.id).is(coluna, null)
    if (error) {
      console.error(`\nFalhou em filiacoes.${coluna}: ${error.message}\nFeitos: ${n}.`)
      process.exit(1)
    }
    n += count ?? 0
    if (n % 500 === 0) process.stdout.write(".")
  }
  console.log(`\n  filiacoes.${coluna}: ${n} preenchidos`)
}

console.log("\nGravando…")
await inserir("emails", emailsNovos)
await inserir("telefones", telefonesNovos)
await inserir("enderecos", enderecosNovos)
await preencher("email_pessoal", cadastroEmail)
await preencher("telefone_2", cadastroFone)
console.log("\nPronto.")
