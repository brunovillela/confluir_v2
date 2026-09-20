// Reembolsos do ACT do Bubble ("PES Reembolsos" e "PES REE Categorias") →
// pessoal_reembolsos_act e pessoal_reembolsos_act_tipos. Pré-requisitos:
// supabase/reembolsos-act.sql e supabase/reembolsos-act-historico.sql.
//
// Repetível: casa pelo bubble_id e atualiza o que mudou na origem, sem tocar no
// que foi escrito aqui depois (descrição, observação da avaliação).
// Situação: reprovado quando a avaliação reprovou; pago quando já tem mês/ano
// de contracheque; senão aprovado. O Bubble não tem "aguardando" no histórico.
//
//   node scripts/migrar-reembolsos-act-bubble.mjs            (simulação)
//   node scripts/migrar-reembolsos-act-bubble.mjs --apply [--tenant <uuid>]
import { readFileSync } from "node:fs"
import { createRequire } from "node:module"

const require = createRequire(import.meta.url)
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
const args = process.argv.slice(2)
const APLICAR = args.includes("--apply")
const i = args.indexOf("--tenant")
const TENANT = i >= 0 ? args[i + 1] : "c763cb99-edfd-4840-8453-ed3fcb66d4a1"
// Sem "version-test": os dados de PRODUÇÃO (a versão de teste está vazia).
const RAIZ = env.BUBBLE_API_ROOT.replace(/\/obj\/?$/, "").replace("/version-test", "") + "/obj/"

const texto = (v) => (String(v ?? "").trim() ? String(v).trim() : null)
const numero = (v) => (typeof v === "number" && Number.isFinite(v) ? v : null)
const data = (v) => (v ? String(v).slice(0, 10) : null)
const url = (v) => {
  const s = texto(v)
  return s ? (s.startsWith("//") ? `https:${s}` : s) : null
}

async function bubble(tipo) {
  const todos = []
  for (let cursor = 0; ; ) {
    const r = await fetch(`${RAIZ}${encodeURIComponent(tipo)}?limit=100&cursor=${cursor}`, {
      headers: { Authorization: `Bearer ${env.BUBBLE_API_TOKEN}` },
    })
    if (!r.ok) throw new Error(`Bubble ${tipo}: HTTP ${r.status}`)
    const { response } = await r.json()
    todos.push(...response.results)
    cursor += response.results.length
    if (!response.remaining) break
  }
  return todos
}

async function tudo(tabela, colunas, filtro = (q) => q) {
  const linhas = []
  for (let de = 0; ; de += 1000) {
    const { data: d, error } = await filtro(db.from(tabela).select(colunas)).range(de, de + 999)
    if (error) throw new Error(`${tabela}: ${error.message}${error.code === "PGRST205" || error.code === "42703" ? " — rode supabase/reembolsos-act-historico.sql" : ""}`)
    linhas.push(...d)
    if (d.length < 1000) break
  }
  return linhas
}

console.log(APLICAR ? "APLICANDO" : "SIMULAÇÃO — nada será gravado", `· tenant ${TENANT}\n`)

const [categorias, reembolsos] = await Promise.all([bubble("pesreecategorias"), bubble("pesreembolsos")])
const noTenant = (q) => q.eq("emp_proprietaria_id", TENANT).order("id")
const [tiposAqui, reembolsosAqui, usuarios] = await Promise.all([
  tudo("pessoal_reembolsos_act_tipos", "id, bubble_id, nome, valor_limite, ativa, proporcao_reembolsavel, icone_url", noTenant),
  tudo("pessoal_reembolsos_act", "id, bubble_id, situacao, valor_aprovado, pagamento_mes, pagamento_ano, despesa_paga_em", noTenant),
  tudo("usuarios", "id, bubble_id", (q) => q.eq("emp_proprietaria_id", TENANT).not("bubble_id", "is", null).order("id")),
])
const usuarioPorBubble = new Map(usuarios.map((u) => [u.bubble_id, u.id]))

// ── Categorias ───────────────────────────────────────────────────────────────
const tipoPorBubble = new Map(tiposAqui.filter((t) => t.bubble_id).map((t) => [t.bubble_id, t]))
const tiposNovos = []
const tiposMudados = []
for (const c of categorias) {
  const campos = {
    nome: texto(c.Nome) ?? "(sem nome)",
    valor_limite: numero(c["Valor teto"]),
    ativa: c["Ativo?"] !== false,
    proporcao_reembolsavel: numero(c["Proporção reembolsável"]),
    icone_url: url(c["Ícone"]),
  }
  const atual = tipoPorBubble.get(c._id)
  if (!atual) tiposNovos.push({ ...campos, bubble_id: c._id, emp_proprietaria_id: TENANT })
  else if (
    atual.nome !== campos.nome ||
    Number(atual.valor_limite ?? 0) !== Number(campos.valor_limite ?? 0) ||
    atual.ativa !== campos.ativa ||
    Number(atual.proporcao_reembolsavel ?? 0) !== Number(campos.proporcao_reembolsavel ?? 0)
  ) {
    tiposMudados.push({ id: atual.id, ...campos })
  }
}

console.log(`categorias no Bubble: ${categorias.length} · aqui: ${tiposAqui.length}`)
console.log(`  a inserir: ${tiposNovos.length} · a atualizar: ${tiposMudados.length}`)
for (const t of tiposNovos) {
  const parte = t.proporcao_reembolsavel ? `${Math.round(t.proporcao_reembolsavel * 100)}%` : "sem proporção"
  console.log(`    ${t.nome} (${parte}${t.valor_limite ? `, teto ${t.valor_limite}` : ""})`)
}

if (APLICAR) {
  if (tiposNovos.length) {
    const { error } = await db.from("pessoal_reembolsos_act_tipos").insert(tiposNovos)
    if (error) throw new Error(`categorias: ${error.message}`)
  }
  for (const t of tiposMudados) {
    const { id, ...campos } = t
    const { error } = await db
      .from("pessoal_reembolsos_act_tipos")
      .update({ ...campos, updated_at: new Date().toISOString() })
      .eq("id", id)
    if (error) console.log("  ✘ categoria", id, error.message)
  }
  const atualizadas = await tudo("pessoal_reembolsos_act_tipos", "id, bubble_id", noTenant)
  tipoPorBubble.clear()
  for (const t of atualizadas) if (t.bubble_id) tipoPorBubble.set(t.bubble_id, t)
} else {
  // Na simulação, as categorias novas ainda não existem: entram no mapa com um
  // id de faz de conta, senão todo lançamento apareceria como "sem categoria".
  for (const t of tiposNovos) tipoPorBubble.set(t.bubble_id, { id: "(a criar)" })
}

// ── Lançamentos ──────────────────────────────────────────────────────────────
const porBubble = new Map(reembolsosAqui.filter((r) => r.bubble_id).map((r) => [r.bubble_id, r]))
const inserir = []
const atualizar = []
const fora = { "sem funcionário no cadastro": [], "sem categoria": [], "sem valor": [] }

for (const r of reembolsos) {
  const funcionario = usuarioPorBubble.get(r["FUNCIONÁRIO"])
  const tipo = tipoPorBubble.get(r["CATEGORIA"])
  const valor = numero(r["Valor da despesa"])
  if (!funcionario) {
    fora["sem funcionário no cadastro"].push(r._id)
    continue
  }
  if (!tipo) {
    fora["sem categoria"].push(r._id)
    continue
  }
  if (!valor || valor <= 0) {
    fora["sem valor"].push(r._id)
    continue
  }
  const reprovado = r["Avaliação Aprovado?"] === false
  const mes = texto(r["MÊS"])
  const ano = texto(r.ANO)
  const situacao = reprovado ? "reprovado" : mes && ano ? "pago" : "aprovado"
  const campos = {
    funcionario_id: funcionario,
    tipo_id: tipo.id,
    valor_solicitado: valor,
    valor_aprovado: reprovado ? null : numero(r["Valor reembolsável"]),
    comprovante_url: url(r["Recibo Arquivo"]),
    situacao,
    avaliador_id: usuarioPorBubble.get(r["Avaliação AVALIADOR"]) ?? null,
    avaliacao_data: texto(r["Avaliação data"]),
    pagamento_mes: mes,
    pagamento_ano: ano,
    despesa_paga_em: data(r["Data de pagamento pelo funcionário"]),
  }
  const atual = porBubble.get(r._id)
  if (!atual) {
    inserir.push({
      ...campos,
      // Coluna obrigatória; no Bubble o lançamento não tem descrição.
      descricao: "Importado do sistema anterior",
      avaliacao_observacao: texto(r["Avaliação Observação"]),
      bubble_id: r._id,
      emp_proprietaria_id: TENANT,
      created_at: r["Created Date"],
    })
  } else if (
    atual.situacao !== campos.situacao ||
    Number(atual.valor_aprovado ?? 0) !== Number(campos.valor_aprovado ?? 0) ||
    (atual.pagamento_mes ?? null) !== campos.pagamento_mes ||
    (atual.pagamento_ano ?? null) !== campos.pagamento_ano ||
    (atual.despesa_paga_em ?? null) !== campos.despesa_paga_em
  ) {
    atualizar.push({ id: atual.id, situacao: campos.situacao, valor_aprovado: campos.valor_aprovado, pagamento_mes: campos.pagamento_mes, pagamento_ano: campos.pagamento_ano, despesa_paga_em: campos.despesa_paga_em })
  }
}

console.log(`\nlançamentos no Bubble: ${reembolsos.length} · aqui: ${reembolsosAqui.length}`)
console.log(`  a inserir: ${inserir.length} · a atualizar: ${atualizar.length}`)
const contagem = {}
for (const r of inserir) contagem[r.situacao] = (contagem[r.situacao] ?? 0) + 1
console.log("  por situação:", contagem)
const soma = inserir.reduce((s, r) => s + Number(r.valor_aprovado ?? 0), 0)
console.log(`  valor reembolsável somado: R$ ${soma.toFixed(2)}`)
for (const [motivo, lista] of Object.entries(fora)) {
  if (lista.length) console.log(`  ${motivo} (fora): ${lista.length} — ${lista.slice(0, 3).join(", ")}`)
}

if (APLICAR) {
  let feitos = 0
  for (let k = 0; k < inserir.length; k += 200) {
    const { error } = await db.from("pessoal_reembolsos_act").insert(inserir.slice(k, k + 200))
    if (error) throw new Error(`lançamentos: ${error.message}`)
    feitos += inserir.slice(k, k + 200).length
  }
  let mudados = 0
  for (const a of atualizar) {
    const { id, ...campos } = a
    const { error } = await db
      .from("pessoal_reembolsos_act")
      .update({ ...campos, updated_at: new Date().toISOString() })
      .eq("id", id)
    if (error) console.log("  ✘", id, error.message)
    else mudados++
  }
  console.log(`\n${tiposNovos.length} categoria(s) e ${feitos} lançamento(s) inseridos · ${mudados} atualizado(s).`)
} else {
  console.log("\nPara gravar: node scripts/migrar-reembolsos-act-bubble.mjs --apply")
}
