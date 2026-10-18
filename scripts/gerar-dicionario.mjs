/**
 * Onda A5 (docs/plano-documentacao.md): gera o dicionário de dados a partir
 * do próprio banco: catálogo + comentários com etiquetas [lgpd:…] (A4).
 *
 * Gera (e sobrescreve) docs/dados/:
 *   views-e-storage.md         views, views materializadas e buckets
 *   LEIA-ME.md                 índice por módulo, contagens, como regenerar
 *   dicionario/<modulo>.md     cada tabela: descrição, LGPD, colunas, chaves,
 *                              índices, triggers, RLS
 *   er/<modulo>.md             diagrama Mermaid (só chaves) por módulo
 *   rls.md                     policies por tabela + alertas
 *   dados-pessoais.csv         insumo da Onda B (ROPA): tabela/coluna/categoria
 *
 * Determinístico: nada de contagens de linhas nem datas no conteúdo, então
 * regenerar sem mudança no banco não produz diff.
 *
 * Uso: npm run db:dicionario   (lê SUPABASE_DB_URL do .env.local)
 */
import { readFileSync, writeFileSync, mkdirSync, rmSync } from "node:fs"
import { spawnSync } from "node:child_process"

const URL_BANCO = readFileSync(".env.local", "utf8")
  .split(/\r?\n/)
  .find((l) => l.startsWith("SUPABASE_DB_URL="))
  ?.slice("SUPABASE_DB_URL=".length)
  .trim()
  .replace(/^["']|["']$/g, "")
if (!URL_BANCO) {
  console.error("Falta SUPABASE_DB_URL no .env.local (URI do Session pooler, com a senha).")
  process.exit(1)
}

// ---------------------------------------------------------------------------
// Catálogo num JSON só
// ---------------------------------------------------------------------------
const CONSULTA = `
with tab as (
  select c.oid, c.relname nome, c.relrowsecurity rls, c.relforcerowsecurity rls_forcado,
         coalesce(obj_description(c.oid, 'pg_class'), '') comentario
    from pg_class c join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public' and c.relkind in ('r', 'p')
)
select json_agg(json_build_object(
  'nome', t.nome, 'rls', t.rls, 'rls_forcado', t.rls_forcado, 'comentario', t.comentario,
  'colunas', (select json_agg(json_build_object(
       'nome', a.attname, 'tipo', format_type(a.atttypid, a.atttypmod), 'nulo', not a.attnotnull,
       'padrao', pg_get_expr(d.adbin, d.adrelid), 'comentario', coalesce(col_description(t.oid, a.attnum), ''),
       'pk', exists (select 1 from pg_constraint k where k.conrelid = t.oid and k.contype = 'p' and a.attnum = any (k.conkey)))
       order by a.attnum)
     from pg_attribute a left join pg_attrdef d on d.adrelid = t.oid and d.adnum = a.attnum
    where a.attrelid = t.oid and a.attnum > 0 and not a.attisdropped),
  'fks', (select json_agg(json_build_object(
       'nome', k.conname,
       'colunas', (select json_agg(a.attname order by x.ord) from unnest(k.conkey) with ordinality x(n, ord) join pg_attribute a on a.attrelid = t.oid and a.attnum = x.n),
       'ref', k.confrelid::regclass::text,
       'ao_apagar', k.confdeltype) order by k.conname)
     from pg_constraint k where k.conrelid = t.oid and k.contype = 'f'),
  'unicas', (select json_agg(pg_get_constraintdef(k.oid) order by k.conname) from pg_constraint k where k.conrelid = t.oid and k.contype = 'u'),
  'checks', (select json_agg(json_build_object('nome', k.conname, 'def', pg_get_constraintdef(k.oid)) order by k.conname) from pg_constraint k where k.conrelid = t.oid and k.contype = 'c'),
  'indices', (select json_agg(i.indexname order by i.indexname) from pg_indexes i where i.schemaname = 'public' and i.tablename = t.nome),
  'triggers', (select json_agg(json_build_object('nome', g.tgname, 'funcao', g.tgfoid::regproc::text) order by g.tgname) from pg_trigger g where g.tgrelid = t.oid and not g.tgisinternal),
  'policies', (select json_agg(json_build_object('nome', p.policyname, 'cmd', p.cmd, 'permissiva', p.permissive, 'papeis', p.roles, 'usando', p.qual, 'checar', p.with_check) order by p.policyname) from pg_policies p where p.schemaname = 'public' and p.tablename = t.nome)
) order by t.nome)
from tab t`

const r = spawnSync("psql", [URL_BANCO, "-X", "-A", "-t", "-v", "ON_ERROR_STOP=1", "-c", CONSULTA], {
  encoding: "utf8",
  maxBuffer: 256 * 1024 * 1024,
})
if (r.status !== 0) {
  console.error((r.stderr || "").replaceAll(URL_BANCO, "<url>"))
  process.exit(1)
}
const TABELAS = JSON.parse(r.stdout)

// Views, views materializadas e buckets do Storage (o código também os usa).
const r2 = spawnSync(
  "psql",
  [
    URL_BANCO, "-X", "-A", "-t", "-v", "ON_ERROR_STOP=1", "-c",
    `select json_build_object(
       'views', (select json_agg(json_build_object('nome', c.relname, 'materializada', c.relkind = 'm',
                   'comentario', coalesce(obj_description(c.oid, 'pg_class'), ''), 'definicao', pg_get_viewdef(c.oid, true)) order by c.relname)
                   from pg_class c join pg_namespace n on n.oid = c.relnamespace where n.nspname = 'public' and c.relkind in ('v', 'm')),
       'buckets', (select json_agg(json_build_object('id', b.id, 'publico', b.public, 'limite', b.file_size_limit, 'tipos', b.allowed_mime_types) order by b.id)
                   from storage.buckets b))`,
  ],
  { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 },
)
if (r2.status !== 0) {
  console.error((r2.stderr || "").replaceAll(URL_BANCO, "<url>"))
  process.exit(1)
}
const { views: VIEWS = [], buckets: BUCKETS = [] } = JSON.parse(r2.stdout)

// ---------------------------------------------------------------------------
// Módulos (pelo prefixo do nome; a primeira regra que casar vence)
// ---------------------------------------------------------------------------
const MODULOS = [
  ["filiacao", "Filiação e portal do associado", /^(filiacao|filiacoes|portal|oposicao|vinculos|telefones|emails|enderecos|dados_bancarios|registro_sindical|fonte|carencia)/],
  ["empregadores", "Empregadores e grupos empresariais", /^(empresas|grupo_empresarial|grupos)/],
  ["votacao", "Votações e assembleias", /^(voto|votacao)/],
  ["representacao", "Representação, acordos e negociações", /^(acordo|negociacao|negociacoes|representacao|reuniao|ato|atas|agenda)/],
  ["diretoria", "Diretoria e ofícios", /^(diretoria|dir_|oficios)/],
  ["pessoal", "Pessoal (RH da entidade)", /^(pessoal|pes_|prestadores|prestcont|aso$)/],
  ["saude", "Saúde do trabalhador", /^saude/],
  ["juridico", "Jurídico", /^juridico/],
  ["financeiro", "Financeiro", /^(financeiro|ordens|caixa|banco|danfes|orcamentos|centros|comprovantes|cobrancas|despesas|cartoes|receitas|recebimentos)/],
  ["compras", "Compras, fornecedores e contratos", /^(compras|fornecedores|contratos|rpa|fa_|documento|documentos|minutas)/],
  ["institucional", "Institucional, diárias, viagens e patrimônio", /^(institucional|diarias|viagens|linhas|custeio|patrimonio|estoque|reembolsos)/],
  ["hospedagem", "Hospedagem", /^(hospedagem|fil_reemb)/],
  ["cessao", "Cessão de espaços", /^cessao/],
  ["veiculos", "Veículos e condutores", /^(veiculo|veiculos|cnh$)/],
  ["comunicacao", "Comunicação, eventos e avisos", /^(comunicacao|noticias|notificacoes|push|telegram|avisos|eventos|mensagens)/],
  ["ferramentas", "Ferramentas administrativas", /^(demandas|projeto|ferramentas|tabela$|assinaturas)/],
  ["plataforma", "Plataforma, acesso e auditoria", /^(empresa|tenants|plataforma|perfis|perfil_|permissoes|usuario|usuarios|auth_|login_|api_|lgpd_|analitica|webhooks|auditoria)/],
]
const moduloDe = (t) => MODULOS.find(([, , re]) => re.test(t))?.[0] ?? "outros"
const ROTULO = Object.fromEntries([...MODULOS.map(([k, r]) => [k, r]), ["outros", "Outros"]])

// ---------------------------------------------------------------------------
// Etiquetas LGPD
// ---------------------------------------------------------------------------
const ETQ = /\s*\[lgpd:([^\]|]*)(?:\|titulares:([^\]]*))?\]\s*$/
function lerEtiqueta(texto) {
  const m = (texto ?? "").match(ETQ)
  return {
    texto: (texto ?? "").replace(ETQ, "").trim(),
    lgpd: m ? m[1].split(",").map((s) => s.trim()).filter(Boolean) : [],
    titulares: m?.[2]?.trim() ?? "",
  }
}
const ROT_LGPD = {
  identificacao: "identificação",
  sensivel_sindical: "**sensível: sindical**",
  sensivel_saude: "**sensível: saúde**",
  sensivel_outro: "**sensível: outro**",
  financeiro: "financeiro",
  trabalhista: "trabalhista",
  credencial: "**credencial (nunca exportar)**",
  nenhum: "nenhum",
}
const rotLgpd = (l) => l.map((x) => ROT_LGPD[x] ?? x).join(", ")

// ---------------------------------------------------------------------------
// Utilitários de Markdown
// ---------------------------------------------------------------------------
const cel = (s) => String(s ?? "").replace(/\|/g, "\\|").replace(/\r?\n/g, " ").trim()
const cod = (s) => (s ? "`" + String(s).replace(/`/g, "'").replace(/\r?\n/g, " ") + "`" : "")
const AO_APAGAR = { a: "", r: "restrict", c: "**cascade**", n: "set null", d: "set default" }
const ancora = (t) => t.replace(/[^a-z0-9_]/g, "")

for (const t of TABELAS) {
  t.modulo = moduloDe(t.nome)
  Object.assign(t, { ...lerEtiqueta(t.comentario), comentarioOriginal: t.comentario })
  t.colunas = (t.colunas ?? []).map((c) => ({ ...c, ...lerEtiqueta(c.comentario) }))
  for (const k of ["fks", "unicas", "checks", "indices", "triggers", "policies"]) t[k] ??= []
}
const porModulo = new Map()
for (const t of TABELAS) {
  if (!porModulo.has(t.modulo)) porModulo.set(t.modulo, [])
  porModulo.get(t.modulo).push(t)
}
const ordemModulos = [...MODULOS.map(([k]) => k), "outros"].filter((k) => porModulo.has(k))

rmSync("docs/dados/dicionario", { recursive: true, force: true })
rmSync("docs/dados/er", { recursive: true, force: true })
mkdirSync("docs/dados/dicionario", { recursive: true })
mkdirSync("docs/dados/er", { recursive: true })

const AVISO = "<!-- GERADO por scripts/gerar-dicionario.mjs a partir do banco. Não editar à mão: mude o comentário no banco (migração) e rode `npm run db:dicionario`. -->"

// ---------------------------------------------------------------------------
// dicionario/<modulo>.md
// ---------------------------------------------------------------------------
for (const m of ordemModulos) {
  const ts = porModulo.get(m)
  const L = [AVISO, "", `# ${ROTULO[m]}`, "", `${ts.length} tabelas. Diagrama: [er/${m}.md](../er/${m}.md).`, ""]
  L.push("| Tabela | Dado pessoal | Descrição |", "|---|---|---|")
  for (const t of ts) L.push(`| [${t.nome}](#${ancora(t.nome)}) | ${rotLgpd(t.lgpd.filter((x) => x !== "nenhum")) || "—"} | ${cel(t.texto).slice(0, 140)}${t.texto.length > 140 ? "…" : ""} |`)
  for (const t of ts) {
    L.push("", `## ${t.nome}`, "", cel(t.texto) || "_Sem descrição._", "")
    const pessoal = t.lgpd.filter((x) => x !== "nenhum")
    L.push(`- **LGPD:** ${pessoal.length ? rotLgpd(pessoal) : "nenhum dado pessoal"}${t.titulares ? ` · titulares: ${cel(t.titulares)}` : ""}`)
    L.push(`- **RLS:** ${t.rls ? "ligado" : "**DESLIGADO**"}${t.rls_forcado ? " (forçado)" : ""} · policies: ${t.policies.length ? t.policies.map((p) => cod(p.nome)).join(", ") : "**nenhuma**"}`)
    if (t.triggers.length) L.push(`- **Triggers:** ${t.triggers.map((g) => `${cod(g.nome)} → ${cod(g.funcao)}`).join(", ")}`)
    L.push("", "| Coluna | Tipo | Nulo | Padrão | Referência | LGPD | Descrição |", "|---|---|---|---|---|---|---|")
    const fkDe = new Map()
    for (const f of t.fks) if (f.colunas?.length === 1) fkDe.set(f.colunas[0], f)
    for (const c of t.colunas) {
      const f = fkDe.get(c.nome)
      const ref = f ? `→ ${f.ref.replace(/^public\./, "")}${AO_APAGAR[f.ao_apagar] ? ` (${AO_APAGAR[f.ao_apagar]})` : ""}` : ""
      L.push(`| ${c.pk ? "🔑 " : ""}${cod(c.nome)} | ${cel(c.tipo)} | ${c.nulo ? "sim" : "não"} | ${c.padrao ? cod(c.padrao) : ""} | ${cel(ref)} | ${rotLgpd(c.lgpd)} | ${cel(c.texto)} |`)
    }
    const compostas = t.fks.filter((f) => (f.colunas?.length ?? 0) > 1)
    if (compostas.length) L.push("", "Chaves estrangeiras compostas: " + compostas.map((f) => `${cod(f.colunas.join(", "))} → ${f.ref.replace(/^public\./, "")}`).join("; "))
    if (t.unicas.length) L.push("", "Únicas: " + t.unicas.map(cod).join("; "))
    if (t.checks.length) L.push("", "Checks: " + t.checks.map((k) => `${cod(k.nome)} ${cod(k.def)}`).join("; "))
    if (t.indices.length) L.push("", "Índices: " + t.indices.map(cod).join(", "))
  }
  writeFileSync(`docs/dados/dicionario/${m}.md`, L.join("\n") + "\n")
}

// ---------------------------------------------------------------------------
// er/<modulo>.md (Mermaid, só chaves)
// ---------------------------------------------------------------------------
const tipoMermaid = (s) => s.replace(/\(.*\)/, "").replace(/[^A-Za-z0-9_]+/g, "_").replace(/^_|_$/g, "") || "tipo"
for (const m of ordemModulos) {
  const ts = porModulo.get(m)
  const nomes = new Set(ts.map((t) => t.nome))
  const L = [AVISO, "", `# Diagrama — ${ROTULO[m]}`, "", "Só chaves (PK e FK). Tabelas de outros módulos aparecem sem atributos. Colunas e descrições: [dicionário](../dicionario/" + m + ".md).", "", "```mermaid", "erDiagram"]
  const rel = []
  for (const t of ts) {
    const chaves = t.colunas.filter((c) => c.pk || t.fks.some((f) => f.colunas?.includes(c.nome)))
    L.push(`  ${t.nome} {`)
    for (const c of chaves) L.push(`    ${tipoMermaid(c.tipo)} ${c.nome}${c.pk ? " PK" : ""}${t.fks.some((f) => f.colunas?.includes(c.nome)) ? (c.pk ? ",FK" : " FK") : ""}`)
    L.push("  }")
    for (const f of t.fks) {
      const pai = f.ref.replace(/^public\./, "")
      if (pai === "empresa" && f.colunas?.[0] === "emp_proprietaria_id") continue // todas têm; só polui
      const nulo = (f.colunas ?? []).every((n) => t.colunas.find((c) => c.nome === n)?.nulo)
      rel.push(`  ${t.nome} }o--${nulo ? "o|" : "||"} ${pai} : "${(f.colunas ?? []).join(",")}"`)
      if (!nomes.has(pai)) nomes.add(pai)
    }
  }
  L.push(...[...new Set(rel)].sort(), "```")
  writeFileSync(`docs/dados/er/${m}.md`, L.join("\n") + "\n")
}

// ---------------------------------------------------------------------------
// rls.md
// ---------------------------------------------------------------------------
{
  const semRls = TABELAS.filter((t) => !t.rls)
  const semPolicy = TABELAS.filter((t) => t.rls && !t.policies.length)
  const semTenant = TABELAS.filter((t) => !t.colunas.some((c) => c.nome === "emp_proprietaria_id"))
  const vaiParaAnon = (p) => (p.papeis ?? []).includes("anon") || (p.papeis ?? []).includes("public")
  const exigeTenant = (p) => /tenant_id/.test(p.usando ?? "") && (p.checar == null || /tenant_id/.test(p.checar))
  const anon = TABELAS.filter((t) => t.policies.some((p) => vaiParaAnon(p) && !exigeTenant(p)))
  const anonComTenant = TABELAS.filter((t) => t.policies.some((p) => vaiParaAnon(p) && exigeTenant(p)) && !anon.includes(t))
  const L = [AVISO, "", "# RLS — políticas por tabela", ""]
  L.push("O app lê os dados de um tenant com `createAdminClient()` (JWT `authenticated` com a claim `tenant_id`); o `service_role` ignora RLS e é reservado à plataforma. Ver `src/lib/supabase/admin.ts`.", "")
  L.push("## Alertas", "")
  L.push(`- **RLS desligado:** ${semRls.length ? semRls.map((t) => cod(t.nome)).join(", ") : "nenhuma tabela"}`)
  L.push(`- **RLS ligado sem nenhuma policy** (só o service_role lê; com \`createAdminClient()\` grava e não lê, ver armadilha conhecida): ${semPolicy.length ? semPolicy.map((t) => cod(t.nome)).join(", ") : "nenhuma"}`)
  L.push(`- **Sem \`emp_proprietaria_id\`** (tabela de plataforma ou isolamento pelo pai): ${semTenant.length ? semTenant.map((t) => cod(t.nome)).join(", ") : "nenhuma"}`)
  L.push(`- **Policy que vale para \`anon\`/\`public\` sem exigir \`tenant_id\` no JWT:** ${anon.length ? anon.map((t) => cod(t.nome)).join(", ") : "nenhuma"}`)
  L.push(`- Policy para \`public\` que exige \`tenant_id\` (a chave anônima não tem a claim e não enxerga nada; conferido em 18/10/2026 por GET com a anon key → 0 linhas): ${anonComTenant.length ? anonComTenant.map((t) => cod(t.nome)).join(", ") : "nenhuma"}`)
  L.push("", "## Por tabela", "", "| Tabela | Módulo | RLS | Policy | Comando | Papéis | USING | WITH CHECK |", "|---|---|---|---|---|---|---|---|")
  for (const t of TABELAS) {
    if (!t.policies.length) {
      L.push(`| ${cod(t.nome)} | ${t.modulo} | ${t.rls ? "sim" : "**não**"} | — | | | | |`)
      continue
    }
    for (const p of t.policies)
      L.push(`| ${cod(t.nome)} | ${t.modulo} | ${t.rls ? "sim" : "**não**"} | ${cod(p.nome)} | ${p.cmd} | ${(p.papeis ?? []).join(", ")} | ${cod(p.usando)} | ${cod(p.checar)} |`)
  }
  writeFileSync("docs/dados/rls.md", L.join("\n") + "\n")
}

// ---------------------------------------------------------------------------
// dados-pessoais.csv
// ---------------------------------------------------------------------------
{
  const csv = (s) => `"${String(s ?? "").replace(/"/g, '""')}"`
  const L = ["modulo,tabela,coluna,categoria,titulares,descricao"]
  for (const t of TABELAS) {
    const pessoal = t.lgpd.filter((x) => x !== "nenhum")
    if (!pessoal.length) continue
    L.push([t.modulo, t.nome, "", pessoal.join(";"), t.titulares, t.texto].map(csv).join(","))
    for (const c of t.colunas) for (const cat of c.lgpd) L.push([t.modulo, t.nome, c.nome, cat, t.titulares, c.texto].map(csv).join(","))
  }
  writeFileSync("docs/dados/dados-pessoais.csv", L.join("\n") + "\n")
}

// ---------------------------------------------------------------------------
// views-e-storage.md
// ---------------------------------------------------------------------------
{
  const L = [AVISO, "", "# Views e Storage", "", "## Views", ""]
  for (const v of VIEWS) {
    const e = lerEtiqueta(v.comentario)
    L.push(`### ${v.nome}${v.materializada ? " (materializada)" : ""}`, "", cel(e.texto) || "_Sem descrição._", "")
    if (e.lgpd.length) L.push(`- **LGPD:** ${rotLgpd(e.lgpd)}`, "")
    L.push("```sql", (v.definicao ?? "").trim(), "```", "")
  }
  L.push("## Buckets do Storage", "", "Arquivos (documentos pessoais, comprovantes, fotos) ficam aqui, fora das tabelas. Acesso pelo service role no servidor; nenhum bucket tem policy de storage.", "")
  L.push("| Bucket | Público | Limite | Tipos aceitos |", "|---|---|---|---|")
  for (const b of BUCKETS)
    L.push(`| ${cod(b.id)} | ${b.publico ? "**sim**" : "não"} | ${b.limite ? `${Math.round(b.limite / 1024 / 1024)} MB` : ""} | ${cel((b.tipos ?? []).join(", "))} |`)
  writeFileSync("docs/dados/views-e-storage.md", L.join("\n") + "\n")
}

// ---------------------------------------------------------------------------
// LEIA-ME.md
// ---------------------------------------------------------------------------
{
  const cats = {}
  let colsPessoais = 0
  for (const t of TABELAS) {
    for (const x of t.lgpd) if (x !== "nenhum") cats[x] = (cats[x] ?? 0) + 1
    colsPessoais += t.colunas.filter((c) => c.lgpd.length).length
  }
  const comPessoal = TABELAS.filter((t) => t.lgpd.some((x) => x !== "nenhum")).length
  const L = [AVISO, "", "# Dicionário de dados do Confluir", ""]
  L.push(
    `Gerado a partir do banco de produção (catálogo do Postgres + comentários). **${TABELAS.length} tabelas** no schema \`public\`, **${comPessoal}** com dado pessoal (${colsPessoais} colunas etiquetadas).`,
    "",
    "- Etiquetas LGPD: cada tabela termina o comentário com `[lgpd:<categorias>|titulares:<quem>]` e cada coluna com dado pessoal com `[lgpd:<categoria>]` (Onda A4).",
    "- Para mudar uma descrição ou classificação: migração com `comment on …` (`npm run db:nova`), aplicar, e `npm run db:dicionario`.",
    "- [rls.md](rls.md): políticas de acesso por tabela e alertas.",
    `- [views-e-storage.md](views-e-storage.md): ${VIEWS.length} views e ${BUCKETS.length} buckets de arquivos.`,
    "- [dados-pessoais.csv](dados-pessoais.csv): uma linha por tabela e por coluna com dado pessoal. É insumo do ROPA (Onda B).",
    "",
    "## Tabelas com dado pessoal, por categoria",
    "",
    "| Categoria | Tabelas |",
    "|---|---|",
    ...Object.entries(cats).sort((a, b) => b[1] - a[1]).map(([k, n]) => `| ${ROT_LGPD[k] ?? k} | ${n} |`),
    "",
    "## Módulos",
    "",
    "| Módulo | Tabelas | Com dado pessoal | Dicionário | Diagrama |",
    "|---|---|---|---|---|",
    ...ordemModulos.map((m) => {
      const ts = porModulo.get(m)
      return `| ${ROTULO[m]} | ${ts.length} | ${ts.filter((t) => t.lgpd.some((x) => x !== "nenhum")).length} | [dicionario/${m}.md](dicionario/${m}.md) | [er/${m}.md](er/${m}.md) |`
    }),
  )
  writeFileSync("docs/dados/LEIA-ME.md", L.join("\n") + "\n")
}

console.log(`Dicionário gerado: ${TABELAS.length} tabelas em ${ordemModulos.length} módulos → docs/dados/`)
const outros = porModulo.get("outros") ?? []
if (outros.length) console.log(`Em "outros" (${outros.length}): ${outros.map((t) => t.nome).join(", ")}`)
