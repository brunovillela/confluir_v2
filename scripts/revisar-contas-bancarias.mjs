// Lista para REVISÃO (27/10/2026) as contas bancárias (dados_bancarios) de
// produção que pedem limpeza (só lê, salvo com --juntar):
//   A. repetidas no mesmo dono: mesma agência+conta (ou a mesma chave Pix,
//      quando não há conta). Sugere qual manter: a favorita, senão a mais
//      usada pelas ordens, senão a que tem o documento do titular;
//   B. a mesma agência+conta em donos diferentes (cadastro duplicado do
//      fornecedor/pessoa, ou conta de terceiro);
//   C. documento do titular suspeito:
//      - de outro titular (nem igual nem mesma raiz de CNPJ do dono), marcando
//        "parece digitação" quando difere do dono em até 2 dígitos;
//      - sem documento e com titular de outro nome (o script do titular não
//        conseguiu preencher).
// CPF sai mascarado. Só contas com dono (sem dono a RLS esconde do app).
//
//   node scripts/revisar-contas-bancarias.mjs > lista.md
//   … --juntar --backup=<arquivo.json> → junta as repetidas do item A (ver no fim)

import { createClient } from "@supabase/supabase-js"
import fs from "node:fs"

const env = Object.fromEntries(
  fs
    .readFileSync(new URL("../.env.local", import.meta.url), "utf8")
    .split(/\r?\n/)
    .filter((l) => l.includes("=") && !l.startsWith("#"))
    .map((l) => [l.slice(0, l.indexOf("=")), l.slice(l.indexOf("=") + 1).replace(/^"|"$/g, "")])
)
const s = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY)
const DEMO = "11111111-1111-4111-8111-111111111111"
const t = (v) => (typeof v === "string" && v.trim() ? v.trim() : null)
const digitos = (v) => String(v ?? "").replace(/\D/g, "")
const semZeros = (v) => digitos(v).replace(/^0+/, "")
const mascarar = (d) =>
  !d ? "sem doc" : d.length === 11 ? `***.${d.slice(3, 6)}.${d.slice(6, 9)}-**` : d.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, "$1.$2.$3/$4-$5")
// Texto livre do titular: CNPJ fica; qualquer outra sequência de 9+ dígitos
// (CPF, válido ou digitado errado) sai só com os dígitos do meio.
const titularMascarado = (v) =>
  t(v)?.replace(/\d[\d./-]{7,}\d/g, (m) => {
    const d = digitos(m)
    return d.length === 14 ? mascarar(d) : d.length >= 9 ? d.replace(/^(\d{3})(\d+)(\d{2})$/, (_, a, meio) => "***" + meio + "**") : m
  }) ?? null
const mesmoTitular = (a, b) => a === b || (a.length === 14 && b.length === 14 && a.slice(0, 8) === b.slice(0, 8))
const distancia = (a, b) => (a.length !== b.length ? 99 : [...a].filter((c, i) => c !== b[i]).length)

const VAZIAS = new Set(["ltda", "me", "epp", "eireli", "sa", "s", "a", "de", "da", "do", "das", "dos", "e", "cia", "mei", "slu"])
const palavras = (n) =>
  n
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .split(" ")
    .filter((p) => p.length > 1 && !VAZIAS.has(p) && !/^\d+$/.test(p))
function nomeBate(titular, nomes) {
  const dele = palavras(titular)
  if (!dele.length) return true
  return nomes.some((n) => {
    const fav = palavras(n)
    return fav.length > 0 && dele.filter((p) => fav.includes(p)).length / Math.min(dele.length, fav.length) >= 0.6
  })
}

async function todas(tabela, colunas, filtro = (q) => q) {
  const saida = []
  for (let i = 0; ; i += 1000) {
    const { data, error } = await filtro(s.from(tabela).select(colunas)).order("id").range(i, i + 999)
    if (error) throw error
    saida.push(...data)
    if (data.length < 1000) break
  }
  return saida
}
async function porIds(tabela, colunas, ids) {
  const saida = new Map()
  for (let i = 0; i < ids.length; i += 200) {
    const { data, error } = await s.from(tabela).select(colunas).in("id", ids.slice(i, i + 200))
    if (error) throw error
    for (const d of data) saida.set(d.id, d)
  }
  return saida
}

const contas = await todas(
  "dados_bancarios",
  "id, favorecido, banco, banco_codigo, agencia, conta, tipo_conta, pix, pix_tipo, prefere_pix, fornecedor_id, usuario_id, filiado_id, favorito, titular_documento, created_at, bubble_id, tipo_dados, pix_beneficiario"
)
const ids = (c) => [...new Set(contas.map((x) => x[c]).filter(Boolean))]
const [empresas, usuarios, filiacoes, usos] = await Promise.all([
  porIds("empresa", "id, emp_proprietaria_id, empresa, nome_fantasia, nome_razao, cnpj_cpf", ids("fornecedor_id")),
  porIds("usuarios", "id, emp_proprietaria_id, nome_completo, nome_guerra, cpf", ids("usuario_id")),
  porIds("filiacoes", "id, emp_proprietaria_id, nome_completo, cpf", ids("filiado_id")),
  todas("ordens_pagamento", "id, dados_bancarios_id", (q) => q.not("dados_bancarios_id", "is", null)),
])
const ordensPorConta = new Map()
for (const o of usos) ordensPorConta.set(o.dados_bancarios_id, (ordensPorConta.get(o.dados_bancarios_id) ?? 0) + 1)

// Monta cada conta com o dono (só produção).
const linhas = []
for (const c of contas) {
  const tipo = c.fornecedor_id ? "fornecedor" : c.usuario_id ? "usuário" : c.filiado_id ? "filiado" : null
  const dono = c.fornecedor_id ? empresas.get(c.fornecedor_id) : c.usuario_id ? usuarios.get(c.usuario_id) : filiacoes.get(c.filiado_id)
  if (!tipo || !dono || dono.emp_proprietaria_id === DEMO || dono.id === DEMO) continue
  const nomes = [dono.empresa, dono.nome_fantasia, dono.nome_razao, dono.nome_completo, dono.nome_guerra].map(t).filter(Boolean)
  linhas.push({
    ...c,
    tipo,
    donoId: c.fornecedor_id ?? c.usuario_id ?? c.filiado_id,
    donoNome: titularMascarado(nomes[0]) ?? "?",
    nomes,
    donoDoc: digitos(dono.cnpj_cpf ?? dono.cpf),
    chaveConta: semZeros(c.conta) ? `${semZeros(c.agencia)}|${semZeros(c.conta)}` : null,
    chavePix: !semZeros(c.conta) && t(c.pix) ? t(c.pix).toLowerCase().replace(/[\s.()/-]/g, "") : null,
    ordens: ordensPorConta.get(c.id) ?? 0,
  })
}

const descreve = (l) =>
  [
    l.chaveConta ? `${t(l.banco) ?? t(l.banco_codigo) ?? "banco ?"} ag ${t(l.agencia) ?? "?"} cc ${t(l.conta)}` : `Pix ${titularMascarado(l.pix)}`,
    l.titular_documento ? `titular ${mascarar(l.titular_documento)}` : null,
    l.favorito ? "favorita" : null,
    `${l.ordens} ordem(ns)`,
    `id ${l.id.slice(0, 8)}`,
  ]
    .filter(Boolean)
    .join(" · ")
const melhor = (a, b) =>
  Number(b.favorito) - Number(a.favorito) || b.ordens - a.ordens || Number(!!b.titular_documento) - Number(!!a.titular_documento) || String(a.created_at).localeCompare(String(b.created_at))

// A. repetidas no mesmo dono
const grupos = new Map()
for (const l of linhas) {
  const chave = l.chaveConta ?? (l.chavePix ? `pix|${l.chavePix}` : null)
  if (!chave) continue
  const k = `${l.donoId}#${chave}`
  grupos.set(k, [...(grupos.get(k) ?? []), l])
}
const repetidas = [...grupos.values()].filter((g) => g.length > 1).sort((a, b) => b.length - a.length || a[0].donoNome.localeCompare(b[0].donoNome))

// B. mesma conta em donos diferentes
const porConta = new Map()
for (const l of linhas) if (l.chaveConta) porConta.set(l.chaveConta, [...(porConta.get(l.chaveConta) ?? []), l])
const cruzadas = [...porConta.values()].filter((g) => new Set(g.map((l) => l.donoId)).size > 1)

// C. documento suspeito
const outroTitular = []
const semDocNomeDiferente = []
for (const l of linhas) {
  if (!l.chaveConta) continue
  if (l.titular_documento) {
    if (l.donoDoc && !mesmoTitular(l.titular_documento, l.donoDoc)) {
      // cadastro do dono com o CNPJ/CPF incompleto (sem zeros à esquerda ou sem
      // os dígitos verificadores): o titular é o próprio dono
      const semZerosNoDono = l.donoDoc.length < l.titular_documento.length && (l.titular_documento.startsWith(l.donoDoc) || l.titular_documento.endsWith(l.donoDoc))
      outroTitular.push({ l, digitacao: semZerosNoDono || distancia(l.titular_documento, l.donoDoc) <= 2, semZerosNoDono })
    }
  } else if (t(l.favorecido) && (digitos(l.favorecido).length >= 9 || !nomeBate(l.favorecido, l.nomes))) {
    // ≥ 9 dígitos no titular = um CPF/CNPJ que não passou na validação
    semDocNomeDiferente.push(l)
  }
}

const out = []
const dono = (l) => `${l.tipo} **${l.donoNome}** (${mascarar(l.donoDoc)})`
out.push(`# Contas bancárias para revisar — produção, ${new Date().toLocaleDateString("pt-BR")}`, "")
out.push(
  `${linhas.length} contas com dono. ${repetidas.length} grupos repetidos no mesmo dono (${repetidas.reduce((n, g) => n + g.length - 1, 0)} contas sobrando), ` +
    `${cruzadas.length} contas usadas por mais de um dono, ${outroTitular.length} com documento de outro titular, ${semDocNomeDiferente.length} sem documento e com titular de outro nome ou CPF/CNPJ inválido.`,
  ""
)
out.push(`## A. Repetidas no mesmo dono (${repetidas.length})`, "", "Sugestão: manter a marcada ✅ e passar as ordens das outras para ela.", "")
for (const g of repetidas) {
  const ord = [...g].sort(melhor)
  out.push(`- ${dono(g[0])} — ${g.length} cópias`)
  ord.forEach((l, i) => out.push(`  - ${i === 0 ? "✅" : "✖"} ${descreve(l)}`))
}
out.push("", `## B. Mesma conta em donos diferentes (${cruzadas.length})`, "")
for (const g of cruzadas) {
  out.push(`- ${t(g[0].banco) ?? "banco ?"} ag ${t(g[0].agencia)} cc ${t(g[0].conta)}`)
  for (const l of g) out.push(`  - ${dono(l)} · ${descreve(l)}`)
}
out.push("", `## C1. Documento de outro titular (${outroTitular.length})`, "", "⚠️ = difere do documento do dono em até 2 dígitos (parece digitação).", "")
for (const { l, digitacao, semZerosNoDono } of outroTitular.sort((a, b) => Number(b.digitacao) - Number(a.digitacao) || a.l.donoNome.localeCompare(b.l.donoNome))) {
  const marca = semZerosNoDono ? "🔧 CPF/CNPJ do cadastro incompleto (corrigir o cadastro) — " : digitacao ? "⚠️ " : ""
  out.push(`- ${marca}${dono(l)} → conta no documento ${mascarar(l.titular_documento)}${t(l.favorecido) && palavras(l.favorecido).length ? ` ("${titularMascarado(l.favorecido)}")` : ""} · ${descreve(l)}`)
}
out.push("", `## C2. Sem documento: titular de outro nome ou CPF/CNPJ inválido (${semDocNomeDiferente.length})`, "")
for (const l of semDocNomeDiferente.sort((a, b) => a.donoNome.localeCompare(b.donoNome))) {
  const d = digitos(l.favorecido)
  const igual = !l.donoDoc
    ? ""
    : d === l.donoDoc
      ? " (mesmos dígitos do dono, mas não passa na validação)"
      : distancia(d, l.donoDoc) <= 2
        ? " ⚠️ parece digitação do documento do dono"
        : ""
  out.push(`- ${dono(l)} → titular "${titularMascarado(l.favorecido)}"${igual} · ${descreve(l)}`)
}
console.log(out.join("\n"))

// --juntar (27/10, autorizado pelo usuário): em cada grupo de A, a conta ✅
// herda o que só as cópias tinham (Pix, documento, favorita…), recebe as
// ordens das cópias e as cópias são removidas. --backup=<arquivo.json> guarda
// as cópias e as ordens repassadas antes, para desfazer se preciso.
if (process.argv.includes("--juntar")) {
  const COMPLETAR = ["banco", "banco_codigo", "tipo_conta", "pix", "pix_tipo", "titular_documento", "favorecido", "pix_beneficiario"]
  const backup = []
  const arq = process.argv.find((a) => a.startsWith("--backup="))?.slice(9)
  if (!arq) throw new Error("--juntar pede --backup=<arquivo.json>")
  let ordensMovidas = 0
  let removidas = 0
  for (const g of repetidas) {
    const [fica, ...copias] = [...g].sort(melhor)
    const idsCopias = copias.map((c) => c.id)
    const { data: ordens, error: e1 } = await s.from("ordens_pagamento").select("id, dados_bancarios_id").in("dados_bancarios_id", idsCopias)
    if (e1) throw e1
    backup.push({ fica: fica.id, copias: copias.map(({ tipo, donoId, donoNome, nomes, donoDoc, chaveConta, chavePix, ordens: _o, ...c }) => c), ordens })
    fs.writeFileSync(arq, JSON.stringify(backup, null, 1)) // antes de mexer no grupo
    const patch = {}
    for (const campo of COMPLETAR) {
      if (t(fica[campo])) continue
      const de = copias.find((c) => t(c[campo]))
      if (de) patch[campo] = de[campo]
    }
    if (!fica.favorito && copias.some((c) => c.favorito)) patch.favorito = true
    if (!fica.prefere_pix && copias.some((c) => c.prefere_pix) && (patch.pix ?? fica.pix)) patch.prefere_pix = true
    if (ordens.length) {
      const { error } = await s.from("ordens_pagamento").update({ dados_bancarios_id: fica.id }).in("dados_bancarios_id", idsCopias)
      if (error) throw error
      ordensMovidas += ordens.length
    }
    const { error: e2 } = await s.from("dados_bancarios").delete().in("id", idsCopias)
    if (e2) throw e2
    removidas += idsCopias.length
    if (Object.keys(patch).length) {
      const { error } = await s.from("dados_bancarios").update(patch).eq("id", fica.id)
      if (error) throw error
    }
  }
  console.error(`\nJuntadas: ${repetidas.length} grupos, ${removidas} cópias removidas, ${ordensMovidas} ordens repassadas.`)
}

// --juntar-pessoa (27/10, item "uma conta por pessoa"): a mesma agência+conta
// em cadastros de papéis diferentes da MESMA pessoa (todos os donos com o
// mesmo CPF válido de 11 dígitos) vira uma só: fica a ✅ (favorita, mais usada,
// com documento), as ordens das outras passam para ela e as outras saem —
// todos os papéis da pessoa enxergam a que ficou (lib/db/dados-bancarios-pessoa).
// Sem --apply só simula. Pede --backup=<arquivo.json> para gravar.
if (process.argv.includes("--juntar-pessoa")) {
  const gravar = process.argv.includes("--apply")
  const arq = process.argv.find((a) => a.startsWith("--backup="))?.slice(9)
  if (gravar && !arq) throw new Error("--juntar-pessoa --apply pede --backup=<arquivo.json>")
  const grupos = cruzadas.filter((g) => {
    const docs = new Set(g.map((l) => l.donoDoc))
    return docs.size === 1 && [...docs][0].length === 11
  })
  const backup = []
  let removidas = 0
  let movidas = 0
  for (const g of grupos) {
    const [fica, ...copias] = [...g].sort(melhor)
    const idsCopias = copias.map((c) => c.id)
    console.error(`${fica.donoNome}: fica ${fica.tipo} ${fica.id.slice(0, 8)}; sai(em) ${copias.map((c) => `${c.tipo} ${c.id.slice(0, 8)} (${c.ordens} ordens)`).join(", ")}`)
    if (!gravar) continue
    const { data: ordens, error: e1 } = await s.from("ordens_pagamento").select("id, dados_bancarios_id").in("dados_bancarios_id", idsCopias)
    if (e1) throw e1
    backup.push({ fica: fica.id, copias: copias.map(({ tipo, donoId, donoNome, nomes, donoDoc, chaveConta, chavePix, ordens: _o, ...c }) => c), ordens })
    fs.writeFileSync(arq, JSON.stringify(backup, null, 1))
    const patch = {}
    for (const campo of ["banco", "banco_codigo", "tipo_conta", "pix", "pix_tipo", "titular_documento"]) {
      if (!t(fica[campo])) {
        const de = copias.find((c) => t(c[campo]))
        if (de) patch[campo] = de[campo]
      }
    }
    if (ordens.length) {
      const { error } = await s.from("ordens_pagamento").update({ dados_bancarios_id: fica.id }).in("dados_bancarios_id", idsCopias)
      if (error) throw error
      movidas += ordens.length
    }
    const { error: e2 } = await s.from("dados_bancarios").delete().in("id", idsCopias)
    if (e2) throw e2
    removidas += idsCopias.length
    if (Object.keys(patch).length) {
      const { error } = await s.from("dados_bancarios").update(patch).eq("id", fica.id)
      if (error) throw error
    }
  }
  console.error(`\n${grupos.length} grupo(s) da mesma pessoa${gravar ? `: ${removidas} cópias removidas, ${movidas} ordens repassadas.` : " (simulação; use --apply --backup=…)."}`)
}
