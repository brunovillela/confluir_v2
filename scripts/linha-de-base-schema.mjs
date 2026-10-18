/**
 * Onda A1 do plano de documentação (docs/plano-documentacao.md): extrai o
 * schema de produção, SEM DADOS, como a migração-raiz da CLI do Supabase.
 *
 * POR QUÊ: 114 das tabelas que o código usa não são criadas por nenhum SQL do
 * repositório (o núcleo nasceu no dashboard na migração do Bubble). Sem esta
 * linha de base o banco não se reconstrói a partir do repositório.
 *
 * O QUE GERA:
 *   supabase/migrations/<versao>_linha_de_base.sql
 *     1. extensões (create extension if not exists … with schema …)
 *     2. pg_dump --schema-only do schema public (tabelas, views, funções,
 *        triggers, RLS, policies, grants, comentários)
 *     3. o que mora fora de public e é nosso: buckets e policies de storage,
 *        triggers em auth.users, jobs do pg_cron (como comentário)
 *   docs/operacao/linha-de-base-contagens.md
 *     contagens de produção para conferir a restauração (A6)
 *
 * Usa o pg_dump/psql locais (não precisa de Docker, ao contrário do
 * `supabase db dump`). Lê SUPABASE_DB_URL do .env.local: a URI do "Session
 * pooler" do dashboard (Connect → Session pooler), com a senha do banco.
 * A URI nunca é impressa.
 *
 * Uso:
 *   node scripts/linha-de-base-schema.mjs                 # só contagens
 *   node scripts/linha-de-base-schema.mjs --gravar        # gera os arquivos
 *   node scripts/linha-de-base-schema.mjs --gravar --versao=20261018000000
 */
import { readFileSync, writeFileSync, mkdirSync } from "node:fs"
import { spawnSync } from "node:child_process"

const env = Object.fromEntries(
  readFileSync(".env.local", "utf8")
    .split(/\r?\n/)
    .filter((l) => /^[A-Z_]+=/.test(l))
    .map((l) => {
      const i = l.indexOf("=")
      return [l.slice(0, i), l.slice(i + 1).trim().replace(/^["']|["']$/g, "")]
    }),
)
const URL_BANCO = env.SUPABASE_DB_URL
if (!URL_BANCO) {
  console.error("Falta SUPABASE_DB_URL no .env.local (URI do Session pooler, com a senha).")
  process.exit(1)
}

const args = Object.fromEntries(
  process.argv.slice(2).map((a) => {
    const [k, v] = a.replace(/^--/, "").split("=")
    return [k, v ?? true]
  }),
)
const VERSAO = args.versao ?? "20261018000000"

function rodar(cmd, argv) {
  const r = spawnSync(cmd, argv, { encoding: "utf8", maxBuffer: 512 * 1024 * 1024 })
  if (r.status !== 0) {
    // Não repassa argv: contém a URI com a senha.
    console.error(`${cmd} falhou (código ${r.status}):\n${(r.stderr || "").replaceAll(URL_BANCO, "<url>")}`)
    process.exit(1)
  }
  return r.stdout
}

/** Uma consulta → linhas (colunas separadas por \t). */
function sql(consulta) {
  const saida = rodar("psql", [URL_BANCO, "-X", "-A", "-t", "-F", "\t", "-v", "ON_ERROR_STOP=1", "-c", consulta])
  return saida.split(/\r?\n/).filter((l) => l !== "").map((l) => l.split("\t"))
}

// ---------------------------------------------------------------------------
// Contagens (sempre)
// ---------------------------------------------------------------------------
const [[versaoServidor]] = sql("show server_version")
const CONTAGENS = {
  "Tabelas (public)": "select count(*) from pg_tables where schemaname = 'public'",
  "Views (public)": "select count(*) from pg_views where schemaname = 'public'",
  "Views materializadas (public)": "select count(*) from pg_matviews where schemaname = 'public'",
  "Funções (public)":
    "select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and not exists (select 1 from pg_depend d where d.objid = p.oid and d.deptype = 'e')",
  "Triggers (public)":
    "select count(*) from pg_trigger t join pg_class c on c.oid = t.tgrelid join pg_namespace n on n.oid = c.relnamespace where n.nspname = 'public' and not t.tgisinternal",
  "Policies (public)": "select count(*) from pg_policies where schemaname = 'public'",
  "Tabelas com RLS ligado (public)":
    "select count(*) from pg_class c join pg_namespace n on n.oid = c.relnamespace where n.nspname = 'public' and c.relkind = 'r' and c.relrowsecurity",
  "Índices (public)": "select count(*) from pg_indexes where schemaname = 'public'",
  "Tipos enum (public)":
    "select count(*) from pg_type t join pg_namespace n on n.oid = t.typnamespace where n.nspname = 'public' and t.typtype = 'e'",
  "Sequências (public)": "select count(*) from pg_sequences where schemaname = 'public'",
  "Buckets (storage)": "select count(*) from storage.buckets",
  "Policies (storage)": "select count(*) from pg_policies where schemaname = 'storage'",
  "Triggers em auth.users":
    "select count(*) from pg_trigger t where t.tgrelid = 'auth.users'::regclass and not t.tgisinternal",
}
const contagens = Object.fromEntries(Object.entries(CONTAGENS).map(([rotulo, q]) => [rotulo, Number(sql(q)[0][0])]))

console.log(`Postgres ${versaoServidor}`)
for (const [rotulo, n] of Object.entries(contagens)) console.log(`  ${rotulo.padEnd(34)} ${n}`)

if (!args.gravar) {
  console.log("\nSó contagens. Use --gravar para gerar a linha de base.")
  process.exit(0)
}

// ---------------------------------------------------------------------------
// 1. Extensões
// ---------------------------------------------------------------------------
const extensoes = sql(
  "select e.extname, n.nspname from pg_extension e join pg_namespace n on n.oid = e.extnamespace where e.extname <> 'plpgsql' order by 1",
)
const blocoExtensoes = extensoes
  .map(([nome, schema]) => `create extension if not exists "${nome}" with schema "${schema}";`)
  .join("\n")

// ---------------------------------------------------------------------------
// 2. pg_dump do schema public
// ---------------------------------------------------------------------------
const dump = rodar("pg_dump", [
  URL_BANCO,
  "--schema-only",
  "--schema=public",
  "--no-owner",
])
  .split(/\r?\n/)
  // Ruído de versão do pg_dump 17 que o SQL Editor e a CLI não aceitam bem.
  .filter((l) => !/^\\(restrict|unrestrict) /.test(l))
  // Num Supabase novo quem aplica é `postgres`, que não pode mexer nos
  // privilégios padrão de `supabase_admin` (o próprio Supabase já os cria).
  .filter((l) => !/^ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin /.test(l))
  // O schema public já existe em qualquer banco novo.
  .map((l) => (l === "CREATE SCHEMA public;" ? "CREATE SCHEMA IF NOT EXISTS public;" : l))
  .join("\n")

// ---------------------------------------------------------------------------
// 3. O que é nosso fora de public
// ---------------------------------------------------------------------------
const lit = (v) => (v === "" || v == null ? "null" : `'${String(v).replaceAll("'", "''")}'`)

const buckets = sql(
  "select id, name, public::text, coalesce(file_size_limit::text, ''), coalesce(array_to_string(allowed_mime_types, ','), '') from storage.buckets order by id",
)
const blocoBuckets = buckets
  .map(([id, nome, publico, limite, mimes]) => {
    const arr = mimes ? `array[${mimes.split(",").map(lit).join(", ")}]` : "null"
    return `insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)\nvalues (${lit(id)}, ${lit(nome)}, ${publico}, ${limite || "null"}, ${arr})\non conflict (id) do nothing;`
  })
  .join("\n")

const policiesStorage = sql(`
  select policyname, tablename, permissive, cmd, array_to_string(roles, ','),
         coalesce(qual, ''), coalesce(with_check, '')
    from pg_policies where schemaname = 'storage' order by tablename, policyname`)
const blocoPoliciesStorage = policiesStorage
  .map(([nome, tabela, permissiva, cmd, papeis, usando, checar]) => {
    const linhas = [
      `drop policy if exists "${nome}" on storage."${tabela}";`,
      `create policy "${nome}" on storage."${tabela}"`,
      `  as ${permissiva.toLowerCase()} for ${cmd.toLowerCase()}`,
      `  to ${papeis.split(",").map((p) => (p === "public" ? "public" : `"${p}"`)).join(", ")}`,
    ]
    if (usando) linhas.push(`  using (${usando})`)
    if (checar) linhas.push(`  with check (${checar})`)
    return linhas.join("\n") + ";"
  })
  .join("\n\n")

const triggersAuth = sql(
  "select tgname, pg_get_triggerdef(t.oid) from pg_trigger t where t.tgrelid = 'auth.users'::regclass and not t.tgisinternal order by 1",
)
const blocoTriggersAuth = triggersAuth
  .map(([nome, def]) => `drop trigger if exists "${nome}" on auth.users;\n${def};`)
  .join("\n")

let blocoCron = "-- (pg_cron não instalado)"
if (extensoes.some(([n]) => n === "pg_cron")) {
  const jobs = sql("select jobname, schedule, command from cron.job order by jobname")
  blocoCron = jobs.length
    ? jobs.map(([n, s, c]) => `-- ${n} | ${s} | ${c.replace(/\s+/g, " ")}`).join("\n")
    : "-- (nenhum job)"
}

// ---------------------------------------------------------------------------
// Gravação
// ---------------------------------------------------------------------------
const hoje = new Date().toISOString().slice(0, 10)
const cabecalho = `-- Confluir — LINHA DE BASE do schema (${hoje})
--
-- POR QUÊ: até aqui o schema foi construído com ~240 SQLs soltos no SQL Editor
-- e, no núcleo, direto no dashboard. Este arquivo é o retrato de produção sem
-- dados, gerado por scripts/linha-de-base-schema.mjs (Onda A1,
-- docs/plano-documentacao.md). Daqui em diante toda mudança é uma migração
-- nova em supabase/migrations/ (\`npx supabase migration new <nome>\`).
--
-- Em produção esta migração NÃO roda: é marcada como aplicada com
--   npx supabase migration repair --status applied ${VERSAO} --db-url "$SUPABASE_DB_URL"
-- Num banco novo (Supabase vazio), roda inteira.
--
-- Postgres de origem: ${versaoServidor}

-- 1. Extensões ---------------------------------------------------------------
${blocoExtensoes}

-- 2. Schema public (pg_dump --schema-only) -----------------------------------
${dump}

-- 3a. Storage: buckets ----------------------------------------------------------
${blocoBuckets || "-- (nenhum)"}

-- 3b. Storage: policies ---------------------------------------------------------
${blocoPoliciesStorage || "-- (nenhuma)"}

-- 3c. Triggers em auth.users ----------------------------------------------------
${blocoTriggersAuth || "-- (nenhum)"}

-- 3d. Jobs do pg_cron (registro; recriar à mão se necessário) --------------------
${blocoCron}
`

mkdirSync("supabase/migrations", { recursive: true })
const arquivo = `supabase/migrations/${VERSAO}_linha_de_base.sql`
writeFileSync(arquivo, cabecalho)

mkdirSync("docs/operacao", { recursive: true })
writeFileSync(
  "docs/operacao/linha-de-base-contagens.md",
  `# Linha de base do schema — contagens de produção

Gerado por \`scripts/linha-de-base-schema.mjs\` em ${hoje}, junto com \`${arquivo}\`.
Serve para conferir a restauração de um banco do zero (Onda A6): aplicada a
linha de base num Supabase vazio, as contagens devem bater (exceto objetos que
o próprio Supabase cria).

Postgres de origem: ${versaoServidor}

| Objeto | Produção |
|---|---|
${Object.entries(contagens).map(([r, n]) => `| ${r} | ${n} |`).join("\n")}

Extensões: ${extensoes.map(([n, s]) => `\`${n}\` (${s})`).join(", ")}
`,
)
console.log(`\nGravado: ${arquivo} (${(cabecalho.length / 1024).toFixed(0)} KB)`)
console.log("Gravado: docs/operacao/linha-de-base-contagens.md")
