// ===========================================================================
// cadastrar-empresas-faltantes.mjs
//
// Cadastra as fontes pagadoras que existem no Bubble e não vieram para o
// Supabase, e liga a elas os vínculos que ficaram sem fonte.
//
// COMO ELAS SUMIRAM: o cadastro delas no Bubble já traz um `Supabase_id`
// apontando para um registro nosso — mas esse registro nunca foi criado. A
// migração escreveu o ponteiro e não escreveu o destino. Foram descobertas ao
// reconstruir o histórico de filiação: 317 vínculos ficaram sem fonte porque
// a empresa não existia deste lado.
//
// O id gravado aqui é EXATAMENTE o `Supabase_id` que o Bubble já aponta, e
// não um novo: assim o ponteiro que estava quebrado passa a valer, e uma
// futura sincronização casa sem duplicar ninguém.
//
// USO:
//   node scripts/cadastrar-empresas-faltantes.mjs           (dry-run)
//   node scripts/cadastrar-empresas-faltantes.mjs --apply
// ===========================================================================

import { readFileSync } from "node:fs"

const APLICAR = process.argv.includes("--apply")

const env = Object.fromEntries(
  readFileSync(".env.local", "utf8")
    .split(/\r?\n/)
    .filter((l) => l.includes("="))
    .map((l) => {
      const i = l.indexOf("=")
      return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, "")]
    })
)

const { createClient } = await import("@supabase/supabase-js")
const db = createClient(
  env.NEXT_PUBLIC_SUPABASE_URL || env.SUPABASE_URL,
  env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false } }
)

const TENANT = "c763cb99-edfd-4840-8453-ed3fcb66d4a1"
const BASE = (env.BUBBLE_API_ROOT || "")
  .replace(/\/+$/, "")
  .replace(/\/obj$/, "")
  .replace("/version-test", "")
const TOKEN = env.BUBBLE_API_TOKEN

if (!BASE || !TOKEN) {
  console.error("Faltam BUBBLE_API_ROOT e/ou BUBBLE_API_TOKEN no .env.local.")
  process.exit(1)
}

async function lerTudo(tabela, colunas, extra = (q) => q) {
  const linhas = []
  for (let de = 0; ; de += 1000) {
    const { data, error } = await extra(
      db.from(tabela).select(colunas).order("id", { ascending: true }).range(de, de + 999)
    )
    if (error) throw new Error(`${tabela}: ${error.message}`)
    linhas.push(...data)
    if (data.length < 1000) break
  }
  return linhas
}

async function bubbleTudo(tipo) {
  const linhas = []
  for (let cursor = 0; ; ) {
    const r = await fetch(
      `${BASE}/obj/${encodeURIComponent(tipo)}?limit=100&cursor=${cursor}`,
      { headers: { Authorization: `Bearer ${TOKEN}` } }
    )
    if (r.status !== 200) throw new Error(`Bubble ${tipo}: ${r.status}`)
    const j = await r.json()
    const res = j.response?.results ?? []
    linhas.push(...res)
    cursor += res.length
    if (res.length === 0 || (j.response?.remaining ?? 0) === 0) break
  }
  return linhas
}

console.log(APLICAR ? "MODO APLICAR — vai gravar." : "DRY-RUN — nada será gravado.")
console.log("Lendo os dois lados…")
const [cadastros, empresasBubble, empresas, vinculos] = await Promise.all([
  bubbleTudo("filiação"),
  bubbleTudo("empresa"),
  lerTudo("empresa", "id, bubble_id"),
  lerTudo("filiacao_vinculos", "id, filiado_id, fonte_pagadora_id, reconstruido_de", (q) =>
    q.eq("emp_proprietaria_id", TENANT)
  ),
])

const idsNossos = new Set(empresas.map((e) => e.id))
const porBubbleId = new Map(empresas.filter((e) => e.bubble_id).map((e) => [e.bubble_id, e.id]))
const resolve = (idBubble) => {
  const e = empresasBubble.find((x) => x._id === idBubble)
  if (!e) return null
  if (e.Supabase_id && idsNossos.has(e.Supabase_id)) return e.Supabase_id
  return porBubbleId.get(idBubble) ?? null
}

// Quais fontes os cadastros usam e não resolvem em empresa?
const usoPorFonte = new Map()
for (const c of cadastros) {
  const f = c["FONTE PG"]
  if (!f) continue
  usoPorFonte.set(f, (usoPorFonte.get(f) ?? 0) + 1)
}
const faltantes = [...usoPorFonte.keys()].filter((f) => !resolve(f))

// Só o CNPJ, sem pontuação: é assim que os cadastros existentes guardam.
const soDigitos = (v) => (typeof v === "string" ? v.replace(/\D/g, "") : null)

const novas = []
for (const idBubble of faltantes) {
  const e = empresasBubble.find((x) => x._id === idBubble)
  if (!e) {
    console.log(`  ! fonte ${idBubble} não existe nem no Bubble — ignorada`)
    continue
  }
  if (!e.Supabase_id) {
    console.log(`  ! ${e["Nome razão"]} não tem Supabase_id no Bubble — ignorada`)
    continue
  }
  novas.push({
    id: e.Supabase_id,
    bubble_id: e._id,
    emp_proprietaria_id: TENANT,
    nome_razao: e["Nome razão"] ?? null,
    nome_fantasia: e["Nome fantasia_Nome completo "] ?? null,
    cnpj_cpf: soDigitos(e.CNPJ_CPF),
    pessoa_juridica: e["É Pessoa jurídica?"] === true,
    trabalhadores_rep_nf: e["Trabalhadores representados pelo NF?"] === true,
    quantidade_trabalhadores: e["Quantidade trabalhadores"] ?? null,
  })
}

console.log(`\nEMPRESAS A CADASTRAR: ${novas.length}`)
for (const n of novas) {
  const cadastrosDela = usoPorFonte.get(n.bubble_id) ?? 0
  console.log(
    `  ${(n.nome_fantasia ?? n.nome_razao ?? "").padEnd(16)} ${String(n.cnpj_cpf).padEnd(16)} ${cadastrosDela} cadastro(s) no Bubble`
  )
}

// ── religar o que ficou órfão ──────────────────────────────────────────────
//
// Empresa que não existe não pode ser apontada: toda linha que se referia a
// estas três ficou com a coluna VAZIA, em DUAS tabelas diferentes. A primeira
// versão deste script só religou os vínculos de filiação RECONSTRUÍDOS — foi
// um recorte estreito demais, e o Bruno percebeu pela conta que não fechava:
// a Halliburton mostrava 118 pessoas aqui e mais de mil no sistema antigo.
//
// Agora as duas tabelas são varridas, e o casamento é sempre pelo registro de
// origem no Bubble: o vínculo de FILIAÇÃO herda a `FONTE PG` do cadastro da
// pessoa; o vínculo TRABALHISTA tem o seu próprio `EMPREGADOR`.

const porOrigem = new Map(cadastros.map((c) => [c._id, c]))

// O mapa cobre TODAS as empresas, não só as recém-cadastradas: numa segunda
// passada as três já existem e o religamento precisaria resolver por elas
// mesmas — além de alcançar qualquer outro órfão que apareça.
const empresaPorBubble = new Map()
for (const e of empresasBubble) {
  const alvo = resolve(e._id) ?? (novas.find((n) => n.bubble_id === e._id)?.id ?? null)
  if (alvo) empresaPorBubble.set(e._id, alvo)
}
const nomePorId = new Map(
  empresasBubble
    .map((e) => [empresaPorBubble.get(e._id), e["Nome fantasia_Nome completo "] ?? e["Nome razão"]])
    .filter(([id]) => id)
)
const rotulo = (id) => nomePorId.get(id) ?? id
const resumir = (lista, campo) => {
  const m = new Map()
  for (const l of lista) m.set(l[campo], (m.get(l[campo]) ?? 0) + 1)
  return [...m].sort((a, b) => b[1] - a[1])
}

// 1. vínculos de filiação — a fonte pagadora vem do cadastro da pessoa.
//    Reconstruídos casam por `reconstruido_de`; os demais, por `bubble_id` do
//    cadastro do filiado.
const cadastroDoFiliado = new Map()
for (const c of cadastros) {
  const alvo = c.Supabase_id ?? null
  if (alvo) cadastroDoFiliado.set(alvo, c)
}
const filiacoes = await lerTudo("filiacoes", "id, bubble_id", (q) =>
  q.eq("emp_proprietaria_id", TENANT)
)
const porFiliadoBubble = new Map(
  filiacoes.filter((f) => f.bubble_id).map((f) => [f.id, f.bubble_id])
)

const aLigarFiliacao = []
for (const v of vinculos) {
  if (v.fonte_pagadora_id) continue
  const c =
    (v.reconstruido_de && porOrigem.get(v.reconstruido_de)) ||
    cadastroDoFiliado.get(v.filiado_id) ||
    porOrigem.get(porFiliadoBubble.get(v.filiado_id))
  const fonte = c?.["FONTE PG"]
  const empresa = fonte ? empresaPorBubble.get(fonte) : null
  if (!empresa) continue
  aLigarFiliacao.push({ id: v.id, fonte_pagadora_id: empresa })
}

// 2. vínculos trabalhistas — o empregador é do próprio registro.
const trabalhistasBubble = await bubbleTudo("vínculo trabalhista")
const empregadorDoBubble = new Map(
  trabalhistasBubble.filter((t) => t.EMPREGADOR).map((t) => [t._id, t.EMPREGADOR])
)
const trabalhistas = await lerTudo(
  "vinculos_trabalhistas",
  "id, bubble_id, empregador_id",
  (q) => q.eq("emp_proprietaria_id", TENANT)
)
const aLigarTrabalhista = []
for (const v of trabalhistas) {
  if (v.empregador_id || !v.bubble_id) continue
  const fonte = empregadorDoBubble.get(v.bubble_id)
  const empresa = fonte ? empresaPorBubble.get(fonte) : null
  if (!empresa) continue
  aLigarTrabalhista.push({ id: v.id, empregador_id: empresa })
}

console.log(`\nVÍNCULOS DE FILIAÇÃO A LIGAR: ${aLigarFiliacao.length}`)
for (const [id, n] of resumir(aLigarFiliacao, "fonte_pagadora_id")) {
  console.log(`  ${String(n).padStart(5)} → ${rotulo(id)}`)
}
console.log(`\nVÍNCULOS TRABALHISTAS A LIGAR: ${aLigarTrabalhista.length}`)
for (const [id, n] of resumir(aLigarTrabalhista, "empregador_id")) {
  console.log(`  ${String(n).padStart(5)} → ${rotulo(id)}`)
}

console.log(
  `\nsem fonte hoje: ${vinculos.filter((v) => !v.fonte_pagadora_id).length} filiação` +
    ` | ${trabalhistas.filter((v) => !v.empregador_id).length} trabalhista`
)
console.log(
  `depois:         ${vinculos.filter((v) => !v.fonte_pagadora_id).length - aLigarFiliacao.length} filiação` +
    ` | ${trabalhistas.filter((v) => !v.empregador_id).length - aLigarTrabalhista.length} trabalhista`
)

if (!APLICAR) {
  console.log("\nDry-run. Nada gravado. Repita com --apply.")
  process.exit(0)
}

// O insert só corre quando há empresa nova: numa segunda passada elas já
// existem, e só falta religar.
if (novas.length > 0) {
  console.log("\nCadastrando as empresas…")
  const { error: erroEmpresa } = await db.from("empresa").insert(novas)
  if (erroEmpresa) {
    console.error("Falhou:", erroEmpresa.message)
    process.exit(1)
  }
  console.log(`  ${novas.length} cadastradas.`)
}

// Agrupa por empresa e atualiza em lotes: são milhares de linhas, e um update
// por linha levaria meia hora de ida e volta ao banco para gravar sempre o
// mesmo valor.
async function ligar(tabela, lista, campo) {
  if (lista.length === 0) return 0
  console.log(`\nLigando ${lista.length} em ${tabela}…`)
  const porValor = new Map()
  for (const item of lista) {
    const ids = porValor.get(item[campo]) ?? []
    ids.push(item.id)
    porValor.set(item[campo], ids)
  }
  let feitos = 0
  for (const [valor, ids] of porValor) {
    for (let de = 0; de < ids.length; de += 200) {
      const lote = ids.slice(de, de + 200)
      const { error } = await db
        .from(tabela)
        .update({ [campo]: valor })
        .in("id", lote)
      if (error) {
        console.error(`\nFalhou: ${error.message}`)
        console.error(`Ligados até aqui: ${feitos}.`)
        process.exit(1)
      }
      feitos += lote.length
      process.stdout.write(".")
    }
  }
  console.log("")
  return feitos
}

const nFil = await ligar("filiacao_vinculos", aLigarFiliacao, "fonte_pagadora_id")
const nTrab = await ligar("vinculos_trabalhistas", aLigarTrabalhista, "empregador_id")
console.log(
  `\nPronto: ${novas.length} empresa(s) cadastrada(s), ${nFil} vínculo(s) de filiação e ${nTrab} trabalhista(s) ligados.`
)
