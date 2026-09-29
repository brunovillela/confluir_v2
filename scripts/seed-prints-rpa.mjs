// Semeia o tenant DEMO com um contrato de AUTÔNOMO (prestador pessoa física),
// para testar e fotografar a hierarquia Contrato › Minuta › RPA. Ids fixos
// (c1100000-…-0010 e f0f0f0f0-…-0010); --limpar apaga o contrato, os RPAs e as
// ordens dele, o endereço e o prestador.
//
//   node scripts/seed-prints-rpa.mjs          → semeia
//   node scripts/seed-prints-rpa.mjs --limpar → apaga
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
const PRESTADOR = "f0f0f0f0-0000-4000-8000-000000000010"
const CONTRATO = "c1100000-0000-4000-8000-000000000010"
const DEPTO_ADM = "de100000-0000-4000-8000-000000000001"
const CC_ADM = "cc000000-0000-4000-8000-000000000001"

const ok = (rotulo) => ({ error }) => {
  if (error) throw new Error(`${rotulo}: ${error.message}`)
}

// ── Limpeza ─────────────────────────────────────────────────────────────────
const { data: rpas } = await db.from("compras_rpa").select("id, ordem_pagamento_id").eq("contrato_id", CONTRATO)
await db.from("compras_rpa").delete().eq("contrato_id", CONTRATO)
const ordens = (rpas ?? []).map((r) => r.ordem_pagamento_id).filter(Boolean)
if (ordens.length) await db.from("ordens_pagamento").delete().in("id", ordens)
await db.from("ordens_pagamento").delete().eq("contrato_id", CONTRATO)
await db.from("contratos_minutas").update({ contrato_id: null }).eq("contrato_id", CONTRATO)
await db.from("contratos").delete().eq("id", CONTRATO)
await db.from("enderecos").delete().eq("empresa_id", PRESTADOR)
await db.from("empresa").delete().eq("id", PRESTADOR)

if (process.argv.includes("--limpar")) {
  console.log("Contrato de autônomo removido da demo.")
  process.exit(0)
}

// ── Prestador pessoa física e contrato ──────────────────────────────────────
await db
  .from("empresa")
  .insert({
    id: PRESTADOR,
    emp_proprietaria_id: D,
    nome_fantasia: "João Batista Ramos",
    nome_razao: "João Batista Ramos",
    cnpj_cpf: "111.444.777-35",
    pessoa_juridica: false,
  })
  .then(ok("prestador"))
await db
  .from("enderecos")
  .insert({
    empresa_id: PRESTADOR,
    emp_proprietaria_id: D,
    logradouro: "Rua das Palmeiras",
    numero: "210",
    bairro: "Centro",
    cidade: "Macaé",
    estado: "RJ",
    cep: "27910-000",
  })
  .then(ok("endereço"))
await db
  .from("contratos")
  .insert({
    id: CONTRATO,
    emp_proprietaria_id: D,
    codigo: "2026.0901.0900.0010",
    objeto: "Manutenção elétrica preventiva e corretiva das sedes, por chamado",
    valor: 1800,
    vigencia_inicio: "2026-09-01",
    vigencia_termino: "2027-08-31",
    fornecedor_id: PRESTADOR,
    departamento_id: DEPTO_ADM,
    centro_custo_id: CC_ADM,
    responsavel_id: DEMO,
    ativo: true,
    deletado: false,
    aditivo: false,
    sob_demanda: true,
    apoio_institucional: false,
  })
  .then(ok("contrato"))

console.log(`Contrato de autônomo: /painel/compras/contratos/${CONTRATO}`)
