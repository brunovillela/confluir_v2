// Preenche o CPF/CNPJ do titular (dados_bancarios.titular_documento) nas
// contas antigas (26/10/2026), em duas situações:
//   1. o campo "favorecido" (titular) da conta já traz um CPF/CNPJ — o legado
//      guardava assim: esse é o documento do titular, seja quem for;
//   2. o titular está vazio ou o nome bate com o do DONO do cadastro (mesma
//      comparação da regra "Conta de outro titular": 60% das palavras) — vale
//      o documento do dono (empresa.cnpj_cpf, usuarios.cpf, filiacoes.cpf).
// Só entra CPF/CNPJ válido. O resto (nome diferente) fica para preencher à mão.
//
//   node scripts/titular-documento-contas.mjs            → simula
//   node scripts/titular-documento-contas.mjs --apply    → grava
//
// Só contas com banco/conta (é na TED que a regra compara). Idempotente: só
// pega conta com titular_documento vazio.

import { createClient } from "@supabase/supabase-js"
import fs from "node:fs"

const env = Object.fromEntries(
  fs
    .readFileSync(new URL("../.env.local", import.meta.url), "utf8")
    .split(/\r?\n/)
    .filter((l) => l.includes("=") && !l.startsWith("#"))
    .map((l) => [l.slice(0, l.indexOf("=")), l.slice(l.indexOf("=") + 1).replace(/^"|"$/g, "")])
)
const s = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY)
const aplicar = process.argv.includes("--apply")
const DEMO = "11111111-1111-4111-8111-111111111111"
const t = (v) => (typeof v === "string" && v.trim() ? v.trim() : null)
const digitos = (v) => String(v ?? "").replace(/\D/g, "")

function cpfValido(c) {
  if (c.length !== 11 || /^(\d)\1{10}$/.test(c)) return false
  const dv = (n) => {
    let soma = 0
    for (let i = 0; i < n; i++) soma += Number(c[i]) * (n + 1 - i)
    const r = (soma * 10) % 11
    return r === 10 ? 0 : r
  }
  return dv(9) === Number(c[9]) && dv(10) === Number(c[10])
}
function cnpjValido(c) {
  if (c.length !== 14 || /^(\d)\1{13}$/.test(c)) return false
  const dv = (base) => {
    const pesos = base.length === 12 ? [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2] : [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]
    const soma = pesos.reduce((acc, p, i) => acc + Number(base[i]) * p, 0)
    const r = soma % 11
    return r < 2 ? 0 : 11 - r
  }
  return dv(c.slice(0, 12)) === Number(c[12]) && dv(c.slice(0, 13)) === Number(c[13])
}
const valido = (d) => (d.length === 11 ? cpfValido(d) : d.length === 14 ? cnpjValido(d) : false)

const VAZIAS = new Set(["ltda", "me", "epp", "eireli", "sa", "s", "a", "de", "da", "do", "das", "dos", "e", "cia", "mei", "slu"])
const palavras = (n) =>
  n
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .split(" ")
    .filter((p) => p.length > 1 && !VAZIAS.has(p) && !/^\d+$/.test(p))
function nomeBate(titular, nomes) {
  const dele = palavras(titular)
  if (!dele.length) return false
  return nomes.some((n) => {
    const fav = palavras(n)
    if (!fav.length) return false
    return dele.filter((p) => fav.includes(p)).length / Math.min(dele.length, fav.length) >= 0.6
  })
}

async function todas(tabela, colunas, filtro) {
  const saida = []
  for (let i = 0; ; i += 1000) {
    const { data, error } = await filtro(s.from(tabela).select(colunas)).range(i, i + 999)
    if (error) throw error
    saida.push(...data)
    if (data.length < 1000) break
  }
  return saida
}
async function porIds(tabela, colunas, ids) {
  const saida = new Map()
  for (let i = 0; i < ids.length; i += 200) {
    const { data, error } = await s.from(tabela).select(colunas).in("id", ids.slice(i, i + 200))
    if (error) throw error
    for (const d of data) saida.set(d.id, d)
  }
  return saida
}

const contas = await todas(
  "dados_bancarios",
  "id, favorecido, conta, fornecedor_id, usuario_id, filiado_id",
  (q) => q.is("titular_documento", null).not("conta", "is", null)
)
const ids = (c) => [...new Set(contas.map((x) => x[c]).filter(Boolean))]
const [empresas, usuarios, filiacoes] = await Promise.all([
  porIds("empresa", "id, emp_proprietaria_id, empresa, nome_fantasia, nome_razao, cnpj_cpf", ids("fornecedor_id")),
  porIds("usuarios", "id, emp_proprietaria_id, nome_completo, nome_guerra, cpf", ids("usuario_id")),
  porIds("filiacoes", "id, emp_proprietaria_id, nome_completo, cpf", ids("filiado_id")),
])

const conta = { preencher: [], nomeDiferente: 0, docInvalido: 0, semDono: 0 }
const porBase = { prod: { preencher: 0, nomeDiferente: 0, docInvalido: 0 }, demo: { preencher: 0, nomeDiferente: 0, docInvalido: 0 } }
for (const c of contas) {
  const dono = c.fornecedor_id
    ? empresas.get(c.fornecedor_id)
    : c.usuario_id
      ? usuarios.get(c.usuario_id)
      : c.filiado_id
        ? filiacoes.get(c.filiado_id)
        : null
  if (!dono) {
    conta.semDono++
    continue
  }
  const base = dono.emp_proprietaria_id === DEMO || dono.id === DEMO ? "demo" : "prod"
  const doc = digitos(dono.cnpj_cpf ?? dono.cpf)
  const nomes = [dono.empresa, dono.nome_fantasia, dono.nome_razao, dono.nome_completo, dono.nome_guerra].map(t).filter(Boolean)
  const titular = t(c.favorecido)
  const docNoTitular = digitos(titular?.match(/\d[\d./-]{9,}\d/)?.[0])
  if (valido(docNoTitular)) {
    conta.preencher.push({ id: c.id, doc: docNoTitular })
    porBase[base].preencher++
    if (docNoTitular !== doc) porBase[base].outroDono = (porBase[base].outroDono ?? 0) + 1
    continue
  }
  if (titular && !nomeBate(titular, nomes)) {
    conta.nomeDiferente++
    porBase[base].nomeDiferente++
    continue
  }
  if (!valido(doc)) {
    conta.docInvalido++
    porBase[base].docInvalido++
    continue
  }
  conta.preencher.push({ id: c.id, doc })
  porBase[base].preencher++
}

console.log(`${contas.length} conta(s) com banco/conta e sem o documento do titular.`)
console.log(`- produção: ${porBase.prod.preencher} a preencher (${porBase.prod.outroDono ?? 0} com documento de outro titular, que a regra vai alertar); ${porBase.prod.nomeDiferente} com titular de outro nome; ${porBase.prod.docInvalido} com o CPF/CNPJ do dono inválido ou vazio`)
console.log(`- demo:     ${porBase.demo.preencher} a preencher; ${porBase.demo.nomeDiferente} com titular de outro nome; ${porBase.demo.docInvalido} com o CPF/CNPJ do dono inválido ou vazio`)
if (conta.semDono) console.log(`- ${conta.semDono} sem dono visível (ignoradas)`)

if (aplicar) {
  let feitas = 0
  for (const { id, doc } of conta.preencher) {
    const { error } = await s.from("dados_bancarios").update({ titular_documento: doc }).eq("id", id).is("titular_documento", null)
    if (error) throw error
    feitas++
  }
  console.log(`\n${feitas} conta(s) preenchidas.`)
}
