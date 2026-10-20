// ===========================================================================
// migrar-tributos-bubble.mjs — a área de Tributos do Bubble (fase 1 de
// docs/plano-tributos.md).
//
// O Bubble tinha `tributos-configurações` (o cadastro) e `tributos-lançamentos`
// (uma guia por vigência, com a ORDEM DE PAGAMENTO). As ordens migraram; o
// cadastro e os lançamentos não. Este script:
//   1. cria/atualiza os tributos (financeiro_tributos) pelo bubble_id;
//   2. cria os lançamentos (financeiro_tributos_lancamentos) pelo bubble_id,
//      com valor, vencimento, guia e situação tirados da ordem;
//   3. casa as ordens de tributo SEM lançamento no Bubble pelo texto do tipo
//      ("Tributo FGTS da vigência de 01/04/24 a 30/04/24") e cria o lançamento;
//   4. liga cada ordem ao lançamento (tributo_lancamento_id) e normaliza o
//      tipo para "Tributo" (a vigência passa a morar no lançamento);
//   5. D4: o tributo DARF GERAL passa a ter a Receita Federal como órgão (no
//      lugar do fornecedor genérico "GUIA IRPF DARF", que é criado se faltar)
//      e o GPS, o INSS. Com --favorecido, as ordens antigas também trocam.
// Idempotente: rodar de novo não duplica.
//
// USO:
//   node scripts/migrar-tributos-bubble.mjs                  (simulação)
//   node scripts/migrar-tributos-bubble.mjs --apply [--favorecido]
// ===========================================================================
import { readFileSync } from "node:fs"

const APLICAR = process.argv.includes("--apply")
const TROCAR_FAVORECIDO = process.argv.includes("--favorecido")
const env = Object.fromEntries(
  readFileSync(".env.local", "utf8")
    .split(/\r?\n/)
    .filter((l) => l.includes("=") && !l.startsWith("#"))
    .map((l) => {
      const i = l.indexOf("=")
      return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, "")]
    })
)
const BASE = (env.BUBBLE_API_ROOT || "").replace(/\/+$/, "").replace(/\/obj$/, "").replace("/version-test", "")
const HB = { Authorization: `Bearer ${env.BUBBLE_API_TOKEN}` }
const TENANT = "c763cb99-edfd-4840-8453-ed3fcb66d4a1"
const CNPJ_RECEITA = "00394460005887" // MINISTERIO DA FAZENDA / RECEITA FEDERAL (conferido na BrasilAPI em 19/10/2026)
const CNPJ_INSS = "29979036000140"

const { createClient } = await import("@supabase/supabase-js")
const db = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } })

console.log(APLICAR ? `MODO APLICAR — vai gravar${TROCAR_FAVORECIDO ? " (e trocar o favorecido das ordens antigas)" : ""}.` : "SIMULAÇÃO — nada será gravado.")

async function bubbleTodos(tipo, constraints) {
  const out = []
  for (let cursor = 0; ; ) {
    const p = new URLSearchParams({ cursor: String(cursor), limit: "100" })
    if (constraints) p.set("constraints", JSON.stringify(constraints))
    const j = await (await fetch(`${BASE}/obj/${encodeURIComponent(tipo)}?${p}`, { headers: HB })).json()
    if (!j.response) throw new Error(`${tipo}: ${JSON.stringify(j).slice(0, 200)}`)
    out.push(...j.response.results)
    if (!j.response.remaining) break
    cursor += j.response.results.length
  }
  return out
}
const falhou = (rotulo, error) => {
  if (error) throw new Error(`${rotulo}: ${error.message}`)
}
/** Data do Bubble (ISO em UTC, meia-noite de SP = 03:00Z) → AAAA-MM-DD de SP. */
function diaSP(iso) {
  if (!iso) return null
  return new Date(new Date(iso).getTime() - 3 * 3600 * 1000).toISOString().slice(0, 10)
}
/** "01/04/24" ou "01/04/2024" → "2024-04-01". */
function dataBR(s) {
  const m = s.match(/^(\d{2})\/(\d{2})\/(\d{2}|\d{4})$/)
  if (!m) return null
  const ano = m[3].length === 2 ? `20${m[3]}` : m[3]
  return `${ano}-${m[2]}-${m[1]}`
}
const ESFERA = { "Trabalhista e previdenciário": "trabalhista", Municipal: "municipal", Estadual: "estadual", Federal: "federal" }
const PERIODICIDADE = { "DARF GERAL": "mensal", FGTS: "mensal", GPS: "mensal", DUDA: "eventual", "Alvará Macaé": "anual", "IPTU Macaé": "anual", "DAM CAMPOS": "anual" }

// ── Bubble ─────────────────────────────────────────────────────────────────
const configs = await bubbleTodos("tributos-configurações")
const lancs = await bubbleTodos("tributos-lançamentos")
console.log(`Bubble: ${configs.length} tributos, ${lancs.length} lançamentos.`)

// ── Referências no Supabase ────────────────────────────────────────────────
async function porBubble(tabela, ids, campos = "id, bubble_id") {
  const lista = [...new Set(ids.filter(Boolean))]
  const mapa = new Map()
  for (let i = 0; i < lista.length; i += 100) {
    const { data, error } = await db.from(tabela).select(campos).in("bubble_id", lista.slice(i, i + 100))
    falhou(tabela, error)
    for (const r of data) mapa.set(r.bubble_id, r)
  }
  return mapa
}
const empresas = await porBubble("empresa", configs.map((c) => c["BENEFICIÁRIO"]), "id, bubble_id, nome_fantasia, nome_razao, cnpj_cpf")
const centros = await porBubble("centros_de_custo", configs.map((c) => c["CENTRO DE CUSTO"]), "id, bubble_id, acesso, nome_da_conta")
const ordensPorBubble = await porBubble(
  "ordens_pagamento",
  lancs.map((l) => l["ORDEM DE PAGAMENTO"]),
  "id, bubble_id, codigo, tipo, situacao, valor_inicial_cobranca, vencimento, arquivo_boleto, arquivo_nota_fiscal, boleto_linha_digitavel, beneficiario_fornecedor_id, fornecedor_id, emp_proprietaria_id, tributo_lancamento_id"
)
const { data: todasTributo, error: eT } = await db
  .from("ordens_pagamento")
  .select("id, bubble_id, codigo, tipo, situacao, valor_inicial_cobranca, vencimento, arquivo_boleto, arquivo_nota_fiscal, boleto_linha_digitavel, beneficiario_fornecedor_id, fornecedor_id, tributo_lancamento_id")
  .eq("emp_proprietaria_id", TENANT)
  .ilike("tipo", "tributo%")
falhou("ordens", eT)

// Órgãos de D4.
async function empresaPorCnpj(cnpj) {
  const { data, error } = await db.from("empresa").select("id, nome_fantasia, nome_razao").eq("emp_proprietaria_id", TENANT).eq("cnpj_cpf", cnpj).limit(1)
  falhou("empresa", error)
  return data[0] ?? null
}
let receita = await empresaPorCnpj(CNPJ_RECEITA)
const inss = await empresaPorCnpj(CNPJ_INSS)
const guiaGenerica = [...empresas.values()].find((e) => /guia irpf/i.test(`${e.nome_fantasia ?? ""}`))
console.log(`Receita Federal: ${receita ? "já cadastrada" : "SERÁ CRIADA (CNPJ 00.394.460/0058-87)"}; INSS: ${inss ? "cadastrado" : "NÃO ENCONTRADO"}.`)
if (!receita && APLICAR) {
  const { data, error } = await db
    .from("empresa")
    .insert({
      nome_fantasia: "RECEITA FEDERAL",
      nome_razao: "MINISTERIO DA FAZENDA",
      cnpj_cpf: CNPJ_RECEITA,
      pessoa_juridica: true,
      fornecedor_bloqueado: false,
      empresa: false,
      bloqueado: false,
      inativa: false,
      emp_proprietaria_id: TENANT,
    })
    .select("id, nome_fantasia, nome_razao")
    .single()
  falhou("criar Receita", error)
  receita = data
}

// ── 1. Tributos ────────────────────────────────────────────────────────────
const { data: jaTributos } = await db.from("financeiro_tributos").select("id, bubble_id").eq("emp_proprietaria_id", TENANT)
const tributoPorBubble = new Map((jaTributos ?? []).map((t) => [t.bubble_id, t.id]))
const diaHabitual = (cfgId) => {
  // Dia de vencimento mais comum nas ordens do tributo (só para os mensais).
  const dias = lancs
    .filter((l) => l.TRIBUTO === cfgId)
    .map((l) => ordensPorBubble.get(l["ORDEM DE PAGAMENTO"])?.vencimento)
    .filter(Boolean)
    .map((v) => Number(v.slice(8, 10)))
  const cont = new Map()
  for (const d of dias) cont.set(d, (cont.get(d) ?? 0) + 1)
  return [...cont.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null
}
const linhasTributo = configs.map((c) => {
  const abrev = (c["Abreviação"] ?? "").trim()
  let benef = c["BENEFICIÁRIO"] ? (empresas.get(c["BENEFICIÁRIO"])?.id ?? null) : null
  let nota = ""
  if (abrev === "DARF GERAL") {
    benef = receita?.id ?? "(Receita a criar)"
    nota = " [órgão: GUIA IRPF DARF → Receita Federal]"
  }
  if (abrev === "GPS" && !benef) {
    benef = inss?.id ?? null
    nota = " [órgão: vazio → INSS]"
  }
  const periodicidade = PERIODICIDADE[abrev] ?? "mensal"
  return {
    abrev,
    nota,
    registro: {
      emp_proprietaria_id: TENANT,
      nome: (c.Nome ?? abrev).trim(),
      abreviacao: abrev || null,
      esfera: ESFERA[c.Tipo] ?? "federal",
      beneficiario_empresa_id: benef,
      centro_custo_despesa_id: c["CENTRO DE CUSTO"] ? (centros.get(c["CENTRO DE CUSTO"])?.id ?? null) : null,
      periodicidade,
      dia_vencimento: periodicidade === "mensal" ? diaHabitual(c._id) : null,
      forma_pagamento: "Boleto",
      ativo: true,
      bubble_id: c._id,
      created_at: c["Created Date"],
    },
  }
})
console.log("\n1. Tributos:")
for (const t of linhasTributo) {
  const r = t.registro
  const cc = [...centros.values()].find((c) => c.id === r.centro_custo_despesa_id)
  console.log(
    `   ${tributoPorBubble.has(r.bubble_id) ? "=" : "+"} ${t.abrev.padEnd(13)} ${r.esfera.padEnd(12)} ${r.periodicidade.padEnd(8)} dia ${String(r.dia_vencimento ?? "—").padEnd(3)} cc ${cc ? `${cc.acesso} - ${cc.nome_da_conta}` : "—"}${t.nota}`
  )
}
if (APLICAR) {
  for (const t of linhasTributo) {
    const r = { ...t.registro }
    if (tributoPorBubble.has(r.bubble_id)) {
      delete r.created_at
      const { error } = await db.from("financeiro_tributos").update({ ...r, updated_at: new Date().toISOString() }).eq("id", tributoPorBubble.get(r.bubble_id))
      falhou("atualizar tributo", error)
    } else {
      const { data, error } = await db.from("financeiro_tributos").insert(r).select("id").single()
      falhou("criar tributo", error)
      tributoPorBubble.set(r.bubble_id, data.id)
    }
  }
}

// ── 2. Lançamentos do Bubble ───────────────────────────────────────────────
const { data: jaLancs } = await db.from("financeiro_tributos_lancamentos").select("id, bubble_id, ordem_pagamento_id").eq("emp_proprietaria_id", TENANT)
const lancPorBubble = new Map((jaLancs ?? []).filter((l) => l.bubble_id).map((l) => [l.bubble_id, l.id]))
const lancPorOrdem = new Map((jaLancs ?? []).filter((l) => l.ordem_pagamento_id).map((l) => [l.ordem_pagamento_id, l.id]))
const situacaoDoLanc = (o) => (o && (o.situacao === "Cancelada" || o.situacao === "Estornado") ? "cancelado" : "lancado")
const camposDaOrdem = (o) => ({
  valor: o?.valor_inicial_cobranca ?? null,
  vencimento: o?.vencimento ?? null,
  arquivo_guia: o?.arquivo_boleto ?? o?.arquivo_nota_fiscal ?? null,
  linha_digitavel: o?.boleto_linha_digitavel ?? null,
  ordem_pagamento_id: o?.id ?? null,
  situacao: situacaoDoLanc(o),
})
let semOrdem = 0
const novosLancs = []
for (const l of lancs) {
  if (lancPorBubble.has(l._id)) continue
  const o = ordensPorBubble.get(l["ORDEM DE PAGAMENTO"])
  if (!o) semOrdem++
  novosLancs.push({
    tributoBubble: l.TRIBUTO,
    registro: {
      emp_proprietaria_id: TENANT,
      competencia_inicio: diaSP(l["Vigência início"]),
      competencia_fim: diaSP(l["Vigência final"]),
      ...camposDaOrdem(o),
      bubble_id: l._id,
      created_at: l["Created Date"],
    },
  })
}
console.log(`\n2. Lançamentos do Bubble: ${novosLancs.length} a criar (${lancs.length - novosLancs.length} já existem; ${semOrdem} sem ordem no Supabase).`)

// ── 3. Ordens de tributo sem lançamento no Bubble ─────────────────────────
const ligadasNoBubble = new Set(lancs.map((l) => l["ORDEM DE PAGAMENTO"]))
const abrevs = linhasTributo.map((t) => t.abrev).sort((a, b) => b.length - a.length)
const soltas = todasTributo.filter((o) => !ligadasNoBubble.has(o.bubble_id) && !lancPorOrdem.has(o.id))
const casadas = []
const semCasar = []
for (const o of soltas) {
  const abrev = abrevs.find((a) => o.tipo.includes(a))
  const vig = o.tipo.match(/vigência de (\S+) a (\S+)/)
  const cfg = abrev ? configs.find((c) => (c["Abreviação"] ?? "").trim() === abrev) : null
  if (!cfg) {
    semCasar.push(o)
    continue
  }
  casadas.push({
    tributoBubble: cfg._id,
    ordem: o,
    registro: {
      emp_proprietaria_id: TENANT,
      competencia_inicio: vig ? dataBR(vig[1]) : null,
      competencia_fim: vig ? dataBR(vig[2]) : null,
      ...camposDaOrdem(o),
      bubble_id: null,
    },
  })
}
console.log(`\n3. Ordens de tributo sem lançamento no Bubble: ${soltas.length} — ${casadas.length} casadas pelo tipo, ${semCasar.length} sem casar.`)
for (const c of casadas) console.log(`   + ${c.ordem.codigo} → ${configs.find((x) => x._id === c.tributoBubble)["Abreviação"]} ${c.registro.competencia_inicio} a ${c.registro.competencia_fim} (${c.ordem.situacao})`)
for (const o of semCasar) console.log(`   ? ${o.codigo} | ${o.tipo}`)

// ── Grava 2 e 3, liga as ordens e normaliza o tipo ────────────────────────
const aLigar = [] // { ordemId, lancId, tipoAntes }
if (APLICAR) {
  for (const n of [...novosLancs, ...casadas]) {
    const tributo_id = tributoPorBubble.get(n.tributoBubble)
    if (!tributo_id) continue
    const { data, error } = await db.from("financeiro_tributos_lancamentos").insert({ ...n.registro, tributo_id }).select("id, ordem_pagamento_id").single()
    falhou("criar lançamento", error)
    if (data.ordem_pagamento_id) lancPorOrdem.set(data.ordem_pagamento_id, data.id)
  }
}
const ordensDoTributo = new Map() // ordemId → abreviação (para a troca de favorecido)
for (const l of lancs) {
  const o = ordensPorBubble.get(l["ORDEM DE PAGAMENTO"])
  if (o) ordensDoTributo.set(o.id, (configs.find((c) => c._id === l.TRIBUTO)?.["Abreviação"] ?? "").trim())
}
for (const c of casadas) ordensDoTributo.set(c.ordem.id, (configs.find((x) => x._id === c.tributoBubble)?.["Abreviação"] ?? "").trim())
// Todas as ordens que as guias apontam — inclusive as que perderam o tipo na
// migração (ex.: Alvará Macaé 2024, cancelada, com tipo nulo).
const candidatas = new Map([...todasTributo, ...ordensPorBubble.values()].map((o) => [o.id, o]))
const precisaLigar = [...candidatas.values()].filter((o) => ordensDoTributo.has(o.id) && (!o.tributo_lancamento_id || o.tipo !== "Tributo"))
console.log(`\n4. Ordens a ligar ao lançamento / normalizar o tipo para "Tributo": ${precisaLigar.length} (${todasTributo.length} com tipo "Tributo…" + as de tipo diferente apontadas por guia).`)
if (APLICAR) {
  for (const o of precisaLigar) {
    const lancId = lancPorOrdem.get(o.id)
    if (!lancId) continue
    const { error } = await db.from("ordens_pagamento").update({ tributo_lancamento_id: lancId, tipo: "Tributo" }).eq("id", o.id)
    falhou("ligar ordem", error)
    aLigar.push({ ordemId: o.id, lancId, tipoAntes: o.tipo })
  }
  if (aLigar.length) {
    const { error } = await db.from("ordens_pagamento_eventos").insert(
      aLigar.map((a) => ({
        emp_proprietaria_id: TENANT,
        ordem_id: a.ordemId,
        tipo: "corrigida",
        usuario_id: null,
        descricao: "Migração dos tributos do Bubble: ordem ligada à guia do tributo (Financeiro › Tributos); o tipo passa a \"Tributo\".",
        dados: { migracao: "tributos-bubble", tributo_lancamento_id: a.lancId, antes: { tipo: a.tipoAntes }, depois: { tipo: "Tributo" } },
      }))
    )
    falhou("eventos", error)
  }
}

// ── 5. Favorecido das ordens antigas (D4, só com --favorecido) ────────────
const trocas = [...candidatas.values()].filter((o) => {
  const abrev = ordensDoTributo.get(o.id)
  const fav = o.beneficiario_fornecedor_id ?? o.fornecedor_id
  return (abrev === "DARF GERAL" && guiaGenerica && fav === guiaGenerica.id) || (abrev === "GPS" && (!fav || (guiaGenerica && fav === guiaGenerica.id)))
})
console.log(`\n5. Ordens antigas com o favorecido a trocar (GUIA IRPF DARF → Receita; GPS → INSS): ${trocas.length}${TROCAR_FAVORECIDO ? "" : " — só com --favorecido"}.`)
if (APLICAR && TROCAR_FAVORECIDO) {
  for (const o of trocas) {
    const abrev = ordensDoTributo.get(o.id)
    const novo = abrev === "GPS" ? inss?.id : receita?.id
    if (!novo) continue
    const { error } = await db.from("ordens_pagamento").update({ beneficiario_fornecedor_id: novo }).eq("id", o.id)
    falhou("trocar favorecido", error)
    await db.from("ordens_pagamento_eventos").insert({
      emp_proprietaria_id: TENANT,
      ordem_id: o.id,
      tipo: "corrigida",
      usuario_id: null,
      descricao: `Migração dos tributos: favorecido acertado para ${abrev === "GPS" ? "o INSS" : "a Receita Federal"}.`,
      dados: { migracao: "tributos-bubble", antes: { beneficiario_fornecedor_id: o.beneficiario_fornecedor_id }, depois: { beneficiario_fornecedor_id: novo } },
    })
  }
}
console.log(APLICAR ? "\nAplicado." : "\nSimulação concluída — rode com --apply para gravar.")
