/**
 * Onda B1 (docs/plano-documentacao.md): gera o ROPA, o registro das
 * operações de tratamento (LGPD art. 37), em docs/lgpd/ropa.md.
 *
 * Junta o texto revisável de docs/lgpd/processos.mjs (finalidade, base legal,
 * retenção, compartilhamento…) com docs/dados/dados-pessoais.csv (gerado do
 * banco na A5): cada tabela com dado pessoal cai num processo, e as
 * categorias e titulares de cada processo saem do banco.
 *
 * Falha (código 1) se alguma tabela com dado pessoal não couber em nenhum
 * processo: tabela nova com dado pessoal obriga a atualizar o ROPA.
 *
 * Uso: npm run lgpd:ropa   (não acessa o banco; rode antes `npm run db:dicionario`)
 */
import { readFileSync, writeFileSync } from "node:fs"
import { pathToFileURL } from "node:url"
import { resolve } from "node:path"

const { PROCESSOS, SUBOPERADORES, TRANSVERSAIS } = await import(pathToFileURL(resolve("docs/lgpd/processos.mjs")).href)

// CSV com aspas (descrições têm vírgulas e aspas dobradas).
function lerCsv(texto) {
  const linhas = []
  let campo = "", linha = [], aspas = false
  for (let i = 0; i < texto.length; i++) {
    const c = texto[i]
    if (aspas) {
      if (c === '"' && texto[i + 1] === '"') { campo += '"'; i++ }
      else if (c === '"') aspas = false
      else campo += c
    } else if (c === '"') aspas = true
    else if (c === ",") { linha.push(campo); campo = "" }
    else if (c === "\n") { linha.push(campo); linhas.push(linha); linha = []; campo = "" }
    else if (c !== "\r") campo += c
  }
  if (campo || linha.length) { linha.push(campo); linhas.push(linha) }
  const [cab, ...resto] = linhas
  return resto.map((l) => Object.fromEntries(cab.map((k, i) => [k, l[i] ?? ""])))
}

const registros = lerCsv(readFileSync("docs/dados/dados-pessoais.csv", "utf8"))
const tabelas = new Map() // nome → { modulo, categorias:Set, titulares, descricao, colunas: [{coluna, categoria}] }
for (const r of registros) {
  if (!tabelas.has(r.tabela)) tabelas.set(r.tabela, { modulo: r.modulo, categorias: new Set(), titulares: "", descricao: "", colunas: [] })
  const t = tabelas.get(r.tabela)
  if (!r.coluna) {
    r.categoria.split(";").filter(Boolean).forEach((c) => t.categorias.add(c))
    t.titulares = r.titulares
    t.descricao = r.descricao
  } else t.colunas.push({ coluna: r.coluna, categoria: r.categoria })
}

// Atribuição: primeira regra que casar.
const doProcesso = new Map(PROCESSOS.map((p) => [p.id, []]))
const sem = []
for (const nome of [...tabelas.keys()].sort()) {
  const p = PROCESSOS.find((x) => x.tabelas.test(nome))
  if (p) doProcesso.get(p.id).push(nome)
  else sem.push(nome)
}
if (sem.length) {
  console.error(`Tabelas com dado pessoal sem processo no ROPA (${sem.length}): ${sem.join(", ")}`)
  console.error("Inclua-as em docs/lgpd/processos.mjs.")
  process.exit(1)
}

const ROT = {
  identificacao: "identificação",
  sensivel_sindical: "**sensível: filiação/posição sindical**",
  sensivel_saude: "**sensível: saúde**",
  sensivel_outro: "**sensível: outro**",
  financeiro: "financeiro",
  trabalhista: "trabalhista",
  credencial: "credencial (segredo de acesso, nunca exportar)",
}
const ORDEM_CAT = Object.keys(ROT)
const cel = (s) => String(s ?? "").replace(/\|/g, "\\|").replace(/\r?\n/g, " ")
const sub = (ids) => ids.map((id) => SUBOPERADORES[id]?.nome ?? id).join(", ")
const internacional = (ids) =>
  ids.filter((id) => !/^Brasil|Dados no Brasil/.test(SUBOPERADORES[id]?.local ?? "")).map((id) => `${SUBOPERADORES[id].nome}: ${SUBOPERADORES[id].local}`)

const L = [
  "<!-- GERADO por scripts/gerar-ropa.mjs (npm run lgpd:ropa). Texto: docs/lgpd/processos.mjs. Tabelas e categorias: docs/dados/dados-pessoais.csv. Não editar à mão. -->",
  "",
  "# Registro das operações de tratamento (ROPA)",
  "",
  "> **Rascunho técnico (Onda B1).** As bases legais, os prazos de retenção e a análise de transferência internacional são **propostas** a validar pelo jurídico e pelo encarregado de cada entidade.",
  "",
  "## Papéis",
  "",
  "- **Controladora:** cada entidade sindical (tenant) que usa o Confluir decide sobre o tratamento dos dados dos seus filiados, funcionários e demais titulares.",
  "- **Operador:** o Confluir trata os dados em nome da entidade, conforme as instruções dela (art. 39). Ambos mantêm registro das operações (art. 37).",
  "- **Suboperadores:** contratados pelo Confluir para a infraestrutura (seção ao final; detalhes em `suboperadores.md`, B2).",
  "- **Natureza dos dados:** a base inteira é **dado pessoal sensível**, porque a filiação a sindicato está no art. 5º, II. Há também saúde (CAT, ASO, atendimentos) e dados de menores (dependentes).",
  "",
  "## Visão geral",
  "",
  "| # | Processo | Tabelas | Categorias de dados | Transferência internacional |",
  "|---|---|---|---|---|",
]
for (const p of PROCESSOS) {
  const nomes = doProcesso.get(p.id)
  const cats = new Set(nomes.flatMap((n) => [...tabelas.get(n).categorias]))
  L.push(`| ${p.id} | [${p.nome}](#${p.id.toLowerCase()}) | ${nomes.length} | ${ORDEM_CAT.filter((c) => cats.has(c)).map((c) => ROT[c]).join(", ")} | ${internacional(p.suboperadores).length ? "sim" : "não"} |`)
}

for (const p of PROCESSOS) {
  const nomes = doProcesso.get(p.id)
  const cats = new Set(nomes.flatMap((n) => [...tabelas.get(n).categorias]))
  const titBanco = [...new Set(nomes.map((n) => tabelas.get(n).titulares).filter(Boolean).flatMap((t) => t.split(/[,;]| e /).map((s) => s.trim().toLowerCase())).filter(Boolean))].sort()
  L.push("", `<a id="${p.id.toLowerCase()}"></a>`, `## ${p.id}. ${p.nome}`, "")
  L.push(`**Finalidade.** ${p.finalidade}`, "")
  L.push(`**Titulares.** ${p.titulares}.`, "")
  L.push(`**Categorias de dados.** ${ORDEM_CAT.filter((c) => cats.has(c)).map((c) => ROT[c]).join("; ")}.`, "")
  L.push("**Base legal (proposta).**", "", ...p.baseLegal.map((b) => `- ${b}`), "")
  L.push(`**Compartilhamento com terceiros.** ${p.compartilhamento}`, "")
  L.push(`**Suboperadores.** ${sub(p.suboperadores)}.`, "")
  const intl = internacional(p.suboperadores)
  L.push(`**Transferência internacional.** ${intl.length ? intl.join("; ") + ". Mecanismo do art. 33: cláusulas contratuais (Resolução CD/ANPD 19/2024), a verificar na B2." : "Não."}`, "")
  L.push(`**Retenção.** ${p.retencao}`, "")
  L.push(`**Medidas de segurança.** ${p.seguranca}`, "")
  if (p.observacoes) L.push(`**Observações.** ${p.observacoes}`, "")
  L.push(
    `<details><summary>Tabelas (${nomes.length}) e colunas com dado pessoal</summary>`,
    "",
    "| Tabela | Categorias | Colunas com dado pessoal |",
    "|---|---|---|",
  )
  for (const n of nomes) {
    const t = tabelas.get(n)
    const cols = t.colunas.map((c) => `\`${c.coluna}\` (${c.categoria.replace("sensivel_", "sens. ")})`).join(", ")
    L.push(`| [${n}](../dados/dicionario/${t.modulo}.md#${n}) | ${ORDEM_CAT.filter((c) => t.categorias.has(c)).map((c) => c.replace("sensivel_", "sens. ")).join(", ")} | ${cel(cols) || "_pela existência do registro_"} |`)
  }
  L.push("", "</details>")
  if (titBanco.length) L.push("", `<sub>Titulares registrados no banco para estas tabelas: ${cel(titBanco.join("; "))}.</sub>`)
}

L.push("", "## Fluxos transversais", "")
for (const t of TRANSVERSAIS) L.push(`### ${t.nome}`, "", t.texto, "")

L.push("## Suboperadores", "", "| Suboperador | Papel | Localização | Processos |", "|---|---|---|---|")
for (const [id, s] of Object.entries(SUBOPERADORES)) {
  const ps = PROCESSOS.filter((p) => p.suboperadores.includes(id)).map((p) => p.id)
  L.push(`| ${s.nome} | ${s.papel} | ${s.local} | ${ps.join(", ")} |`)
}

const total = [...doProcesso.values()].reduce((a, b) => a + b.length, 0)
L.push("", `---`, "", `Cobertura: ${total} de ${tabelas.size} tabelas com dado pessoal atribuídas a ${PROCESSOS.length} processos.`)
writeFileSync("docs/lgpd/ropa.md", L.join("\n") + "\n")
console.log(`ROPA gerado: ${PROCESSOS.length} processos, ${total}/${tabelas.size} tabelas com dado pessoal → docs/lgpd/ropa.md`)
