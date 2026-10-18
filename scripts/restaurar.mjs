/**
 * Onda A6 (docs/plano-documentacao.md) e ensaio de recuperação (Onda E):
 * reconstrói o banco do Confluir a partir do repositório num projeto Supabase
 * VAZIO e confere que o resultado é igual a produção.
 *
 *   1. aplica supabase/migrations/ (linha de base + migrações) com a CLI;
 *   2. compara public.schema_impressao() do banco restaurado com
 *      supabase/schema-impressao.json (a impressão de produção);
 *   3. (--seed) roda as seeds do tenant demo (supabase/seed/demo/).
 *
 * Lê SUPABASE_DB_URL_RESTAURO do .env.local (URI do Session pooler do projeto
 * descartável). Recusa rodar se o destino for o mesmo projeto de
 * SUPABASE_DB_URL (produção) ou se o schema public do destino não estiver vazio.
 * Nenhuma URI é impressa.
 *
 * Uso:
 *   node scripts/restaurar.mjs            # 1 e 2
 *   node scripts/restaurar.mjs --seed     # 1, 2 e 3
 *   node scripts/restaurar.mjs --conferir # só 2 (banco já restaurado)
 */
import { readFileSync, readdirSync } from "node:fs"
import { spawnSync } from "node:child_process"
import { createRequire } from "node:module"

const env = Object.fromEntries(
  readFileSync(".env.local", "utf8")
    .split(/\r?\n/)
    .filter((l) => /^[A-Z_]+=/.test(l))
    .map((l) => {
      const i = l.indexOf("=")
      return [l.slice(0, i), l.slice(i + 1).trim().replace(/^["']|["']$/g, "")]
    }),
)
const DESTINO = env.SUPABASE_DB_URL_RESTAURO
const PRODUCAO = env.SUPABASE_DB_URL
const args = new Set(process.argv.slice(2))
const esconder = (s) => [DESTINO, PRODUCAO].filter(Boolean).reduce((t, u) => t.replaceAll(u, "<url>"), s ?? "")

if (!DESTINO) {
  console.error("Falta SUPABASE_DB_URL_RESTAURO no .env.local (URI do Session pooler do projeto descartável).")
  process.exit(1)
}
const ref = (u) => new URL(u).username.split(".")[1] ?? new URL(u).hostname
if (PRODUCAO && ref(DESTINO) === ref(PRODUCAO)) {
  console.error("RECUSADO: SUPABASE_DB_URL_RESTAURO aponta para o mesmo projeto de produção.")
  process.exit(1)
}

function psql(sql, { arquivo } = {}) {
  const r = spawnSync(
    "psql",
    [DESTINO, "-X", "-A", "-t", "-v", "ON_ERROR_STOP=1", ...(arquivo ? ["-f", arquivo] : ["-c", sql])],
    { encoding: "utf8", maxBuffer: 256 * 1024 * 1024 },
  )
  return { ok: r.status === 0, saida: esconder(r.stdout), erro: esconder(r.stderr) }
}

// 1. Migrações ----------------------------------------------------------------
if (!args.has("--conferir")) {
  const tabelas = Number(psql("select count(*) from pg_tables where schemaname = 'public'").saida.trim())
  if (tabelas > 0) {
    console.error(`RECUSADO: o destino já tem ${tabelas} tabelas em public. Use um projeto vazio (ou --conferir).`)
    process.exit(1)
  }
  console.log("1. Aplicando supabase/migrations/ no banco vazio…")
  const CLI = createRequire(import.meta.url).resolve("supabase/dist/supabase.js")
  const r = spawnSync(process.execPath, [CLI, "db", "push", "--db-url", DESTINO, "--include-all", "--yes"], {
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
  })
  process.stdout.write(esconder(r.stdout) + esconder(r.stderr))
  if (r.status !== 0) {
    console.error("Falhou ao aplicar as migrações.")
    process.exit(1)
  }
}

// 2. Impressão ----------------------------------------------------------------
console.log("\n2. Comparando a impressão do banco restaurado com supabase/schema-impressao.json…")
const imp = psql("select public.schema_impressao()")
if (!imp.ok) {
  console.error(imp.erro)
  process.exit(1)
}
const restaurada = JSON.parse(imp.saida)
const producao = JSON.parse(readFileSync("supabase/schema-impressao.json", "utf8"))
const novos = Object.keys(restaurada).filter((k) => !(k in producao)).sort()
const faltam = Object.keys(producao).filter((k) => !(k in restaurada)).sort()
const diferentes = Object.keys(restaurada).filter((k) => k in producao && producao[k] !== restaurada[k]).sort()
console.log(`   produção: ${Object.keys(producao).length} objetos · restaurado: ${Object.keys(restaurada).length}`)
const bloco = (rotulo, itens) => itens.length && console.log(`\n   ${rotulo} (${itens.length}):\n     ${itens.join("\n     ")}`)
bloco("Só no restaurado", novos)
bloco("Faltam no restaurado", faltam)
bloco("Definição diferente", diferentes)
const identico = !novos.length && !faltam.length && !diferentes.length
console.log(identico ? "   IDÊNTICO: o repositório reconstrói o schema de produção." : "\n   Há diferenças (acima).")

// 3. Seeds do demo ----------------------------------------------------------------
if (args.has("--seed")) {
  console.log("\n3. Seeds do tenant demo…")
  // O destino já foi conferido como não-produção: esvazia as tabelas para o
  // ensaio poder ser repetido (cada seed apaga e reinsere só o que é dela, e
  // umas referenciam as outras).
  const limpar = psql(
    "do $$ declare t text; begin for t in select format('%I', tablename) from pg_tables where schemaname = 'public' loop execute 'truncate table public.' || t || ' cascade'; end loop; end $$",
  )
  if (!limpar.ok) {
    console.error(limpar.erro)
    process.exit(1)
  }
  // Ordem das dependências: pessoal cria o tenant demo; filiados antes de quem
  // aponta para filiado (custeio, hospedagem, portal, públicos); financeiro
  // (centros de custo) antes de custeio/institucional; hospedagem (hóspedes) antes
  // de saude; saude (profissionais)
  // antes de portal. Depois, alfabética.
  const PRIMEIRAS = ["pessoal", "perfis", "filiados", "filiados-extra", "financeiro", "compras", "hospedagem", "saude"].map((s) => `demo-seed-${s}.sql`)
  const seeds = readdirSync("supabase/seed/demo").filter((f) => f.endsWith(".sql")).sort()
  const ordem = [...PRIMEIRAS.filter((f) => seeds.includes(f)), ...seeds.filter((f) => !PRIMEIRAS.includes(f))]
  for (const f of ordem) {
    const r = psql(null, { arquivo: `supabase/seed/demo/${f}` })
    console.log(`   ${r.ok ? "ok   " : "FALHA"} ${f}${r.ok ? "" : `\n         ${r.erro.trim().split("\n").slice(-3).join("\n         ")}`}`)
  }
}

process.exit(identico ? 0 : 2)
