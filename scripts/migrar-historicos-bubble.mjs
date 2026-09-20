// ===========================================================================
// migrar-historicos-bubble.mjs — históricos do Bubble: OFÍCIOS e DIÁRIAS.
//
// Pedido do Bruno (15/09/2026): trazer os históricos de ofícios, tipos de
// diárias e diárias (remessas e lançamentos). Requer
// supabase/historicos-oficios-diarias.sql. Mesmo motor do
// migrar-veiculos-bubble.mjs:
//
//   1. INSERE o que só existe no Bubble, na ordem das referências;
//   2. COMPLETA campos vazios aqui que estão preenchidos lá;
//   3. APLICA edições do Bubble mais novas que a última gravação daqui
//      (Modified Date > updated_at/created_at + 10 min). Edição mais recente
//      no Confluir é preservada.
//   4. --documentos: traz os arquivos do CDN do Bubble para os buckets
//      (ofícios → documentos; comprovantes das despesas de diária → pessoal).
//
// NUNCA APAGA. Referência que não resolve fica nula e é contada.
//
// Ofícios seguem a regra que a migração original usou (conferida em 15/09 nos
// 1.146 que casam): número e ano de "280 / 2026"; tipo pelo assunto
// (desfiliação / filiação / manual); situação "Cancelado" quando "Cancelado?"
// é verdadeiro, senão "Emitido"; destinatário = lista "Destinatários" unida.
// Número repetido no mesmo ano (o banco não aceita) entra sem número e é
// listado.
//
// O Bubble segue em uso até a virada destes módulos: rodar de novo com o
// cache renovado traz o que mudou.
//   Remove-Item .auditoria-bubble\oficios.json, .auditoria-bubble\diarias*.json
//
// USO:
//   node scripts/migrar-historicos-bubble.mjs                  (dry-run)
//   node scripts/migrar-historicos-bubble.mjs --apply
//   node scripts/migrar-historicos-bubble.mjs --so tipos,remessas
//   node scripts/migrar-historicos-bubble.mjs --documentos [--apply] [--limite 5]
// ===========================================================================

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs"
import { randomUUID } from "node:crypto"
import zlib from "node:zlib"
import { join } from "node:path"

const args = process.argv.slice(2)
const APLICAR = args.includes("--apply")
const DOCUMENTOS = args.includes("--documentos")
const arg = (nome) => {
  const i = args.indexOf(nome)
  return i >= 0 ? args[i + 1] : null
}
const SO = arg("--so")?.split(",") ?? null
const LIMITE = Number(arg("--limite")) || null
const CACHE = ".auditoria-bubble"
const FOLGA_MS = 10 * 60 * 1000

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
const SUPA_URL = env.NEXT_PUBLIC_SUPABASE_URL || env.SUPABASE_URL
const SUPA_KEY = env.SUPABASE_SERVICE_ROLE_KEY
const db = createClient(SUPA_URL, SUPA_KEY, { auth: { persistSession: false } })
const TENANT = "c763cb99-edfd-4840-8453-ed3fcb66d4a1"
const BASE = (env.BUBBLE_API_ROOT || "").replace(/\/+$/, "").replace(/\/obj$/, "").replace("/version-test", "")
const TOKEN = env.BUBBLE_API_TOKEN

console.log(APLICAR ? "MODO APLICAR — vai gravar." : "DRY-RUN — nada será gravado.")

// ── leitura ────────────────────────────────────────────────────────────────

const normalizar = (s) =>
  String(s).normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase().replace(/[^a-z0-9]+/g, "")

async function bubble(tipo) {
  mkdirSync(CACHE, { recursive: true })
  const arquivo = join(CACHE, normalizar(tipo) + ".json")
  if (existsSync(arquivo)) return JSON.parse(readFileSync(arquivo, "utf8"))
  const linhas = []
  for (let cursor = 0; ; ) {
    const params = new URLSearchParams({ limit: "100", cursor: String(cursor), sort_field: "Created Date", descending: "false" })
    const r = await fetch(`${BASE}/obj/${encodeURIComponent(tipo)}?${params}`, { headers: { Authorization: `Bearer ${TOKEN}` } })
    if (r.status !== 200) throw new Error(`Bubble ${tipo}: ${r.status}`)
    const j = await r.json()
    const res = j.response?.results ?? []
    linhas.push(...res)
    cursor += res.length
    if (res.length === 0 || (j.response?.remaining ?? 0) === 0) break
  }
  writeFileSync(arquivo, JSON.stringify(linhas))
  return linhas
}

async function lerTudo(tabela, colunas = "*", comTenant = true) {
  const linhas = []
  for (let de = 0; ; de += 1000) {
    let q = db.from(tabela).select(colunas).order("id", { ascending: true }).range(de, de + 999)
    if (comTenant) q = q.eq("emp_proprietaria_id", TENANT)
    const { data, error } = await q
    if (error) throw new Error(`${tabela}: ${error.message}`)
    linhas.push(...data)
    if (data.length < 1000) break
  }
  return linhas
}

const openapi = await (await fetch(`${SUPA_URL}/rest/v1/`, { headers: { apikey: SUPA_KEY, Authorization: `Bearer ${SUPA_KEY}` } })).json()
function colunasDe(tabela) {
  const props = openapi.definitions?.[tabela]?.properties ?? {}
  return Object.fromEntries(
    Object.entries(props).map(([c, p]) => {
      const fk = /Foreign Key to `([a-z_0-9]+)\.id`/.exec(p.description ?? "")
      return [c, { formato: p.format, fk: fk?.[1] ?? null }]
    })
  )
}

const resolvedores = new Map()
async function resolvedor(tabela, tipoBubble) {
  if (resolvedores.has(tabela)) return resolvedores.get(tabela)
  const linhas = await lerTudo(tabela, "id, bubble_id", false).catch(() => [])
  const ids = new Set(linhas.map((l) => l.id))
  const porBubble = new Map(linhas.filter((l) => l.bubble_id).map((l) => [l.bubble_id, l.id]))
  const supa = new Map()
  const arquivo = tipoBubble ? join(CACHE, normalizar(tipoBubble) + ".json") : null
  if (arquivo && existsSync(arquivo)) {
    for (const r of JSON.parse(readFileSync(arquivo, "utf8"))) if (r.Supabase_id) supa.set(r._id, r.Supabase_id)
  }
  const f = (idBubble) => {
    if (!idBubble) return null
    const s = supa.get(idBubble)
    if (s && ids.has(s)) return s
    return porBubble.get(idBubble) ?? null
  }
  f.aprender = (idBubble, id) => { porBubble.set(idBubble, id); ids.add(id) }
  resolvedores.set(tabela, f)
  return f
}

// ── conversões ─────────────────────────────────────────────────────────────

const dataSP = (v) => {
  const d = new Date(v)
  if (Number.isNaN(d.getTime())) return String(v).slice(0, 10)
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(d)
}
const vazio = (v) => v === undefined || v === null || (typeof v === "string" && v.trim() === "") || (Array.isArray(v) && v.length === 0)

function converter(bruto, formato) {
  if (vazio(bruto)) return null
  switch (formato) {
    case "date": return dataSP(bruto)
    case "timestamp with time zone":
    case "timestamp without time zone": return new Date(bruto).toISOString()
    case "integer": case "bigint": case "smallint": {
      const n = Math.round(Number(bruto))
      return Number.isFinite(n) ? n : null
    }
    case "numeric": case "double precision": case "real": {
      const n = Number(bruto)
      return Number.isFinite(n) ? n : null
    }
    case "boolean": return bruto === true ? true : bruto === false ? false : null
    case "jsonb": case "json": return Array.isArray(bruto) ? JSON.stringify(bruto) : bruto
    default: return Array.isArray(bruto) ? JSON.stringify(bruto) : String(bruto).trim()
  }
}

const ehUrlCdn = (s) => typeof s === "string" && (s.startsWith("//") || /^https?:\/\/[^/]*(bubble|amazonaws)/i.test(s))
const itens = (v) => {
  if (Array.isArray(v)) return v
  if (typeof v === "string" && v.trim().startsWith("[")) { try { return JSON.parse(v) } catch { return [v] } }
  return [v]
}
const jaNoBucket = (v) => itens(v).some((s) => typeof s === "string" && /\.(pdf|jpe?g|png)$/i.test(s)) && !itens(v).some(ehUrlCdn)
const apontaCdn = (v) => itens(v).some(ehUrlCdn)

function igual(a, b, formato) {
  if (vazio(a) && vazio(b)) return true
  if (vazio(a) || vazio(b)) return false
  if (formato?.startsWith("timestamp")) return new Date(a).getTime() === new Date(b).getTime()
  if (["integer", "bigint", "numeric", "double precision", "real", "smallint"].includes(formato)) return Number(a) === Number(b)
  if (formato === "date") return String(a).slice(0, 10) === String(b).slice(0, 10)
  const norm = (v) => (typeof v === "string" ? v : JSON.stringify(v)).trim()
  return norm(a) === norm(b)
}

// ── contexto: nomes de usuário (assinante do ofício) ───────────────────────

let nomesUsuarios = null
async function nomeDoUsuario(idBubble) {
  if (!nomesUsuarios) {
    const usuario = await resolvedor("usuarios", "user")
    const linhas = await lerTudo("usuarios", "id, nome_completo, nome_guerra", true)
    const porId = new Map(linhas.map((u) => [u.id, u.nome_completo ?? u.nome_guerra ?? null]))
    nomesUsuarios = (b) => porId.get(usuario(b)) ?? null
  }
  return nomesUsuarios(idBubble)
}

// ── as partes, na ordem das referências ────────────────────────────────────

const TIPO_DA_TABELA = {
  usuarios: "user",
  empresa: "empresa",
  empresa_departamentos: "empresa-departamentos",
  ordens_pagamento: "financeiro-ordempgto",
  financeiro_diarias: "diárias-tipos",
  pessoal_diarias_remessas: "diárias-remessas",
  pessoal_diarias_lancamentos: "diárias-lançamentodiário",
}

/** "280 / 2026" → { numero: 280, ano: 2026 } */
function numeroAno(bruto) {
  const m = /(\d+)\s*\/\s*(\d{4})/.exec(String(bruto ?? ""))
  return m ? { numero: Number(m[1]), ano: Number(m[2]) } : {}
}

const PARTES = [
  {
    nome: "tipos", tipo: "diárias-tipos", tabela: "financeiro_diarias",
    campos: {
      "Nome": "nome", "Descrição": "descricao", "Valor": "valor_reembolso", "Ativo?": "ativa",
      "Permanente": "permanente",
    },
    // A lista de usuários autorizados vira uuid[]; `diaria` (enum NOT NULL do
    // legado) é a categoria da viagem — os tipos do Bubble não têm, entram "Outro".
    extra: async (r, atual) => {
      const usuario = await resolvedor("usuarios", "user")
      const ids = (r["USUARIOS AUTORIZADOS"] ?? []).map(usuario).filter(Boolean)
      const e = {}
      if (!atual) { e.diaria = "Outro"; e.usuarios_autorizados = ids }
      else if (ids.length && vazio(atual.usuarios_autorizados)) e.usuarios_autorizados = ids
      if (!atual && r["Ativo?"] === undefined) e.ativa = false
      return e
    },
  },
  {
    nome: "remessas", tipo: "diárias-remessas", tabela: "pessoal_diarias_remessas",
    campos: {
      "Código": "codigo", "BENEFICIÁRIO": "beneficiario_id", "DEPARTAMENTO": "departamento_id",
      "Início": "inicio", "Término": "termino", "DATA ANO": "ano", "DATA MÊS": "mes", "Valor total": "valor_total",
      "Enviado?": "enviado", "Avaliação Aprovado?": "avaliacao_aprovado", "Avaliação data": "avaliacao_data",
      "Avaliação observação": "avaliacao_observacao", "Avaliação avaliador": "avaliador_id",
      "FORMA DE PAGAMENTO": "forma_pagamento", "ORDEM DE PGTO": "ordem_pagamento_id",
      "Pagamento pago?": "pagamento_pago",
    },
  },
  {
    nome: "lancamentos", tipo: "diárias-lançamentodiário", tabela: "pessoal_diarias_lancamentos",
    campos: {
      "Código": "codigo", "REMESSA": "remessa_id", "BENEFICIÁRIO": "beneficiario_id", "TIPO": "tipo_id",
      "Data": "data", "Atividade": "atividade", "Local": "local", "Valor Diária": "valor_diaria",
      "Valor Despesas": "valor_despesas", "Valor Total": "valor_total",
    },
    // 2 lançamentos sem REMESSA: a remessa os lista em "LANÇAMENTOS DIÁRIOS".
    extra: async (r, atual) => {
      if (r.REMESSA || (atual && atual.remessa_id)) return {}
      const dono = (await bubble("diárias-remessas")).find((m) => (m["LANÇAMENTOS DIÁRIOS"] ?? []).includes(r._id))
      const id = dono ? (await resolvedor("pessoal_diarias_remessas", "diárias-remessas"))(dono._id) : null
      return id ? { remessa_id: id } : {}
    },
  },
  {
    nome: "despesas", tipo: "diárias-despesa", tabela: "pessoal_diarias_despesas",
    campos: {
      "Código": "codigo", "LANÇAMENTO DIÁRIO": "lancamento_id", "BENEFICIÁRIO": "beneficiario_id",
      "Tipo de despesa": "tipo_despesa", "Custo": "custo", "Comprovante": "comprovante",
    },
    // A maioria das despesas não aponta o lançamento; o lançamento as lista em "DESPESAS".
    extra: async (r, atual) => {
      if (r["LANÇAMENTO DIÁRIO"] || (atual && atual.lancamento_id)) return {}
      const dono = (await bubble("diárias-lançamentodiário")).find((l) => (l.DESPESAS ?? []).includes(r._id))
      const id = dono ? (await resolvedor("pessoal_diarias_lancamentos", "diárias-lançamentodiário"))(dono._id) : null
      return id ? { lancamento_id: id } : {}
    },
  },
  {
    nome: "oficios", tipo: "ofícios", tabela: "oficios",
    campos: {
      "Assunto": "assunto", "Conteúdo": "corpo", "Aos cuidados": "aos_cuidados", "Data emissão": "data",
      "DEPARTAMENTO": "departamento_id", "REDATOR": "redator_id",
      "Arquivo assinado": "arquivo_assinado", "Arquivo resposta": "arquivos_resposta",
    },
    // Número reservado e abandonado no Bubble (sem assunto, texto, arquivo nem
    // destinatário): a migração original também não trouxe.
    pular: (r) => !r.Assunto && !r["Conteúdo"] && !r["Arquivo assinado"] && !(r["Destinatários"] ?? []).length && !r.Destino,
    extra: async (r, atual) => {
      const e = {}
      const { numero, ano } = numeroAno(r["Número"])
      const destinatarios = (r["Destinatários"] ?? []).map((d) => String(d).trim()).filter(Boolean).join(", ") || String(r.Destino ?? "").trim()
      const empresa = await resolvedor("empresa", "empresa")
      const destinatarioEmpresa = (r["EMPRESAS DESINATÁRIAS"] ?? []).map(empresa).find(Boolean) ?? null
      const situacao = r["Cancelado?"] === true ? "Cancelado" : "Emitido"
      if (!atual) {
        const assunto = String(r.Assunto ?? "")
        e.tipo = /desfilia/i.test(assunto) ? "desfiliacao" : /filia/i.test(assunto) ? "filiacao" : "manual"
        if (numero) { e.numero = numero; e.ano = ano }
        else if (r["Data emissão"]) e.ano = Number(dataSP(r["Data emissão"]).slice(0, 4))
        e.situacao = situacao
        e.saudacao = "Prezados,"
        e.fecho = "Cordialmente,"
        if (destinatarios) e.destinatario_texto = destinatarios
        if (destinatarioEmpresa) e.destinatario_empresa_id = destinatarioEmpresa
        const assinante = r.ASSINADOR ? await nomeDoUsuario(r.ASSINADOR) : null
        if (assinante) e.assinante_nome = assinante
        return e
      }
      if (destinatarios && vazio(atual.destinatario_texto)) e.destinatario_texto = destinatarios
      if (destinatarioEmpresa && vazio(atual.destinatario_empresa_id)) e.destinatario_empresa_id = destinatarioEmpresa
      if (r.ASSINADOR && vazio(atual.assinante_nome)) {
        const assinante = await nomeDoUsuario(r.ASSINADOR)
        if (assinante) e.assinante_nome = assinante
      }
      // Situação só acompanha o Bubble quando ele é mais novo (o motor decide).
      e.__situacaoBubble = situacao
      return e
    },
  },
]

// ── o trabalho: registros ──────────────────────────────────────────────────

const roda = (nome) => !SO || SO.includes(nome)
const resumo = []

async function migrarParte(parte) {
  console.log(`\n▸ ${parte.nome.toUpperCase()}  (${parte.tipo} → ${parte.tabela})`)
  const cols = colunasDe(parte.tabela)
  if (!Object.keys(cols).length) throw new Error(`tabela ${parte.tabela} não existe — rode supabase/historicos-oficios-diarias.sql`)
  const registros = await bubble(parte.tipo)
  const aqui = await lerTudo(parte.tabela, "*", "emp_proprietaria_id" in cols)
  const porId = new Map(aqui.map((a) => [a.id, a]))
  const porBubble = new Map(aqui.filter((a) => a.bubble_id).map((a) => [a.bubble_id, a]))
  const doBubble = new Set(registros.map((r) => r._id))

  const refs = new Map()
  for (const destino of Object.values(parte.campos).flat()) {
    const fk = cols[destino]?.fk
    if (fk && !refs.has(fk)) refs.set(fk, await resolvedor(fk, TIPO_DA_TABELA[fk]))
  }
  const proprio = await resolvedor(parte.tabela, parte.tipo)

  const semRef = {}
  const colunasFaltando = new Set()
  function valoresDe(r) {
    const linha = {}
    for (const [rotulo, destinoBruto] of Object.entries(parte.campos)) {
      const bruto = r[rotulo]
      if (vazio(bruto)) continue
      for (const coluna of [destinoBruto].flat()) {
        const c = cols[coluna]
        if (!c) { colunasFaltando.add(coluna); continue }
        if (c.formato === "uuid" && c.fk) {
          const id = refs.get(c.fk)(bruto)
          if (!id) { semRef[coluna] = (semRef[coluna] ?? 0) + 1; continue }
          linha[coluna] = id
        } else {
          const v = converter(bruto, c.formato)
          if (v !== null) linha[coluna] = v
        }
      }
    }
    return linha
  }

  // Ofícios: (ano, número) já usados — o banco não aceita repetido no ano.
  const numerosUsados = new Set(aqui.filter((a) => a.numero != null).map((a) => `${a.ano}/${a.numero}`))
  const semNumero = []

  const inserir = []
  const atualizar = []
  const contaPreencher = {}
  const contaEditar = {}
  let editadosNoConfluir = 0
  let pulados = 0

  for (const r of registros) {
    const atual = (r.Supabase_id && porId.get(r.Supabase_id)) || porBubble.get(r._id)
    const valores = valoresDe(r)
    const extra = parte.extra ? await parte.extra(r, atual ?? null, refs) : {}
    const situacaoBubble = extra.__situacaoBubble
    delete extra.__situacaoBubble
    if (!atual) {
      if (parte.pular?.(r)) { pulados++; continue }
      const linha = { ...valores, ...extra, bubble_id: r._id, created_at: r["Created Date"] }
      if ("emp_proprietaria_id" in cols) linha.emp_proprietaria_id = TENANT
      if ("updated_at" in cols && r["Modified Date"]) linha.updated_at = r["Modified Date"]
      if (parte.nome === "oficios" && linha.numero != null) {
        const chave = `${linha.ano}/${linha.numero}`
        if (numerosUsados.has(chave)) {
          semNumero.push(`${r["Número"]} (${r.Assunto ?? "sem assunto"})`)
          delete linha.numero
        } else numerosUsados.add(chave)
      }
      inserir.push(linha)
      continue
    }
    const referencia = new Date(atual.updated_at ?? atual.created_at).getTime()
    const bubbleMaisNovo = r["Modified Date"] && new Date(r["Modified Date"]).getTime() > referencia + FOLGA_MS
    if (atual.updated_at && r["Modified Date"] && new Date(atual.updated_at).getTime() > new Date(r["Modified Date"]).getTime() + FOLGA_MS) editadosNoConfluir++
    const patch = {}
    for (const [coluna, v] of Object.entries({ ...valores, ...extra })) {
      const formato = cols[coluna]?.formato
      if (!vazio(atual[coluna]) && jaNoBucket(atual[coluna]) && apontaCdn(v)) continue
      if (vazio(atual[coluna])) {
        patch[coluna] = v
        contaPreencher[coluna] = (contaPreencher[coluna] ?? 0) + 1
      } else if (bubbleMaisNovo && !igual(atual[coluna], v, formato)) {
        patch[coluna] = v
        contaEditar[coluna] = (contaEditar[coluna] ?? 0) + 1
      }
    }
    if (situacaoBubble && bubbleMaisNovo && atual.situacao !== situacaoBubble && atual.situacao !== "Rascunho") {
      patch.situacao = situacaoBubble
      contaEditar.situacao = (contaEditar.situacao ?? 0) + 1
    }
    if (Object.keys(patch).length) {
      if ("updated_at" in cols && bubbleMaisNovo) patch.updated_at = r["Modified Date"]
      atualizar.push([atual.id, patch])
    }
  }
  const sumiramDoBubble = aqui.filter((a) => a.bubble_id && !doBubble.has(a.bubble_id)).length

  console.log(`  Bubble ${registros.length} · aqui ${aqui.length} · inserir ${inserir.length} · atualizar ${atualizar.length}${sumiramDoBubble ? ` · ${sumiramDoBubble} com bubble_id que sumiu do Bubble (mantidos)` : ""}`)
  if (pulados) console.log(`  ${pulados} vazios no Bubble ficam de fora`)
  if (editadosNoConfluir) console.log(`  ${editadosNoConfluir} editados no Confluir depois do Bubble (preservados)`)
  for (const [c, n] of Object.entries(contaPreencher).sort((a, b) => b[1] - a[1])) console.log(`    preencher ${String(n).padStart(5)}  ${c}`)
  for (const [c, n] of Object.entries(contaEditar).sort((a, b) => b[1] - a[1])) console.log(`    editar    ${String(n).padStart(5)}  ${c}`)
  for (const [c, n] of Object.entries(semRef)) console.log(`    sem resolver ${String(n).padStart(3)}  ${c}`)
  if (colunasFaltando.size) console.log(`    ⚠ colunas inexistentes: ${[...colunasFaltando].join(", ")}`)
  if (inserir.length) console.log(`    inserir: criados de ${inserir.map((l) => l.created_at).sort()[0]?.slice(0, 10)} a ${inserir.map((l) => l.created_at).sort().at(-1)?.slice(0, 10)}`)
  if (semNumero.length) console.log(`    ${semNumero.length} ofício(s) com número já usado no ano — entram sem número: ${semNumero.slice(0, 10).join("; ")}`)

  resumo.push({ parte: parte.nome, inserir: inserir.length, atualizar: atualizar.length })
  if (!APLICAR) {
    for (const l of inserir) proprio.aprender(l.bubble_id, `novo-${l.bubble_id}`)
    return
  }

  for (let de = 0; de < inserir.length; de += 200) {
    const lote = inserir.slice(de, de + 200)
    const { data, error } = await db.from(parte.tabela).insert(lote, { defaultToNull: false }).select("id, bubble_id")
    if (error) throw new Error(`insert ${parte.tabela} a partir de ${de}: ${error.message}`)
    for (const d of data ?? []) proprio.aprender(d.bubble_id, d.id)
  }
  let feitos = 0
  for (const [id, patch] of atualizar) {
    const { error } = await db.from(parte.tabela).update(patch).eq("id", id)
    if (error) throw new Error(`update ${parte.tabela} ${id}: ${error.message}`)
    feitos++
  }
  console.log(`  gravado: ${inserir.length} inseridos, ${feitos} atualizados`)
}

// ── documentos: CDN do Bubble → buckets ────────────────────────────────────

const ARQUIVOS = [
  { tabela: "oficios", coluna: "arquivo_assinado", bucket: "documentos", pasta: (l) => `oficios/${l.id}/assinado` },
  { tabela: "oficios", coluna: "arquivos_resposta", lista: true, bucket: "documentos", pasta: (l) => `oficios/${l.id}/resposta` },
  // bucket pessoal só aceita PDF: foto JPEG vira PDF de uma página (jpegEmPdf).
  { tabela: "pessoal_diarias_despesas", coluna: "comprovante", bucket: "pessoal", soPdf: true, pasta: (l) => `diarias/despesas/${l.id}/comprovante` },
  // Recibos do reembolso do ACT (scripts/migrar-reembolsos-act-bubble.mjs).
  { tabela: "pessoal_reembolsos_act", coluna: "comprovante_url", bucket: "pessoal", soPdf: true, pasta: (l) => `reembolsos-act/${l.id}/recibo` },
]
function tipoDoArquivo(buf) {
  if (buf.subarray(0, 5).toString("latin1") === "%PDF-") return { ext: "pdf", mime: "application/pdf" }
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return { ext: "jpg", mime: "image/jpeg" }
  if (buf[0] === 0x89 && buf.subarray(1, 4).toString("latin1") === "PNG") return { ext: "png", mime: "image/png" }
  const inicio = buf.subarray(0, 4).toString("latin1")
  if (inicio === "PK\x03\x04") return { ext: "docx", mime: "application/vnd.openxmlformats-officedocument.wordprocessingml.document" }
  return null
}
/** JPEG → PDF de uma página A4 com a imagem inteira (DCTDecode, sem recodificar). */
function jpegEmPdf(jpeg) {
  let i = 2, largura = 0, altura = 0, componentes = 3
  while (i + 9 < jpeg.length) {
    if (jpeg[i] !== 0xff) { i++; continue }
    const marca = jpeg[i + 1]
    const tamanho = jpeg.readUInt16BE(i + 2)
    if (marca >= 0xc0 && marca <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marca)) {
      altura = jpeg.readUInt16BE(i + 5); largura = jpeg.readUInt16BE(i + 7); componentes = jpeg[i + 9]
      break
    }
    i += 2 + tamanho
  }
  if (!largura || !altura) return null
  const cor = componentes === 1 ? "/DeviceGray" : componentes === 4 ? "/DeviceCMYK" : "/DeviceRGB"
  return pdfDeImagem(largura, altura, cor, "/DCTDecode", jpeg)
}

/** Página A4 com a imagem inteira, centralizada. `stream` já vem no filtro dado. */
function pdfDeImagem(largura, altura, cor, filtro, stream) {
  const [pw, ph, margem] = [595.28, 841.89, 28]
  const escala = Math.min((pw - 2 * margem) / largura, (ph - 2 * margem) / altura)
  const [w, h] = [largura * escala, altura * escala]
  const [x, y] = [(pw - w) / 2, (ph - h) / 2]
  const conteudo = `q ${w.toFixed(2)} 0 0 ${h.toFixed(2)} ${x.toFixed(2)} ${y.toFixed(2)} cm /Im0 Do Q`
  const NL = "\n"
  const partes = []
  const offsets = []
  let tam = 0
  const add = (b) => { const buf = Buffer.isBuffer(b) ? b : Buffer.from(b, "latin1"); partes.push(buf); tam += buf.length }
  add("%PDF-1.4" + NL)
  const obj = (n, corpo, stream) => {
    offsets[n] = tam
    add(`${n} 0 obj${NL}${corpo}${NL}`)
    if (stream) { add("stream" + NL); add(stream); add(NL + "endstream" + NL) }
    add("endobj" + NL)
  }
  obj(1, "<< /Type /Catalog /Pages 2 0 R >>")
  obj(2, "<< /Type /Pages /Kids [3 0 R] /Count 1 >>")
  obj(3, `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${pw} ${ph}] /Resources << /XObject << /Im0 4 0 R >> >> /Contents 5 0 R >>`)
  obj(4, `<< /Type /XObject /Subtype /Image /Width ${largura} /Height ${altura} /ColorSpace ${cor} /BitsPerComponent 8 /Filter ${filtro} /Length ${stream.length} >>`, stream)
  obj(5, `<< /Length ${Buffer.byteLength(conteudo)} >>`, Buffer.from(conteudo, "latin1"))
  const xref = tam
  add(`xref${NL}0 6${NL}0000000000 65535 f ${NL}`)
  for (const n of [1, 2, 3, 4, 5]) add(`${String(offsets[n]).padStart(10, "0")} 00000 n ${NL}`)
  add(`trailer${NL}<< /Size 6 /Root 1 0 R >>${NL}startxref${NL}${xref}${NL}%%EOF${NL}`)
  return Buffer.concat(partes)
}

/**
 * PNG (8 bits, RGB/gray/RGBA) → PDF de uma página A4. Diferente do JPEG, o PNG
 * não entra cru no PDF: é preciso desfazer os filtros por linha e regravar os
 * pixels como fluxo Flate. Recibos vindos de captura de tela chegam assim.
 */
function pngEmPdf(png) {
  let i = 8
  let largura = 0, altura = 0, profundidade = 0, cor = 0
  const dados = []
  while (i + 8 <= png.length) {
    const tamanho = png.readUInt32BE(i)
    const tipo = png.subarray(i + 4, i + 8).toString("latin1")
    const corpo = png.subarray(i + 8, i + 8 + tamanho)
    if (tipo === "IHDR") {
      largura = corpo.readUInt32BE(0)
      altura = corpo.readUInt32BE(4)
      profundidade = corpo[8]
      cor = corpo[9]
      if (corpo[12] !== 0) return null // entrelaçado (Adam7): fora
    } else if (tipo === "IDAT") dados.push(corpo)
    else if (tipo === "IEND") break
    i += 12 + tamanho
  }
  const canais = { 0: 1, 2: 3, 4: 2, 6: 4 }[cor]
  if (!largura || !altura || profundidade !== 8 || !canais) return null

  const cru = zlib.inflateSync(Buffer.concat(dados))
  const bpp = canais
  const linha = largura * bpp
  if (cru.length < altura * (linha + 1)) return null
  const saida = Buffer.alloc(altura * linha)
  let anterior = Buffer.alloc(linha)
  for (let y = 0; y < altura; y++) {
    const filtro = cru[y * (linha + 1)]
    const atual = Buffer.from(cru.subarray(y * (linha + 1) + 1, (y + 1) * (linha + 1)))
    for (let x = 0; x < linha; x++) {
      const a = x >= bpp ? atual[x - bpp] : 0
      const b = anterior[x]
      const c = x >= bpp ? anterior[x - bpp] : 0
      let v = atual[x]
      if (filtro === 1) v += a
      else if (filtro === 2) v += b
      else if (filtro === 3) v += (a + b) >> 1
      else if (filtro === 4) {
        const p = a + b - c
        const pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c)
        v += pa <= pb && pa <= pc ? a : pb <= pc ? b : c
      }
      atual[x] = v & 0xff
    }
    atual.copy(saida, y * linha)
    anterior = atual
  }

  // Alfa fora: o fundo vira branco (o PDF não guarda transparência aqui).
  const saida3 = cor === 6 || cor === 4
    ? Buffer.alloc(largura * altura * (cor === 6 ? 3 : 1))
    : saida
  if (cor === 6 || cor === 4) {
    const canaisCor = cor === 6 ? 3 : 1
    for (let p = 0, q = 0; p < saida.length; p += bpp, q += canaisCor) {
      const alfa = saida[p + canaisCor] / 255
      for (let k = 0; k < canaisCor; k++) {
        saida3[q + k] = Math.round(saida[p + k] * alfa + 255 * (1 - alfa))
      }
    }
  }
  const espaco = cor === 0 || cor === 4 ? "/DeviceGray" : "/DeviceRGB"
  return pdfDeImagem(largura, altura, espaco, "/FlateDecode", zlib.deflateSync(saida3))
}

async function baixar(url) {
  const alvo = url.startsWith("//") ? `https:${url}` : url
  for (let t = 1; t <= 3; t++) {
    try {
      const r = await fetch(alvo)
      if (r.status === 404 || r.status === 403) return { erro: `HTTP ${r.status}` }
      if (r.ok) {
        const buf = Buffer.from(await r.arrayBuffer())
        if (buf.length === 0) return { erro: "arquivo vazio no Bubble" }
        const tipo = tipoDoArquivo(buf)
        return tipo ? { buf, tipo } : { erro: `formato não reconhecido (${buf.subarray(0, 20).toString("latin1")})` }
      }
    } catch (e) {
      if (t === 3) return { erro: e.message }
    }
    await new Promise((ok) => setTimeout(ok, 600 * t))
  }
  return { erro: "falha ao baixar" }
}

async function migrarDocumentos() {
  console.log(`\n▸ DOCUMENTOS (CDN do Bubble → buckets)`)
  let total = 0, feitos = 0
  const falhas = []
  for (const a of ARQUIVOS) {
    const cols = colunasDe(a.tabela)
    if (!(a.coluna in cols)) { console.log(`  ${a.tabela}.${a.coluna}: coluna inexistente — rode o SQL`); continue }
    const linhas = (await lerTudo(a.tabela, "*", "emp_proprietaria_id" in cols)).filter((l) => itens(l[a.coluna]).some(ehUrlCdn))
    const alvo = LIMITE ? linhas.slice(0, LIMITE) : linhas
    const n = alvo.reduce((s, l) => s + itens(l[a.coluna]).filter(ehUrlCdn).length, 0)
    total += n
    console.log(`  ${a.tabela}.${a.coluna}: ${n} arquivo(s) em ${alvo.length} linha(s) → bucket ${a.bucket}`)
    if (!APLICAR) continue
    for (const l of alvo) {
      const originais = itens(l[a.coluna])
      const novos = []
      const enviados = []
      for (const url of originais) {
        if (!ehUrlCdn(url)) { novos.push(url); continue }
        let { buf, tipo, erro } = await baixar(url)
        if (buf && a.soPdf && tipo.ext !== "pdf") {
          const pdf = tipo.ext === "jpg" ? jpegEmPdf(buf) : tipo.ext === "png" ? pngEmPdf(buf) : null
          if (pdf) { buf = pdf; tipo = { ext: "pdf", mime: "application/pdf" } }
          else { buf = null; erro = `${tipo.ext} não convertido (bucket ${a.bucket} só aceita PDF)` }
        }
        if (!buf) { falhas.push(`${a.tabela}.${a.coluna} ${l.id}: ${erro}`); novos.push(url); continue }
        const caminho = `${a.pasta(l)}-${randomUUID().slice(0, 8)}.${tipo.ext}`
        const { error } = await db.storage.from(a.bucket).upload(caminho, buf, { contentType: tipo.mime })
        if (error) { falhas.push(`${a.tabela}.${a.coluna} ${l.id}: upload ${error.message}`); novos.push(url); continue }
        enviados.push(caminho)
        novos.push(caminho)
      }
      if (!enviados.length) continue
      const valor = a.lista ? JSON.stringify(novos) : novos[0]
      const { error } = await db.from(a.tabela).update({ [a.coluna]: valor }).eq("id", l.id)
      if (error) {
        await db.storage.from(a.bucket).remove(enviados)
        falhas.push(`${a.tabela}.${a.coluna} ${l.id}: update ${error.message}`)
        continue
      }
      feitos += enviados.length
    }
  }
  console.log(`  ${APLICAR ? `migrados ${feitos} de ${total}` : `a migrar: ${total}`}`)
  if (falhas.length) {
    console.log(`  falhas (${falhas.length}) — seguem apontando para o Bubble:`)
    for (const f of falhas.slice(0, 30)) console.log(`    ${f}`)
  }
}

// ── execução ───────────────────────────────────────────────────────────────

try {
  if (DOCUMENTOS) {
    await migrarDocumentos()
  } else {
    for (const parte of PARTES) if (roda(parte.nome)) await migrarParte(parte)
    console.log(`\n${APLICAR ? "Pronto" : "Dry-run"}: ${resumo.map((r) => `${r.parte} +${r.inserir}/~${r.atualizar}`).join(" · ")}`)
    console.log("Depois: node scripts/migrar-historicos-bubble.mjs --documentos (arquivos para os buckets).")
  }
} catch (e) {
  console.error(`\nERRO: ${e.message}`)
  process.exit(1)
}
