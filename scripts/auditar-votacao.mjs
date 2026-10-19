/**
 * Onda C (docs/plano-documentacao.md; docs/votacao/dossie-auditoria.md):
 * conferência independente de uma votação, direto no banco e só com leitura.
 * Serve para a comissão eleitoral, para responder a uma impugnação e para o
 * cron/rotina do operador.
 *
 * Verificações (cada uma OK/FALHA):
 *   C1 Participação × votos: em cada rodada, quem votou (hora_voto) = soma,
 *      por assembleia, dos votos da pergunta mais votada.
 *   C2 Perguntas completas: numa assembleia, toda pergunta tem o mesmo total.
 *   C3 Sigilo: nenhum voto com eleitor_id; nenhum voto com hora (só o início
 *      do mês); nenhum voto em separado ligado em assembleia encerrada.
 *   C4 Unicidade: nenhum CPF com duas participações na mesma rodada; nenhum
 *      comprovante repetido.
 *   C5 Resultado congelado: nas assembleias encerradas, o resultado gravado
 *      no encerramento (voto_resultado_final) = contagem atual dos votos
 *      válidos (digitais + urnas físicas apuradas). Diferença = voto alterado
 *      depois do encerramento.
 *
 * Só agrega números: nenhum dado de eleitor sai no relatório.
 *
 * Uso:
 *   npm run votacao:auditar                       # todas as rodadas do sistema novo
 *   npm run votacao:auditar -- --rodada=<uuid>
 *   npm run votacao:auditar -- --saida=relatorio.md
 *   npm run votacao:auditar -- --incluir-demo     # inclui o tenant de demonstração
 * Lê SUPABASE_DB_URL do .env.local. Código de saída 1 se alguma verificação falhar.
 */
import { readFileSync, writeFileSync } from "node:fs"
import { spawnSync } from "node:child_process"

const URL_BANCO = readFileSync(".env.local", "utf8")
  .split(/\r?\n/)
  .find((l) => l.startsWith("SUPABASE_DB_URL="))
  ?.slice("SUPABASE_DB_URL=".length)
  .trim()
  .replace(/^["']|["']$/g, "")
if (!URL_BANCO) {
  console.error("Falta SUPABASE_DB_URL no .env.local.")
  process.exit(1)
}
const args = Object.fromEntries(
  process.argv.slice(2).map((a) => {
    const [k, v] = a.replace(/^--/, "").split("=")
    return [k, v ?? true]
  }),
)
const rodada = typeof args.rodada === "string" ? args.rodada : null
if (rodada && !/^[0-9a-f-]{36}$/i.test(rodada)) {
  console.error("--rodada precisa ser um uuid.")
  process.exit(1)
}

function consulta(sql) {
  const r = spawnSync("psql", [URL_BANCO, "-X", "-A", "-t", "-v", "ON_ERROR_STOP=1", "-c", `select coalesce(json_agg(x), '[]') from (${sql}) x`], {
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
  })
  if (r.status !== 0) {
    console.error((r.stderr || "").replaceAll(URL_BANCO, "<url>"))
    process.exit(1)
  }
  return JSON.parse(r.stdout)
}

// Rodadas do sistema novo (votos sem bubble_id) ou a pedida. O tenant de
// demonstração (slug "demo", dados fictícios de teste) fica de fora, salvo
// --incluir-demo.
const semDemo = args["incluir-demo"] ? "" : "and %s.emp_proprietaria_id not in (select empresa_id from tenants where slug = 'demo')"
const filtroRodada = (rodada ? `and v.rod_assembleia_id = '${rodada}' ` : "") + semDemo.replace("%s", "v")
const filtroRodadaA = (rodada ? `and a.rod_assembleia_id = '${rodada}' ` : "") + semDemo.replace("%s", "a")

const c1 = consulta(`
  with por_pergunta as (
    select v.rod_assembleia_id, v.assembleia_id, v.pergunta_id, count(*) n
      from voto_online v where v.bubble_id is null and v.em_separado_id is null ${filtroRodada}
     group by 1, 2, 3),
  por_assembleia as (select rod_assembleia_id, assembleia_id, max(n) mx from por_pergunta group by 1, 2),
  por_rodada as (select rod_assembleia_id, sum(mx)::int votantes from por_assembleia group by 1),
  part as (select a.rod_assembleia_id, count(*) filter (where a.hora_voto is not null and a.presenca_em is null)::int participacoes
             from voto_assembleias_aptos a group by 1)
  select r.rod_assembleia_id rodada, coalesce(rr.nome_assembleia, rr.codigo, '') nome, r.votantes, coalesce(p.participacoes, 0) participacoes
    from por_rodada r
    left join part p using (rod_assembleia_id)
    left join voto_rod_assembleias rr on rr.id = r.rod_assembleia_id
   order by 3 desc`)

const c2 = consulta(`
  select v.assembleia_id, min(n)::int minimo, max(n)::int maximo from (
    select v.assembleia_id, v.pergunta_id, count(*) n from voto_online v
     where v.bubble_id is null and v.em_separado_id is null ${filtroRodada} group by 1, 2) v
   group by 1 having min(n) <> max(n)`)

const [c3] = consulta(`
  select
    (select count(*) from voto_online where eleitor_id is not null)::int com_eleitor,
    (select count(*) from voto_online v where (v.created_at <> date_trunc('month', v.created_at) or v.updated_at is distinct from v.created_at) ${filtroRodada})::int com_hora,
    (select count(*) from voto_online v join voto_assembleias a on a.id = v.assembleia_id
      where v.em_separado_id is not null and a.apuracao_encerrada ${filtroRodada})::int em_separado_ligado_encerrada`)

const [c4] = consulta(`
  select
    (select count(*) from (select a.rod_assembleia_id, a.cpf from voto_assembleias_aptos a
       where a.hora_voto is not null and a.cpf is not null ${filtroRodadaA} group by 1, 2 having count(*) > 1) d)::int cpf_duplo,
    (select count(*) from (select a.comprovante_codigo from voto_assembleias_aptos a
       where a.comprovante_codigo is not null ${filtroRodadaA} group by 1 having count(*) > 1) d)::int comprovante_repetido`)

const c5 = consulta(`
  with encerradas as (
    select a.id from voto_assembleias a
     where a.apuracao_encerrada and exists (select 1 from voto_resultado_final r where r.assembleia_id = a.id) ${filtroRodadaA}),
  congelado as (
    select r.assembleia_id, r.pergunta_id, r.opcao_id, r.tipo, sum(r.quantidade)::int q
      from voto_resultado_final r join encerradas e on e.id = r.assembleia_id group by 1, 2, 3, 4),
  digital as (
    select v.assembleia_id, v.pergunta_id, v.resposta_id opcao_id, count(*)::int q
      from voto_online v join encerradas e on e.id = v.assembleia_id
     where coalesce(v.valido, true) group by 1, 2, 3),
  fisico as (
    select u.assembleia_id, c.pergunta_id, c.opcao_id, sum(c.quantidade)::int q
      from voto_apuracao_contagem c
      join voto_apuracao_urna au on au.id = c.apuracao_urna_id
      join voto_urnas u on u.id = au.urna_id
      join encerradas e on e.id = u.assembleia_id
     where c.tipo = 'opcao' group by 1, 2, 3),
  atual as (
    select assembleia_id, pergunta_id, opcao_id, sum(q)::int q from (select * from digital union all select * from fisico) t group by 1, 2, 3)
  select coalesce(c.assembleia_id, a.assembleia_id) assembleia_id, coalesce(c.pergunta_id, a.pergunta_id) pergunta_id,
         coalesce(c.opcao_id, a.opcao_id) opcao_id, coalesce(c.q, 0) congelado, coalesce(a.q, 0) atual
    from (select * from congelado where tipo = 'opcao') c
    full join atual a on a.assembleia_id = c.assembleia_id and a.pergunta_id = c.pergunta_id and a.opcao_id = c.opcao_id
   where coalesce(c.q, 0) <> coalesce(a.q, 0)`)
const [c5n] = consulta(`select count(*)::int encerradas from voto_assembleias a
  where a.apuracao_encerrada and exists (select 1 from voto_resultado_final r where r.assembleia_id = a.id) ${filtroRodadaA}`)

// ── Relatório ─────────────────────────────────────────────────────────────
const falhasC1 = c1.filter((r) => r.votantes !== r.participacoes)
const verificacoes = [
  ["C1", "Participação × votos por rodada", falhasC1.length === 0, `${c1.length} rodada(s); ${falhasC1.length} com diferença`],
  ["C2", "Perguntas da mesma assembleia com o mesmo total", c2.length === 0, `${c2.length} assembleia(s) com perguntas desiguais`],
  ["C3", "Sigilo: voto sem eleitor, sem hora, em separado desligado", c3.com_eleitor + c3.com_hora + c3.em_separado_ligado_encerrada === 0,
    `com eleitor ${c3.com_eleitor}; com hora ${c3.com_hora}; em separado ligado após encerrar ${c3.em_separado_ligado_encerrada}`],
  ["C4", "Unicidade: um voto por CPF e comprovantes únicos", c4.cpf_duplo + c4.comprovante_repetido === 0,
    `CPF com duas participações ${c4.cpf_duplo}; comprovante repetido ${c4.comprovante_repetido}`],
  ["C5", "Resultado congelado = votos atuais", c5.length === 0, `${c5n.encerradas} assembleia(s) encerrada(s) com resultado gravado; ${c5.length} opção(ões) divergente(s)`],
]

const agora = new Date().toISOString().replace("T", " ").slice(0, 16)
const L = [
  `# Conferência de votação${rodada ? ` (rodada ${rodada})` : ""}`,
  "",
  `Gerado em ${agora} UTC por \`scripts/auditar-votacao.mjs\`, só com leitura do banco e só com números.`,
  "",
  "| # | Verificação | Resultado | Detalhe |",
  "|---|---|---|---|",
  ...verificacoes.map(([id, nome, ok, det]) => `| ${id} | ${nome} | ${ok ? "OK" : "**FALHA**"} | ${det} |`),
  "",
  "## C1 por rodada",
  "",
  "| Rodada | Votantes pelos votos | Participações registradas |",
  "|---|---|---|",
  ...c1.map((r) => `| ${r.nome || r.rodada} | ${r.votantes} | ${r.participacoes}${r.votantes !== r.participacoes ? " **≠**" : ""} |`),
]
if (c2.length) L.push("", "## C2 — assembleias com perguntas desiguais", "", ...c2.map((r) => `- ${r.assembleia_id}: mínimo ${r.minimo}, máximo ${r.maximo}`))
if (c5.length) L.push("", "## C5 — divergências", "", "| Assembleia | Pergunta | Opção | Congelado | Atual |", "|---|---|---|---|---|", ...c5.map((r) => `| ${r.assembleia_id} | ${r.pergunta_id} | ${r.opcao_id} | ${r.congelado} | ${r.atual} |`))
L.push("", "Votos em separado e votos da urna física entram em C5 (resultado), não em C1 (participação online). Votações migradas do Bubble ficam fora de C1/C2.")

const texto = L.join("\n") + "\n"
if (typeof args.saida === "string") {
  writeFileSync(args.saida, texto)
  console.log(`Relatório gravado em ${args.saida}`)
}
for (const [id, nome, ok, det] of verificacoes) console.log(`${ok ? "OK   " : "FALHA"} ${id} ${nome} — ${det}`)
process.exit(verificacoes.every((v) => v[2]) ? 0 : 1)
