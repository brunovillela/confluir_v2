// Reclassifica as ausências antigas para a lista fechada de tipos.
//
//   node scripts/reclassificar-ausencias.mjs            → prévia (não grava)
//   node scripts/reclassificar-ausencias.mjs --aplicar  → grava
//
// O campo `motivo` veio do Bubble já como lista (falta justificada,
// afastamento médico, férias, compensação de banco de horas), mas o formulário
// era texto livre e recebeu descrições soltas. Aqui cada descrição vira um
// TIPO da lista e o texto original é preservado em `observacao` — nada se
// perde. Requer supabase/ausencias-observacao.sql.

import { readFileSync } from "node:fs"
import { createRequire } from "node:module"

const require = createRequire(process.cwd() + "/package.json")
const env = Object.fromEntries(
  readFileSync(".env.local", "utf8")
    .split(/\r?\n/)
    .filter((l) => l.includes("="))
    .map((l) => {
      const i = l.indexOf("=")
      return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, "")]
    })
)
const db = require("@supabase/supabase-js").createClient(
  env.NEXT_PUBLIC_SUPABASE_URL,
  env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false } }
)

const TIPOS = [
  "Falta justificada",
  "Afastamento médico",
  "Férias",
  "Compensação de banco de horas",
  "Trabalho externo",
  "Licença",
]

/** Descrição solta → tipo da lista. A ordem importa: a primeira que casa vence. */
const REGRAS = [
  [/compensa/i, "Compensação de banco de horas"],
  [/licen[çc]a|nojo|gala|luto|casamento|paternidade|maternidade/i, "Licença"],
  [/semin[áa]rio|congresso|curso|trabalho externo|externa|viagem|reuni[ãa]o/i, "Trabalho externo"],
  [/atestado|m[ée]dic|consulta|sa[úu]de|inss|afastamento/i, "Afastamento médico"],
  [/f[ée]rias/i, "Férias"],
  [/falta|justificad/i, "Falta justificada"],
]

function tipoPara(motivo) {
  for (const [padrao, tipo] of REGRAS) if (padrao.test(motivo)) return tipo
  return null
}

const aplicar = process.argv.includes("--aplicar")

const { data, error } = await db
  .from("pessoal_ausencias")
  .select("id, emp_proprietaria_id, inicio, termino, motivo, atestado_id, ferias_id")
  .limit(5000)
if (error) {
  console.error("Falha ao ler as ausências:", error.message)
  process.exit(1)
}

const sonda = await db.from("pessoal_ausencias").select("observacao").limit(1)
const temObservacao = !sonda.error
if (!temObservacao) {
  console.log(
    "AVISO: a coluna observacao ainda não existe (supabase/ausencias-observacao.sql).\n" +
      "       A prévia roda assim mesmo; para GRAVAR, rode o SQL antes.\n"
  )
}

const foraDaLista = (data ?? []).filter(
  (a) => a.motivo?.trim() && !TIPOS.includes(a.motivo.trim())
)
const semMotivo = (data ?? []).filter((a) => !a.motivo?.trim())

console.log(`Ausências: ${(data ?? []).length} · fora da lista: ${foraDaLista.length} · sem tipo: ${semMotivo.length}\n`)

const planos = []
for (const a of foraDaLista) {
  const original = a.motivo.trim()
  planos.push({ id: a.id, de: original, para: tipoPara(original), observacao: original })
}
// Sem tipo, mas com vínculo que diz o que foi.
for (const a of semMotivo) {
  const porVinculo = a.atestado_id ? "Afastamento médico" : a.ferias_id ? "Férias" : null
  if (porVinculo) planos.push({ id: a.id, de: "(vazio)", para: porVinculo, observacao: null })
}

for (const p of planos) {
  console.log(
    `  ${p.para ? "→" : "?"} ${String(p.de).slice(0, 44).padEnd(46)} ${p.para ?? "SEM REGRA — reclassifique à mão"}`
  )
}
const semRegra = planos.filter((p) => !p.para)
const aGravar = planos.filter((p) => p.para)
const restamSemTipo = semMotivo.length - planos.filter((p) => p.de === "(vazio)").length
console.log(
  `\n${aGravar.length} para reclassificar · ${semRegra.length} sem regra · ${restamSemTipo} continuam sem tipo (nada no registro diz qual foi)`
)

if (!aplicar) {
  console.log("\n(prévia — rode com --aplicar para gravar)")
  process.exit(0)
}

let feitos = 0
for (const p of aGravar) {
  const { error: erro } = await db
    .from("pessoal_ausencias")
    .update({
      motivo: p.para,
      ...(p.observacao ? { observacao: p.observacao } : {}),
      updated_at: new Date().toISOString(),
    })
    .eq("id", p.id)
  if (erro) console.error(`  falhou ${p.id}: ${erro.message}`)
  else feitos++
}
console.log(`\nreclassificados: ${feitos}`)
