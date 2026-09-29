// Semeia o tenant DEMO para o print da minuta em revisão (manual de Minutas).
// Copia o texto da versão 5 da minuta de exemplo da Gráfica Modelo — a redação
// original da IA, com os [PREENCHER: …] — numa minuta nova, não finalizada.
// A minuta de exemplo (assinada) não é tocada. Idempotente.
//
//   node scripts/seed-prints-minutas.mjs          → semeia
//   node scripts/seed-prints-minutas.mjs --limpar → apaga
import { readFileSync } from "node:fs"
import { createRequire } from "node:module"

const require = createRequire(process.cwd() + "/package.json")
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

const D = "11111111-1111-4111-8111-111111111111"
const DEMO = "22222222-2222-4222-8222-222222222222"
const ORIGEM = "86f92e2f-5137-43b6-b152-8fee213e3717" // Gráfica Modelo, assinada
const MINUTA = "6d100000-0000-4000-8000-000000000001"

const ok = (rotulo) => ({ error }) => {
  if (error) throw new Error(`${rotulo}: ${error.message}`)
}

await db.from("contratos_minutas_versoes").delete().eq("minuta_id", MINUTA)
await db.from("contratos_minutas").delete().eq("id", MINUTA)
if (process.argv.includes("--limpar")) {
  console.log("Minuta de print removida.")
  process.exit(0)
}

const { data: origem, error } = await db
  .from("contratos_minutas")
  .select("tipo, tipo_id, parametros")
  .eq("id", ORIGEM)
  .single()
if (error) throw new Error(`minuta de exemplo: ${error.message}`)
const { data: v5, error: erroV5 } = await db
  .from("contratos_minutas_versoes")
  .select("texto")
  .eq("minuta_id", ORIGEM)
  .eq("versao", 5)
  .single()
if (erroV5) throw new Error(`versão 5: ${erroV5.message}`)

await db
  .from("contratos_minutas")
  .insert({
    id: MINUTA,
    emp_proprietaria_id: D,
    titulo: "Impressão mensal do jornal — Gráfica Modelo",
    tipo: origem.tipo,
    tipo_id: origem.tipo_id,
    parametros: origem.parametros,
    texto: v5.texto,
    versao: 1,
    finalizada: false,
    criado_por_id: DEMO,
    atualizado_por_id: DEMO,
  })
  .then(ok("minuta"))
await db
  .from("contratos_minutas_versoes")
  .insert({ emp_proprietaria_id: D, minuta_id: MINUTA, versao: 1, texto: v5.texto, origem: "ia", criado_por_id: DEMO })
  .then(ok("versão"))

console.log(`Minuta de print: /painel/compras/contratos/minutas/${MINUTA}`)
