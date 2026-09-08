// ===========================================================================
// migrar-lacunas-modelo-bubble.mjs — traz do Bubble o que não tinha onde ficar.
//
// As cinco lacunas de modelo da auditoria (scripts/auditar-bubble.mjs), na
// ordem em que a estrutura foi criada em supabase/filiacao-lacunas-modelo.sql:
//
//   reembolsos   filiaçãoreembolso (1.848) + filiaçãoreembolsoconfig (1)
//   convenios    filiaçãoconvênioscategorias (6) → filiaçãoconvênio (21)
//                → filiaçãoconvêniounidades (19), com o endereço de cada
//                unidade e os telefones/e-mails resolvidos das tabelas de
//                contato do Bubble
//   bancarios    dadosbancários com FILIADO (1.111)
//   condicao     filiação."FILIAÇÃO CONDIÇÃO FONTE" → filiacoes.condicao_na_fonte
//   offshore     filiação."FONTE PG Offshore?" → filiacoes.fonte_pg_offshore
//                filiaçãovínculos."Lotação offshore?" → filiacao_vinculos.lotacao_offshore
//
// Toda referência é resolvida pelo id de origem: Supabase_id que o Bubble
// guarda, ou bubble_id que a nossa tabela guarda. O que não resolve entra
// sem a referência e é contado no relatório — nunca é inventado.
//
// Cada parte é idempotente: casa por bubble_id e não duplica; nas colunas do
// cadastro, só preenche o que está vazio. Arquivos (contrato do convênio,
// fotos) entram com a URL do CDN do Bubble — trazê-los para o bucket é o
// passo seguinte, com o migrar-documentos-bubble.mjs.
//
// Lê o cache de .auditoria-bubble/ (o mesmo da auditoria); sem cache, baixa.
//
// USO:
//   node scripts/migrar-lacunas-modelo-bubble.mjs                    (dry-run)
//   node scripts/migrar-lacunas-modelo-bubble.mjs --so convenios     (uma parte)
//   node scripts/migrar-lacunas-modelo-bubble.mjs --apply
// ===========================================================================

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs"
import { join } from "node:path"

const args = process.argv.slice(2)
const APLICAR = args.includes("--apply")
const SO = (() => {
  const i = args.indexOf("--so")
  return i >= 0 ? args[i + 1].split(",") : null
})()
const CACHE = ".auditoria-bubble"

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
const BASE = (env.BUBBLE_API_ROOT || "").replace(/\/+$/, "").replace(/\/obj$/, "").replace("/version-test", "")
const TOKEN = env.BUBBLE_API_TOKEN

console.log(APLICAR ? "MODO APLICAR — vai gravar." : "DRY-RUN — nada será gravado.")

// ── leitura ────────────────────────────────────────────────────────────────

const normalizar = (s) =>
  String(s).normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "")

async function bubble(tipo) {
  mkdirSync(CACHE, { recursive: true })
  const arquivo = join(CACHE, normalizar(tipo) + ".json")
  if (existsSync(arquivo)) return JSON.parse(readFileSync(arquivo, "utf8"))
  const linhas = []
  for (let cursor = 0; ; ) {
    const r = await fetch(`${BASE}/obj/${encodeURIComponent(tipo)}?limit=100&cursor=${cursor}`, {
      headers: { Authorization: `Bearer ${TOKEN}` },
    })
    if (r.status !== 200) throw new Error(`Bubble ${tipo}: ${r.status}`)
    const j = await r.json()
    const res = j.response?.results ?? []
    linhas.push(...res)
    cursor += res.length
    if (!res.length || (j.response?.remaining ?? 0) === 0) break
  }
  writeFileSync(arquivo, JSON.stringify(linhas))
  return linhas
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

/** id daqui a partir do id do Bubble, por Supabase_id (lá) ou bubble_id (cá). */
function resolvedor(registrosBubble, linhasAqui) {
  const idsAqui = new Set(linhasAqui.map((l) => l.id))
  const porBubble = new Map(linhasAqui.filter((l) => l.bubble_id).map((l) => [l.bubble_id, l.id]))
  const supaDe = new Map(registrosBubble.map((r) => [r._id, r.Supabase_id]))
  return (idBubble) => {
    if (!idBubble) return null
    const s = supaDe.get(idBubble)
    if (s && idsAqui.has(s)) return s
    return porBubble.get(idBubble) ?? null
  }
}

const dia = (v) => (v ? String(v).slice(0, 10) : null)
const texto = (v) => (typeof v === "string" && v.trim() !== "" ? v.trim() : null)
const bool = (v) => (v === true ? true : v === false ? false : null)

async function gravar(tabela, linhas, rotulo, conflito = "bubble_id") {
  if (linhas.length === 0) return 0
  if (!APLICAR) {
    console.log(`    (dry-run) ${linhas.length} → ${tabela}`)
    return 0
  }
  let n = 0
  for (let de = 0; de < linhas.length; de += 500) {
    const lote = linhas.slice(de, de + 500)
    const { error } = await db.from(tabela).upsert(lote, { onConflict: conflito })
    if (error) {
      console.error(`\nFalhou em ${tabela} (${rotulo}) a partir de ${de}: ${error.message}`)
      process.exit(1)
    }
    n += lote.length
  }
  console.log(`    gravados ${n} → ${tabela}`)
  return n
}

async function atualizarSoVazio(tabela, coluna, pares, rotulo) {
  // pares: [{ id, valor }] — só toca linha em que a coluna está nula
  if (pares.length === 0) return 0
  if (!APLICAR) {
    console.log(`    (dry-run) ${pares.length} linhas de ${tabela}.${coluna}`)
    return 0
  }
  let n = 0
  const porValor = new Map()
  for (const p of pares) {
    const l = porValor.get(p.valor) ?? []
    l.push(p.id)
    porValor.set(p.valor, l)
  }
  for (const [valor, ids] of porValor) {
    for (let de = 0; de < ids.length; de += 200) {
      const lote = ids.slice(de, de + 200)
      const { error, count } = await db
        .from(tabela)
        .update({ [coluna]: valor }, { count: "exact" })
        .in("id", lote)
        .is(coluna, null)
      if (error) {
        console.error(`\nFalhou em ${tabela}.${coluna} (${rotulo}): ${error.message}`)
        process.exit(1)
      }
      n += count ?? 0
    }
  }
  console.log(`    preenchidas ${n} linhas de ${tabela}.${coluna}`)
  return n
}

const roda = (parte) => !SO || SO.includes(parte)

// Índices comuns: cadastro do filiado (todo mundo aponta para ele).
const cadastros = await bubble("filiação")
const filiacoes = await lerTudo("filiacoes", "id, bubble_id", (q) => q.eq("emp_proprietaria_id", TENANT))
const filiado = resolvedor(cadastros, filiacoes)

// ── 1. Reembolsos ──────────────────────────────────────────────────────────
if (roda("reembolsos")) {
  console.log("\n▸ REEMBOLSOS A FILIADOS")
  const [reemb, cfg] = await Promise.all([bubble("filiaçãoreembolso"), bubble("filiaçãoreembolsoconfig")])
  const [ordens, projetos, prontuarios, recebe, centros] = await Promise.all([
    lerTudo("ordens_pagamento", "id, bubble_id", (q) => q.eq("emp_proprietaria_id", TENANT)),
    lerTudo("projeto", "id, bubble_id"),
    lerTudo("filiacao_prontuario", "id, bubble_id", (q) => q.eq("emp_proprietaria_id", TENANT)),
    (async () => {
      // 600 mil linhas: só as poucas que algum reembolso aponta como
      // pagamento indevido — e nenhuma, se nenhum apontar.
      const ids = [...new Set(reemb.map((r) => r["PAGAMENTO INDEVIDO"]).filter(Boolean))]
      if (ids.length === 0) return []
      return lerTudo("filiacao_recebe", "id, bubble_id", (q) => q.eq("emp_proprietaria_id", TENANT).in("bubble_id", ids))
    })(),
    lerTudo("centros_de_custo", "id, bubble_id"),
  ])
  const porBubble = (l) => new Map(l.filter((x) => x.bubble_id).map((x) => [x.bubble_id, x.id]))
  const ordemDe = porBubble(ordens), projetoDe = porBubble(projetos), prontDe = porBubble(prontuarios), recebeDe = porBubble(recebe), centroDe = porBubble(centros)

  const linhas = []
  const perdas = { filiado: 0, ordem: 0, projeto: 0, prontuario: 0 }
  for (const r of reemb) {
    const f = filiado(r.FILIADO)
    if (r.FILIADO && !f) perdas.filiado++
    const o = ordemDe.get(r["ORDEM DE PAGAMENTO"]) ?? null
    if (r["ORDEM DE PAGAMENTO"] && !o) perdas.ordem++
    const p = projetoDe.get(r.PROJETO) ?? null
    if (r.PROJETO && !p) perdas.projeto++
    const pr = prontDe.get(r["PRONTUÁRIO"]) ?? null
    if (r["PRONTUÁRIO"] && !pr) perdas.prontuario++
    linhas.push({
      bubble_id: r._id,
      emp_proprietaria_id: TENANT,
      filiado_id: f,
      data: dia(r.Data),
      justificativa: texto(r.Justificativa),
      ordem_pagamento_id: o,
      projeto_id: p,
      prontuario_id: pr,
      pagamento_indevido_id: recebeDe.get(r["PAGAMENTO INDEVIDO"]) ?? null,
      created_at: r["Created Date"],
    })
  }
  console.log(`  ${reemb.length} reembolsos · sem resolver: filiado ${perdas.filiado}, ordem ${perdas.ordem}, projeto ${perdas.projeto}, prontuário ${perdas.prontuario}`)
  await gravar("filiacao_reembolsos", linhas, "reembolsos")

  const c = cfg[0]
  if (c) {
    const linha = {
      bubble_id: c._id,
      emp_proprietaria_id: TENANT,
      valor_reembolso: c["Valor do reembolso"] ?? null,
      centro_custo_id: centroDe.get(c["CENTRO DE CUSTO"]) ?? null,
      orcamento_limite: c["Orçamento limite?"] === true,
      orcamento_mensal: c["Orçamento mensal"] ?? null,
    }
    console.log(`  config: R$ ${linha.valor_reembolso} por reembolso, orçamento mensal ${linha.orcamento_mensal}, centro de custo ${linha.centro_custo_id ? "resolvido" : "NÃO resolvido"}`)
    // uma por tenant: o índice único é em emp_proprietaria_id, não em bubble_id
    await gravar("filiacao_reembolsos_config", [linha], "config", "emp_proprietaria_id")
  }
}

// ── 2. Convênios ───────────────────────────────────────────────────────────
if (roda("convenios")) {
  console.log("\n▸ CONVÊNIOS")
  const [cats, convs, unids, enderecosB, telefonesB, emailsB] = await Promise.all([
    bubble("filiaçãoconvênioscategorias"),
    bubble("filiaçãoconvênio"),
    bubble("filiaçãoconvêniounidades"),
    bubble("endereços"),
    bubble("telefones"),
    bubble("emails"),
  ])
  const empresas = await lerTudo("empresa", "id, bubble_id")
  const empresaDe = new Map(empresas.filter((e) => e.bubble_id).map((e) => [e.bubble_id, e.id]))

  // categorias — id determinístico a partir do bubble_id, para os convênios
  // poderem apontar antes de a categoria existir no banco (dry-run inclusive)
  const uuidDe = (semente) => {
    // uuid v5-like sem dependência: hash simples e estável do bubble_id
    let h1 = 0x811c9dc5, h2 = 0x01000193
    for (const ch of semente) {
      h1 = Math.imul(h1 ^ ch.charCodeAt(0), 16777619) >>> 0
      h2 = Math.imul(h2 + ch.charCodeAt(0), 2246822519) >>> 0
    }
    const hex = (h1.toString(16).padStart(8, "0") + h2.toString(16).padStart(8, "0")).repeat(2)
    return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-4${hex.slice(13, 16)}-8${hex.slice(17, 20)}-${hex.slice(20, 32)}`
  }
  const catLinhas = cats.map((c) => ({
    id: uuidDe(c._id),
    bubble_id: c._id,
    emp_proprietaria_id: TENANT,
    categoria: texto(c.Categoria),
    created_at: c["Created Date"],
  }))
  console.log(`  ${cats.length} categorias: ${catLinhas.map((c) => c.categoria).join(", ")}`)
  await gravar("filiacao_convenios_categorias", catLinhas, "categorias")
  const catDe = new Map(catLinhas.map((c) => [c.bubble_id, c.id]))

  let semConveniador = 0
  const convLinhas = convs.map((c) => {
    const conveniador = empresaDe.get(c.CONVENIADOR) ?? null
    if (c.CONVENIADOR && !conveniador) semConveniador++
    return {
      id: uuidDe(c._id),
      bubble_id: c._id,
      emp_proprietaria_id: TENANT,
      categoria_id: catDe.get(c.CATEGORIA) ?? null,
      conveniador_id: conveniador,
      sindicato_id: empresaDe.get(c.SINDICATO) ?? null,
      ativo: c["Ativo?"] === true,
      data_termino: dia(c["Data de término"]),
      info_sumarias: texto(c["Info sumárias"]),
      info_vantagens: texto(c["Info vantagens"]),
      arquivo_convenio: texto(c["Arquivo convênio"]),
      foto_principal: texto(c["Foto principal"]),
      fotos_divulgacao: Array.isArray(c["Fotos de divulgação"]) ? c["Fotos de divulgação"] : null,
      created_at: c["Created Date"],
    }
  })
  console.log(`  ${convs.length} convênios (${convLinhas.filter((c) => c.ativo).length} ativos) · conveniador não resolvido: ${semConveniador}`)
  await gravar("filiacao_convenios", convLinhas, "convenios")
  const convDe = new Map(convLinhas.map((c) => [c.bubble_id, c.id]))

  // o endereço de cada unidade vira uma linha em enderecos
  const endB = new Map(enderecosB.map((e) => [e._id, e]))
  const telB = new Map(telefonesB.map((t) => [t._id, t]))
  const emB = new Map(emailsB.map((e) => [e._id, e]))
  const endLinhas = []
  const unLinhas = unids.map((u) => {
    const e = endB.get(u["ENDEREÇO"])
    let endereco_id = null
    if (e) {
      endereco_id = uuidDe(e._id)
      endLinhas.push({
        id: endereco_id,
        bubble_id: e._id,
        emp_proprietaria_id: TENANT,
        cep: texto(e.CEP), logradouro: texto(e.Logradouro), numero: texto(e["Número"]),
        complemento: texto(e.Complemento), bairro: texto(e.Bairro), cidade: texto(e.Cidade), estado: texto(e.Estado),
        nome_endereco: texto(e["Nome do endereço"]), tipo_endereco: texto(e["Tipo de endereço"]),
        created_at: e["Created Date"],
      })
    }
    const tels = (u.TELEFONES ?? []).map((id) => texto(telB.get(id)?.Telefone)).filter(Boolean)
    const ems = (u.EMAILS ?? []).map((id) => texto(emB.get(id)?.Email)).filter(Boolean)
    return {
      bubble_id: u._id,
      emp_proprietaria_id: TENANT,
      convenio_id: convDe.get(u["CONVÊNIO"]) ?? null,
      nome: texto(u.Nome),
      site: texto(u.Site),
      atendimento_online: u["Atendimento online?"] === true,
      atendimento_presencial: u["Atendimento presencial?"] === true,
      endereco_id,
      telefones: tels.length ? tels : null,
      emails: ems.length ? ems : null,
      fotos: Array.isArray(u.Fotos) && u.Fotos.length ? u.Fotos : null,
      created_at: u["Created Date"],
    }
  })
  console.log(`  ${unids.length} unidades · com endereço ${endLinhas.length} · com telefone ${unLinhas.filter((u) => u.telefones).length} · com e-mail ${unLinhas.filter((u) => u.emails).length}`)
  await gravar("enderecos", endLinhas, "enderecos das unidades")
  await gravar("filiacao_convenios_unidades", unLinhas, "unidades")
  const arquivos = convLinhas.filter((c) => c.arquivo_convenio || c.foto_principal || c.fotos_divulgacao).length
  if (arquivos) console.log(`  ⚠ ${arquivos} convênios com arquivo/foto ainda no CDN do Bubble — trazer com migrar-documentos-bubble.mjs`)
}

// ── 3. Dados bancários do filiado ──────────────────────────────────────────
if (roda("bancarios")) {
  console.log("\n▸ DADOS BANCÁRIOS DO FILIADO")
  const todos = await bubble("dadosbancários")
  const deFiliado = todos.filter((d) => d.FILIADO)
  let semFiliado = 0
  const linhas = []
  for (const d of deFiliado) {
    const f = filiado(d.FILIADO)
    if (!f) { semFiliado++; continue }
    linhas.push({
      bubble_id: d._id,
      filiado_id: f,
      banco: texto(d.Banco),
      banco_codigo: texto(d["Banco código"]),
      agencia: texto(d["Agência"]),
      conta: texto(d.Conta),
      tipo_conta: d["Conta corrente?"] === true ? "corrente" : d["Conta corrente?"] === false ? "poupanca" : null,
      pix: texto(d["Pix chave"]),
      pix_tipo: texto(d["Pix tipo"]),
      pix_beneficiario: texto(d["Pix beneficiário nome"]),
      favorecido: texto(d["Beneficiário CNPJ - CPF"]),
      prefere_pix: d["Prefere pix?"] === true,
      favorito: d["É favorito?"] === true,
      tipo_dados: texto(d["Tipo dos dados bancários"]),
      created_at: d["Created Date"],
    })
  }
  console.log(`  ${deFiliado.length} registros de filiado · filiado não resolvido: ${semFiliado} · com Pix ${linhas.filter((l) => l.pix).length}`)
  await gravar("dados_bancarios", linhas, "bancarios")
}

// ── 4. Condição junto à fonte ──────────────────────────────────────────────
if (roda("condicao")) {
  console.log("\n▸ CONDIÇÃO JUNTO À FONTE")
  const pares = []
  const porValor = new Map()
  for (const c of cadastros) {
    const v = texto(c["FILIAÇÃO CONDIÇÃO FONTE"])
    if (!v) continue
    const id = filiado(c._id)
    if (!id) continue
    pares.push({ id, valor: v })
    porValor.set(v, (porValor.get(v) ?? 0) + 1)
  }
  console.log(`  ${pares.length} cadastros: ${[...porValor].map(([k, n]) => `${k} ${n}`).join(" · ")}`)
  await atualizarSoVazio("filiacoes", "condicao_na_fonte", pares, "condicao")
}

// ── 5. Offshore ────────────────────────────────────────────────────────────
if (roda("offshore")) {
  console.log("\n▸ OFFSHORE")
  const paresCad = []
  for (const c of cadastros) {
    const v = bool(c["FONTE PG Offshore?"])
    if (v === null) continue
    const id = filiado(c._id)
    if (id) paresCad.push({ id, valor: v })
  }
  console.log(`  cadastro: ${paresCad.length} informados (${paresCad.filter((p) => p.valor).length} offshore)`)
  await atualizarSoVazio("filiacoes", "fonte_pg_offshore", paresCad, "offshore cadastro")

  const vinculosB = await bubble("filiaçãovínculos")
  const vinculos = await lerTudo("filiacao_vinculos", "id, bubble_id", (q) => q.eq("emp_proprietaria_id", TENANT))
  const vinculo = resolvedor(vinculosB, vinculos)
  const paresV = []
  let semPar = 0
  for (const v of vinculosB) {
    const b = bool(v["Lotação offshore?"])
    if (b === null) continue
    const id = vinculo(v._id)
    if (!id) { semPar++; continue }
    paresV.push({ id, valor: b })
  }
  console.log(`  vínculo: ${paresV.length} informados (${paresV.filter((p) => p.valor).length} offshore) · ${semPar} em vínculos que ainda não vieram (entram com a migração dos vínculos)`)
  await atualizarSoVazio("filiacao_vinculos", "lotacao_offshore", paresV, "offshore vinculo")
}

console.log(APLICAR ? "\nPronto." : "\nDry-run concluído. Rode o SQL supabase/filiacao-lacunas-modelo.sql e repita com --apply.")
