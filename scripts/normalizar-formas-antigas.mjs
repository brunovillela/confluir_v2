// Troca as grafias antigas da forma de pagamento (migração do Bubble, até
// 30/09/2026) pelas atuais de FORMAS_PAGAMENTO_COMPRAS (27/10/2026):
//   "Dinheiro (caixa)"        → "Dinheiro"
//   "Transferência TED / DOC" → "Depósito bancário (TED)"
//   "Cartão de crédito"       → "Cartão"
// Assim o filtro "Forma de pagamento", os relatórios e as comparações exatas
// (FORMA_PAGA_NO_ATO, DETALHE_DA_FORMA) enxergam uma forma só.
//
//   node scripts/normalizar-formas-antigas.mjs          → simula (conta)
//   node scripts/normalizar-formas-antigas.mjs --apply  → grava
//
// Idempotente: só pega linha que ainda está com a grafia antiga.

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

const TROCAS = {
  "Dinheiro (caixa)": "Dinheiro",
  "Transferência TED / DOC": "Depósito bancário (TED)",
  "Cartão de crédito": "Cartão",
}
const TABELAS = [
  "ordens_pagamento",
  "compras_propostas",
  "compras_fornecimentos",
  "financeiro_tributos",
  "institucional_custeios",
  "viagens_faturas",
  "pessoal_contracheques_config",
  "pessoal_diarias_remessas",
]

let total = 0
for (const tabela of TABELAS) {
  for (const [antiga, atual] of Object.entries(TROCAS)) {
    const { count, error } = await s
      .from(tabela)
      .select("id", { count: "exact", head: true })
      .eq("forma_pagamento", antiga)
    if (error) throw new Error(`${tabela}: ${error.message}`)
    if (!count) continue
    total += count
    if (aplicar) {
      const { error: e } = await s.from(tabela).update({ forma_pagamento: atual }).eq("forma_pagamento", antiga)
      if (e) throw new Error(`${tabela}: ${e.message}`)
    }
    console.log(`${tabela}: ${count} "${antiga}" → "${atual}"${aplicar ? " (gravado)" : ""}`)
  }
}
console.log(`\n${total} linha(s) ${aplicar ? "normalizadas" : "a normalizar (simulação; use --apply)"}.`)
