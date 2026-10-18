/**
 * Atalho para a CLI do Supabase contra o banco remoto (Onda A2,
 * docs/plano-documentacao.md). Lê SUPABASE_DB_URL do .env.local e a repassa
 * como --db-url, sem nunca imprimi-la (a saída da CLI é filtrada).
 *
 * Uso (via npm):
 *   npm run db:nova -- nome_da_mudanca     # supabase migration new (local, sem banco)
 *   npm run db:status                      # supabase migration list
 *   npm run db:aplicar                     # supabase migration up (pede confirmação)
 *   npm run db:deriva                      # banco × supabase/schema-impressao.json (Onda A3)
 *   node scripts/db.mjs impressao          # regrava a impressão a partir do banco
 *   node scripts/db.mjs <subcomando da CLI> …   # qualquer outro, ex.: migration repair …
 *
 * `aplicar` regrava a impressão e o dicionário (docs/dados/) quando a CLI
 * termina bem: commite os dois junto com a migração.
 */
import { readFileSync, writeFileSync, existsSync } from "node:fs"
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
const IMPRESSAO = "supabase/schema-impressao.json"

/** { "<tipo>:<nome>": md5 } do banco, via public.schema_impressao(). */
function lerImpressao() {
  const r = spawnSync("psql", [URL_BANCO, "-X", "-A", "-t", "-v", "ON_ERROR_STOP=1", "-c", "select public.schema_impressao()"], {
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
  })
  if (r.status !== 0) {
    console.error((r.stderr || "").replaceAll(URL_BANCO, "<url>"))
    process.exit(1)
  }
  return JSON.parse(r.stdout)
}

function gravarImpressao(impressao) {
  const ordenado = Object.fromEntries(Object.keys(impressao).sort().map((k) => [k, impressao[k]]))
  writeFileSync(IMPRESSAO, JSON.stringify(ordenado, null, 1) + "\n")
  console.log(`Impressão regravada: ${IMPRESSAO} (${Object.keys(ordenado).length} objetos). Commite junto com a migração.`)
}

/** Diferenças entre a impressão registrada e a do banco. */
function compararImpressoes(registrada, atual) {
  const novos = Object.keys(atual).filter((k) => !(k in registrada)).sort()
  const removidos = Object.keys(registrada).filter((k) => !(k in atual)).sort()
  const alterados = Object.keys(atual).filter((k) => k in registrada && registrada[k] !== atual[k]).sort()
  return { novos, removidos, alterados }
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

if (argv[0] === "impressao") {
  gravarImpressao(lerImpressao())
  process.exit(0)
}

if (argv[0] === "deriva") {
  if (!existsSync(IMPRESSAO)) {
    console.error(`Falta ${IMPRESSAO}. Gere com: node scripts/db.mjs impressao`)
    process.exit(1)
  }
  const pendentes = supabase(["migration", "list", "--db-url", URL_BANCO])
  const lista = JSON.parse((pendentes.stdout.match(/\{[\s\S]*\}/) ?? ["{}"])[0]).migrations ?? []
  const naoAplicadas = lista.filter((m) => m.local && !m.remote).map((m) => m.local)
  const soNoBanco = lista.filter((m) => m.remote && !m.local).map((m) => m.remote)
  const { novos, removidos, alterados } = compararImpressoes(JSON.parse(readFileSync(IMPRESSAO, "utf8")), lerImpressao())
  const total = novos.length + removidos.length + alterados.length
  if (naoAplicadas.length) console.log(`Migrações locais ainda não aplicadas: ${naoAplicadas.join(", ")}`)
  if (soNoBanco.length) console.log(`Migrações no banco sem arquivo local (git pull?): ${soNoBanco.join(", ")}`)
  if (!total) {
    console.log("Sem deriva: o banco bate com supabase/schema-impressao.json.")
    process.exit(naoAplicadas.length || soNoBanco.length ? 2 : 0)
  }
  const bloco = (rotulo, itens) => itens.length && console.log(`\n${rotulo} (${itens.length}):\n  ${itens.join("\n  ")}`)
  console.log(`DERIVA: ${total} objeto(s) do banco diferem da impressão registrada.`)
  bloco("No banco, fora da impressão", novos)
  bloco("Na impressão, sumiram do banco", removidos)
  bloco("Definição diferente", alterados)
  console.log(
    "\nSe veio de uma migração que você acabou de aplicar: node scripts/db.mjs impressao." +
      "\nSe veio do dashboard/SQL Editor: transforme em migração (npm run db:nova) e regrave a impressão.",
  )
  process.exit(3)
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
if (argv[0] === "aplicar" && r.status === 0) {
  gravarImpressao(lerImpressao())
  // O dicionário (docs/dados/) também acompanha a migração no mesmo commit.
  spawnSync(process.execPath, ["scripts/gerar-dicionario.mjs"], { stdio: "inherit" })
}
process.exit(r.status ?? 1)
