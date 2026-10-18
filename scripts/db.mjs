/**
 * Atalho para a CLI do Supabase contra o banco remoto (Onda A2,
 * docs/plano-documentacao.md). Lê SUPABASE_DB_URL do .env.local e a repassa
 * como --db-url, sem nunca imprimi-la (a saída da CLI é filtrada).
 *
 * Uso (via npm):
 *   npm run db:nova -- nome_da_mudanca     # supabase migration new (local, sem banco)
 *   npm run db:status                      # supabase migration list
 *   npm run db:aplicar                     # supabase migration up (pede confirmação)
 *   node scripts/db.mjs <subcomando da CLI> …   # qualquer outro, ex.: migration repair …
 */
import { readFileSync } from "node:fs"
import { spawnSync } from "node:child_process"
import { createInterface } from "node:readline/promises"
import { createRequire } from "node:module"

// O binário da CLI instalada no projeto, chamado pelo node: sem shell, os
// argumentos (inclusive a URI) não passam por concatenação.
const CLI = createRequire(import.meta.url).resolve("supabase/dist/supabase.js")
const supabase = (args) =>
  spawnSync(process.execPath, [CLI, ...args], { encoding: "utf8", stdio: ["inherit", "pipe", "pipe"] })

const [, , ...argv] = process.argv
if (!argv.length) {
  console.error("Uso: node scripts/db.mjs nova <nome> | status | aplicar | <subcomando da CLI> …")
  process.exit(1)
}

const ATALHOS = {
  nova: ["migration", "new"],
  status: ["migration", "list"],
  aplicar: ["migration", "up"],
}
const comando = ATALHOS[argv[0]] ? [...ATALHOS[argv[0]], ...argv.slice(1)] : argv
const local = comando[0] === "migration" && comando[1] === "new"

let URL_BANCO = ""
if (!local) {
  const linha = readFileSync(".env.local", "utf8")
    .split(/\r?\n/)
    .find((l) => l.startsWith("SUPABASE_DB_URL="))
  URL_BANCO = linha?.slice("SUPABASE_DB_URL=".length).trim().replace(/^["']|["']$/g, "") ?? ""
  if (!URL_BANCO) {
    console.error("Falta SUPABASE_DB_URL no .env.local (URI do Session pooler, com a senha).")
    process.exit(1)
  }
}

if (argv[0] === "aplicar") {
  // Mostra o que vai rodar e pede confirmação: é produção.
  const lista = supabase(["migration", "list", "--db-url", URL_BANCO])
  console.log((lista.stdout + lista.stderr).replaceAll(URL_BANCO, "<url>"))
  const rl = createInterface({ input: process.stdin, output: process.stdout })
  const ok = (await rl.question("Aplicar em PRODUÇÃO as migrações pendentes? (digite sim) ")).trim().toLowerCase()
  rl.close()
  if (ok !== "sim") {
    console.log("Nada aplicado.")
    process.exit(0)
  }
}

const r = supabase([...comando, ...(local ? [] : ["--db-url", URL_BANCO])])
const saida = (r.stdout ?? "") + (r.stderr ?? "")
process.stdout.write(URL_BANCO ? saida.replaceAll(URL_BANCO, "<url>") : saida)
process.exit(r.status ?? 1)
