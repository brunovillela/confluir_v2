// ===========================================================================
// limpar-identidade-filiados.mjs — limpeza de CPF e matrícula sindical.
//
// Varredura de 16/09/2026 (ver src/lib/db/filiacao-identidade.ts): 507
// cadastros com CPF "0" e outros CPFs impossíveis, CPFs gravados com máscara,
// uma matrícula sindical que era um CPF digitado no campo errado, cadastros
// novos sem matrícula e 15 mil matrículas sem o número inteiro preenchido.
//
// O que faz (só em cadastros NÃO excluídos, nada é apagado):
//   1. CPF IMPOSSÍVEL (não tem 11 dígitos, ou 11 dígitos iguais) → em branco;
//      se só perdeu os zeros à esquerda (válido com eles, sem uso), recupera.
//      CPF de 11 dígitos com verificador errado FICA: pode ser um dígito
//      trocado, e aparece em Cadastros pendentes para corrigir à mão.
//   2. CPF com máscara (080.120.437-26) → só dígitos.
//   3. Matrícula sindical que não é matrícula (não numérica ou com mais de 7
//      dígitos) → em branco.
//   4. Cadastro sem matrícula sindical → a próxima livre, em sequência.
//   5. matricula_sindical_numero preenchido a partir do texto.
//
// Os passos 1, 3 e 4 deixam registro no prontuário de cada cadastro. CPF
// repetido e matrícula repetida NÃO são mexidos aqui: são decisão de pessoa
// (mesclar ou corrigir), na tela Filiados › Cadastros pendentes › Possíveis
// duplicidades.
//
// Idempotente: se parar no meio, rode de novo — só grava o que ainda falta.
//
// USO:
//   node scripts/limpar-identidade-filiados.mjs            (simulação)
//   node scripts/limpar-identidade-filiados.mjs --apply
// ===========================================================================

import { readFileSync } from "node:fs"

const APLICAR = process.argv.includes("--apply")
const TENANT = "c763cb99-edfd-4840-8453-ed3fcb66d4a1"

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
const db = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
})

console.log(APLICAR ? "MODO APLICAR — vai gravar." : "SIMULAÇÃO — nada será gravado.")

const digitos = (v) => (v ?? "").replace(/\D/g, "")
const validarCpf = (c) => {
  const d = digitos(c)
  if (d.length !== 11 || /^(\d)\1{10}$/.test(d)) return false
  const calc = (ate) => {
    let s = 0
    for (let i = 0; i < ate; i++) s += Number(d[i]) * (ate + 1 - i)
    const r = (s * 10) % 11
    return r === 10 ? 0 : r
  }
  return calc(9) === Number(d[9]) && calc(10) === Number(d[10])
}
const cpfImpossivel = (c) => {
  const d = digitos(c)
  return d.length !== 11 || /^(\d)\1{10}$/.test(d)
}
const matriculaNormal = (m) => {
  const t = (m ?? "").trim()
  if (!/^\d+$/.test(t)) return null
  const n = t.replace(/^0+/, "")
  return n && n.length <= 7 ? n : null
}

const cadastros = []
for (let de = 0; ; de += 1000) {
  const { data, error } = await db
    .from("filiacoes")
    .select("id, nome_completo, cpf, matricula_sindical, matricula_sindical_numero, created_at")
    .eq("emp_proprietaria_id", TENANT)
    .not("filiacao_excluida", "is", true)
    .order("id", { ascending: true })
    .range(de, de + 999)
  if (error) throw new Error(error.message)
  cadastros.push(...data)
  if (data.length < 1000) break
}
console.log(`\n${cadastros.length} cadastros não excluídos`)

const mudancas = new Map() // id → { patch, notas[] }
const mudar = (f, patch, nota) => {
  const m = mudancas.get(f.id) ?? { f, patch: {}, notas: [] }
  Object.assign(m.patch, patch)
  if (nota) m.notas.push(nota)
  mudancas.set(f.id, m)
}

// 1 e 2. CPF
const exemplosCpf = new Map()
let mascaras = 0
const recuperados = []
const cpfsEmUso = new Set(cadastros.map((f) => digitos(f.cpf)).filter((d) => validarCpf(d)))
for (const f of cadastros) {
  const bruto = (f.cpf ?? "").trim()
  if (!bruto) continue
  // Guardado como número, o CPF perde os zeros à esquerda: se voltar a ser
  // válido com eles e ninguém mais usa, é o CPF — recupera em vez de apagar.
  const comZeros = digitos(bruto).padStart(11, "0")
  if (digitos(bruto).length >= 8 && digitos(bruto).length < 11 && validarCpf(comZeros) && !cpfsEmUso.has(comZeros)) {
    mudar(f, { cpf: comZeros }, `CPF "${bruto}" corrigido para ${comZeros} (zeros à esquerda perdidos) na limpeza de identidade`)
    cpfsEmUso.add(comZeros)
    recuperados.push(`${bruto} → ${comZeros} (${f.nome_completo})`)
    continue
  }
  if (cpfImpossivel(bruto)) {
    mudar(f, { cpf: null }, `CPF impossível "${bruto}" removido na limpeza de identidade (confirme o CPF com o filiado)`)
    exemplosCpf.set(bruto, (exemplosCpf.get(bruto) ?? 0) + 1)
  } else if (/\D/.test(bruto)) {
    mudar(f, { cpf: digitos(bruto) })
    mascaras++
  }
}
console.log(`\n1. CPF impossível → em branco: ${[...exemplosCpf.values()].reduce((a, b) => a + b, 0)} cadastros`)
for (const [cpf, n] of [...exemplosCpf.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8)) {
  console.log(`     "${cpf}" × ${n}`)
}
console.log(`   recuperados com os zeros à esquerda: ${recuperados.length}${recuperados.length ? " — " + recuperados.join("; ") : ""}`)
console.log(`2. CPF com máscara → só dígitos: ${mascaras} cadastros`)
console.log(
  `   (ficam como estão, para correção à mão: ${cadastros.filter((f) => f.cpf && !cpfImpossivel(f.cpf) && !validarCpf(f.cpf)).length} CPFs de 11 dígitos com verificador errado)`
)

// 3. Matrícula que não é matrícula
let lixoMatricula = 0
for (const f of cadastros) {
  const bruta = (f.matricula_sindical ?? "").trim()
  if (bruta && !matriculaNormal(bruta)) {
    mudar(f, { matricula_sindical: null, matricula_sindical_numero: null }, `Matrícula sindical inválida "${bruta}" removida na limpeza de identidade`)
    lixoMatricula++
    console.log(`\n3. matrícula inválida "${bruta}" — ${f.nome_completo}`)
  }
}
if (!lixoMatricula) console.log(`\n3. Matrícula inválida: nenhuma`)

// 4. Sem matrícula → próxima livre (depois da limpeza do passo 3)
const usadas = new Set(
  cadastros
    .filter((f) => !(mudancas.get(f.id)?.patch && "matricula_sindical" in mudancas.get(f.id).patch))
    .map((f) => matriculaNormal(f.matricula_sindical))
    .filter(Boolean)
)
let proxima = Math.max(0, ...[...usadas].map(Number)) + 1
const semMatricula = cadastros
  .filter((f) => {
    const m = mudancas.get(f.id)
    const atual = m && "matricula_sindical" in m.patch ? m.patch.matricula_sindical : f.matricula_sindical
    return !matriculaNormal(atual)
  })
  .sort((a, b) => (a.created_at ?? "").localeCompare(b.created_at ?? ""))
console.log(`\n4. Sem matrícula sindical → próxima livre: ${semMatricula.length} cadastros (a partir de ${proxima})`)
for (const f of semMatricula) {
  while (usadas.has(String(proxima))) proxima++
  const nova = String(proxima++)
  usadas.add(nova)
  mudar(f, { matricula_sindical: nova, matricula_sindical_numero: Number(nova) }, `Matrícula sindical ${nova} atribuída na limpeza de identidade`)
  console.log(`     ${nova} — ${f.nome_completo}`)
}

// 5. Número inteiro da matrícula
let numeros = 0
for (const f of cadastros) {
  const m = mudancas.get(f.id)
  if (m && "matricula_sindical_numero" in m.patch) continue
  const normal = matriculaNormal(f.matricula_sindical)
  if (normal && f.matricula_sindical_numero !== Number(normal)) {
    mudar(f, { matricula_sindical_numero: Number(normal) })
    numeros++
  }
}
console.log(`\n5. Número da matrícula preenchido: ${numeros} cadastros`)

console.log(`\nTotal: ${mudancas.size} cadastros a atualizar`)
if (!APLICAR) {
  console.log("\nSimulação. Repita com --apply para gravar.")
  process.exit(0)
}

// Queda de rede no meio (fetch failed) não pode parar 15 mil gravações:
// tenta de novo algumas vezes, com pausa crescente.
async function comRetentativa(operacao) {
  for (let tentativa = 1; ; tentativa++) {
    try {
      const r = await operacao()
      if (!r.error || tentativa >= 4 || !/fetch failed|network|timeout|ECONNRESET/i.test(r.error.message)) return r
    } catch (e) {
      if (tentativa >= 4) return { error: { message: String(e) } }
    }
    await new Promise((ok) => setTimeout(ok, 1500 * tentativa))
  }
}

let feitos = 0
const agora = new Date().toISOString()
for (const { f, patch, notas } of mudancas.values()) {
  const { error } = await comRetentativa(() =>
    db.from("filiacoes").update({ ...patch, updated_at: agora }).eq("id", f.id)
  )
  if (error) {
    console.error(`\nFalhou em ${f.id} (${f.nome_completo}): ${error.message}\nFeitos até aqui: ${feitos}.`)
    process.exit(1)
  }
  if (notas.length) {
    await comRetentativa(() => db.from("filiacao_prontuario").insert({
      filiacao_id: f.id,
      data: agora,
      tipo: "Atualização cadastral",
      descricao: `${notas.join(". ")}.`,
      emp_proprietaria_id: TENANT,
      created_at: agora,
      modified_at: agora,
    }))
  }
  feitos++
  if (feitos % 1000 === 0) console.log(`  ${feitos}…`)
}
console.log(`\nPronto: ${feitos} cadastros atualizados.`)
