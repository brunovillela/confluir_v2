// No Bubble as linhas institucionais não tinham responsável. Este script o
// DEDUZ pelo telefone: se o número da linha está no cadastro de alguém
// (telefones, WhatsApp do usuário ou telefone da ficha de filiação), é
// provável que a linha esteja com essa pessoa. Só preenche linha SEM
// responsável e só quando o número leva a UMA pessoa com cadastro de usuário.
//
//   node scripts/sugerir-responsaveis-linhas.mjs            (simulação: lista)
//   node scripts/sugerir-responsaveis-linhas.mjs --apply [--tenant <uuid>]
import { readFileSync } from "node:fs"
import { createRequire } from "node:module"

const require = createRequire(import.meta.url)
const { createClient } = require("@supabase/supabase-js")

const env = Object.fromEntries(
  readFileSync(".env.local", "utf8")
    .split(/\r?\n/)
    .filter((l) => l.includes("=") && !l.trim().startsWith("#"))
    .map((l) => {
      const i = l.indexOf("=")
      return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, "")]
    })
)
const db = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
})
const args = process.argv.slice(2)
const APLICAR = args.includes("--apply")
const i = args.indexOf("--tenant")
const TENANT = i >= 0 ? args[i + 1] : "c763cb99-edfd-4840-8453-ed3fcb66d4a1"

// Só dígitos, sem o 55 do país.
const tel = (v) => String(v ?? "").replace(/\D/g, "").replace(/^55(?=\d{10,11}$)/, "")
const cpfDig = (v) => {
  const d = String(v ?? "").replace(/\D/g, "")
  return d.length === 11 && !/^(\d)\1{10}$/.test(d) ? d : null
}

async function tudo(tabela, colunas, filtro = (q) => q) {
  const linhas = []
  for (let de = 0; ; de += 1000) {
    const { data, error } = await filtro(db.from(tabela).select(colunas)).range(de, de + 999)
    if (error) throw new Error(`${tabela}: ${error.message}`)
    linhas.push(...data)
    if (data.length < 1000) break
  }
  return linhas
}

console.log(APLICAR ? "APLICANDO" : "SIMULAÇÃO — nada será gravado", `· tenant ${TENANT}\n`)

const noTenant = (q) => q.eq("emp_proprietaria_id", TENANT).order("id")
const [linhas, telefones, usuarios, filiacoes, vinculos, integrantes] = await Promise.all([
  tudo("linhas_institucionais", "id, numero, usuario_id", noTenant),
  tudo("telefones", "numero, usuario_id", noTenant),
  tudo("usuarios", "id, cpf, nome_completo, whatsapp, deletado, conta_funcao", noTenant),
  tudo("filiacoes", "nome_completo, cpf, telefone_1, telefone_2", noTenant),
  tudo("vinculos_trabalhistas", "trabalhador_id, contrato_demissao", (q) =>
    q.eq("empregador_id", TENANT).order("id")
  ),
  tudo("diretoria_integrantes", "cpf, usuario_id", noTenant),
])

const ativos = new Map(usuarios.filter((u) => u.deletado !== true && u.conta_funcao !== true).map((u) => [u.id, u]))
const usuarioPorCpf = new Map()
for (const u of ativos.values()) {
  const c = cpfDig(u.cpf)
  if (c && !usuarioPorCpf.has(c)) usuarioPorCpf.set(c, u.id)
}
const funcionarios = new Set(vinculos.filter((v) => !v.contrato_demissao).map((v) => v.trabalhador_id))
const diretores = new Set(
  integrantes.map((d) => d.usuario_id ?? usuarioPorCpf.get(cpfDig(d.cpf)) ?? null).filter(Boolean)
)

// número → pessoas (usuário) e de onde veio a pista
const pistas = new Map()
const anotar = (numero, usuarioId, fonte) => {
  if (!usuarioId || !ativos.has(usuarioId)) return
  const lista = pistas.get(numero) ?? []
  lista.push({ usuarioId, fonte })
  pistas.set(numero, lista)
}
for (const t of telefones) anotar(tel(t.numero), t.usuario_id, "telefone do cadastro")
for (const u of ativos.values()) anotar(tel(u.whatsapp), u.id, "WhatsApp do usuário")
for (const f of filiacoes) {
  const uid = usuarioPorCpf.get(cpfDig(f.cpf))
  for (const t of [f.telefone_1, f.telefone_2]) anotar(tel(t), uid, "telefone da filiação")
}
const semUsuarioNaFiliacao = []
for (const f of filiacoes) {
  if (usuarioPorCpf.get(cpfDig(f.cpf))) continue
  for (const t of [f.telefone_1, f.telefone_2]) {
    if (linhas.some((l) => l.numero === tel(t))) semUsuarioNaFiliacao.push(`${tel(t)} → ${f.nome_completo} (filiado sem cadastro de usuário)`)
  }
}

const aplicar = []
const ambiguas = []
let jaTinham = 0
for (const l of linhas) {
  const p = pistas.get(l.numero)
  if (!p) continue
  if (l.usuario_id) {
    jaTinham++
    continue
  }
  const pessoas = [...new Set(p.map((x) => x.usuarioId))]
  if (pessoas.length > 1) {
    ambiguas.push(`${l.numero} → ${pessoas.map((id) => ativos.get(id)?.nome_completo ?? id).join(" | ")}`)
    continue
  }
  const uid = pessoas[0]
  const papel = funcionarios.has(uid) ? "funcionário" : diretores.has(uid) ? "diretor" : "fora do quadro"
  aplicar.push({
    id: l.id,
    numero: l.numero,
    usuarioId: uid,
    nome: ativos.get(uid)?.nome_completo?.trim() ?? uid,
    papel,
    fontes: [...new Set(p.map((x) => x.fonte))].join(", "),
  })
}

console.log(`linhas: ${linhas.length} · sem responsável: ${linhas.filter((l) => !l.usuario_id).length}`)
console.log(`\na preencher (${aplicar.length}):`)
for (const a of aplicar) console.log(`  ${a.numero} → ${a.nome} [${a.papel}] · ${a.fontes}`)
console.log(`\nnúmero de mais de uma pessoa, fica de fora (${ambiguas.length}):`)
for (const a of ambiguas) console.log(`  ${a}`)
console.log(`\npista em filiado sem cadastro de usuário, fica de fora (${semUsuarioNaFiliacao.length}):`)
for (const a of semUsuarioNaFiliacao) console.log(`  ${a}`)
if (jaTinham) console.log(`\n${jaTinham} linha(s) com pista já tinham responsável — não mexi.`)

if (APLICAR) {
  let feitas = 0
  for (const a of aplicar) {
    const { error } = await db
      .from("linhas_institucionais")
      .update({ usuario_id: a.usuarioId, updated_at: new Date().toISOString() })
      .eq("id", a.id)
      .is("usuario_id", null)
    if (error) console.log("  ✘", a.numero, error.message)
    else feitas++
  }
  console.log(`\n${feitas} linha(s) com responsável preenchido.`)
} else {
  console.log("\nPara gravar: node scripts/sugerir-responsaveis-linhas.mjs --apply")
}
