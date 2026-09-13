// ===========================================================================
// migrar-veiculos-bubble.mjs — o módulo Veículos do Bubble para o Supabase.
//
// A sincronização (n8n) parou de trazer Veículos em junho de 2026: tudo que
// nasceu depois só existe no Bubble (entradas e saídas, agendamentos,
// infrações, contratos, veículos novos) e as CNHs nunca vieram. Este script:
//
//   1. INSERE o que só existe no Bubble, na ordem das referências;
//   2. COMPLETA campos vazios aqui que estão preenchidos lá;
//   3. APLICA edições feitas no Bubble depois da última gravação daqui
//      (Modified Date do Bubble > updated_at/created_at daqui + 10 min — a
//      folga descarta o carimbo que a própria migração deixou ao gravar o
//      Supabase_id). Edição mais recente no Confluir é preservada.
//   4. Carrega as CNHs em veiculos_condutores (1 por usuário; a mais recente).
//   5. --documentos: traz para o bucket `veiculos` os arquivos que ainda
//      apontam para o CDN do Bubble (CRLV, apólice, CRV, contrato, anexos das
//      infrações, CNH).
//
// NUNCA APAGA: vazio no Bubble não apaga valor daqui; registro que sumiu do
// Bubble só é contado. Referência que não resolve fica nula e é contada.
//
// Conversões guiadas pelo schema real (OpenAPI do PostgREST): coluna `date`
// recebe a data de São Paulo; `uuid` com chave estrangeira é resolvida pelo
// bubble_id da tabela apontada.
//
// O Bubble segue em uso: rodar de novo com o cache renovado traz o que mudou.
//   Remove-Item .auditoria-bubble\veiculos*.json, .auditoria-bubble\cnh.json
//
// USO:
//   node scripts/migrar-veiculos-bubble.mjs                 (dry-run)
//   node scripts/migrar-veiculos-bubble.mjs --apply
//   node scripts/migrar-veiculos-bubble.mjs --so infracoes,condutores
//   node scripts/migrar-veiculos-bubble.mjs --documentos [--apply] [--limite 5]
//   node scripts/migrar-veiculos-bubble.mjs --reparar-carimbo <de> <até> [--apply]
//     devolve o updated_at ao Modified Date do Bubble nas linhas carimbadas por
//     uma rodada anterior (que gravava "agora" e as fazia parecer editadas no
//     Confluir). Roda antes das partes, na mesma execução.
// ===========================================================================

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs"
import { randomUUID } from "node:crypto"
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
const REPARAR = (() => {
  const i = args.indexOf("--reparar-carimbo")
  if (i < 0) return null
  const de = new Date(args[i + 1]), ate = new Date(args[i + 2])
  if (Number.isNaN(de.getTime()) || Number.isNaN(ate.getTime())) throw new Error("--reparar-carimbo <de> <até> em ISO")
  return { de: de.toISOString(), ate: ate.toISOString() }
})()
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
  String(s).normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "")

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

// Schema real: formato de cada coluna e chaves estrangeiras.
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

// Resolve id do Bubble → id daqui, pelo bubble_id da tabela apontada (e pelo
// Supabase_id do cache do tipo, quando há).
const resolvedores = new Map()
async function resolvedor(tabela, tipoBubble) {
  if (resolvedores.has(tabela)) return resolvedores.get(tabela)
  const cols = colunasDe(tabela)
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
  f.temBubbleId = "bubble_id" in cols
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
    case "integer": case "bigint": case "smallint": return Math.round(Number(bruto))
    case "numeric": case "double precision": case "real": return Number(bruto)
    case "boolean": return bruto === true ? true : bruto === false ? false : null
    case "jsonb": case "json": return Array.isArray(bruto) ? JSON.stringify(bruto) : bruto
    default: return Array.isArray(bruto) ? JSON.stringify(bruto) : String(bruto).trim()
  }
}

const ehUrlCdn = (s) => typeof s === "string" && (s.startsWith("//") || /^https?:\/\/[^/]*(bubble|amazonaws)/i.test(s))
const itens = (v) => {
  if (typeof v === "string" && v.trim().startsWith("[")) { try { return JSON.parse(v) } catch { return [v] } }
  return [v]
}
/** Valor de arquivo(s) sem nenhum link do CDN — já está no nosso bucket. */
const jaNoBucket = (v) => itens(v).some((s) => typeof s === "string" && /\.(pdf|jpe?g|png)$/i.test(s)) && !itens(v).some(ehUrlCdn)
const apontaCdn = (v) => itens(v).some(ehUrlCdn)

/**
 * Instante da saída/entrada. Meia-noite exata em São Paulo é data digitada sem
 * hora no Bubble: fica sem horário, para a tela não mostrar "às 00:00".
 */
const COM_HORA = new Set(["retirada_em", "devolucao_em"])
function instanteComHora(bruto) {
  if (vazio(bruto)) return null
  const d = new Date(bruto)
  if (Number.isNaN(d.getTime())) return null
  const hora = new Intl.DateTimeFormat("en-GB", { timeZone: "America/Sao_Paulo", hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23" }).format(d)
  if (hora === "00:00:00" && d.getUTCMilliseconds() === 0) return null
  return d.toISOString()
}

/** Mesmo valor? (compara no formato da coluna) */
function igual(a, b, formato) {
  if (vazio(a) && vazio(b)) return true
  if (vazio(a) || vazio(b)) return false
  if (formato?.startsWith("timestamp")) return new Date(a).getTime() === new Date(b).getTime()
  if (["integer", "bigint", "numeric", "double precision", "real", "smallint"].includes(formato)) return Number(a) === Number(b)
  if (formato === "date") return String(a).slice(0, 10) === String(b).slice(0, 10)
  const norm = (v) => (typeof v === "string" ? v : JSON.stringify(v)).trim()
  return norm(a) === norm(b)
}

// ── as partes, na ordem das referências ────────────────────────────────────
//
// `campos`: rótulo do Bubble → coluna daqui. Coluna uuid com FK é resolvida
// sozinha; `tipos` diz o tipo do Bubble da tabela apontada (para o
// Supabase_id do cache).

const TIPO_DA_TABELA = {
  veiculos: "veículos",
  veiculo_contratos_aluguel: "veículoscontratosdealuguel",
  veiculos_agendamentos: "veículosagendamentos",
  usuarios: "user",
  empresa: "empresa",
}

const agora = new Date()
const PARTES = [
  {
    nome: "contratos", tipo: "veículoscontratosdealuguel", tabela: "veiculo_contratos_aluguel",
    campos: {
      "Número contrato locadora": "numero_contrato_locadora", "Vigência Início": "vigencia_inicio",
      "Vigência Término": "vigencia_termino", "Finalizado?": "finalizado", "Arquivo do contrato": "arquivo_contrato_url",
      "CENTRO DE CUSTO": "centro_custo_id", "DEPARTAMENTO": "departamento_id", "FORNECEDOR": "fornecedor_id",
      "RESPONSÁVEL": "responsavel_id", "ORDENS DE PAGTO": "ordens_pagto", "APROVAÇÃO": "aprovacao_raw",
    },
  },
  {
    nome: "veiculos", tipo: "veículos", tabela: "veiculos",
    campos: {
      "Placa": "placa", "Cor": "cor", "Renavan": "renavan", "Código": "codigo", "Início": "inicio", "Término": "termino",
      "Lotação": "lotacao", "Lotação OS": "lotacao_os", "Ativo": "ativo", "Condutor": "condutor", "CRLV": "crlv",
      "Combustível": "combustivel", "Inativo?": "inativo", "Dedicação": "dedicacao", "Marca Modelo": "marca_modelo",
      "É alugado?": "eh_alugado", "Ano do modelo": "ano_modelo", "Ano de fabricação": "ano_fabricacao",
      "Manutenção": "manutencao", "Seguro apólice": "seguro_apolice_url", "Seguro vencimento": "seguro_vencimento",
      "Contrato de locação": "contrato_locacao_url", "CRV (transferência)": "crv_transferencia_url",
    },
  },
  {
    nome: "vinculos", tipo: "veículoscontratodealuguelvínculo", tabela: "veiculo_contrato_aluguel_vinculo", semTenant: true,
    campos: {
      "CONTRATO DE ALUGUEL": "contrato_id", "VEÍCULO": "veiculo_id", "Início": "inicio", "Término": "termino",
      "Desvinculado?": "desvinculado", "Km mensal (franquia)": "km_mensal_franquia",
    },
  },
  {
    nome: "agendamentos", tipo: "veículosagendamentos", tabela: "veiculos_agendamentos",
    campos: {
      "Motivo": "motivo", "Destino": "destino", "Atendido?": "atendido", "Data de retirada": "data_retirada",
      "Data de retorno": "data_retorno", "SEDE DA RETIRADA": "sede_retirada_os", "CONDUTOR": "condutor_id",
      "VEÍCULO": "veiculo_id", "EMPRESA": "empresa_id",
    },
    // Mesma regra do backfill de supabase/veiculos.sql, mais: pedido ainda por
    // vir e não atendido fica na fila ('solicitada'), não 'expirada'.
    derivar: (linha, atual) => {
      const intocado = !atual || (!atual.atendido_por_id && !atual.cancelado_em && ["expirada", "solicitada", "concluida", null].includes(atual.situacao))
      if (!intocado) return {}
      const atendido = linha.atendido ?? atual?.atendido
      const retirada = linha.data_retirada ?? atual?.data_retirada
      const situacao = atendido === true ? "concluida" : retirada && retirada >= dataSP(agora) ? "solicitada" : "expirada"
      return atual?.situacao === situacao ? {} : { situacao }
    },
  },
  {
    nome: "disponibilidade", tipo: "veículosdisponibilidade", tabela: "veiculos_disponibilidade",
    campos: {
      // A data vai para a coluna DATE e o instante para retirada_em/devolucao_em
      // (supabase/veiculos-horarios-situacao.sql).
      "Código": "codigo", "CONDUTOR": "condutor_id", "VEÍCULO": "veiculo_id",
      "Data da retirada": ["data_retirada", "retirada_em"],
      "Data da devolução": ["data_devolucao", "devolucao_em"], "Destino": "destino", "Motivo": "motivo", "Disponível?": "disponivel",
      "Hodômetro da retirada": "hodometro_retirada", "Hodômetro da devolução": "hodometro_devolucao", "Km rodado": "km_rodado",
      "Manutenção?": "manutencao", "Observação de retorno": "observacao_retorno", "Previsão de retorno": "previsao_retorno",
      "Previsão de retorno negada?": "previsao_retorno_negada", "Sede da retirada": "sede_retirada",
      "Sede da devolução": "sede_devolucao", "Sede retirada OS": "sede_retirada_os", "Sede devolução OS": "sede_devolucao_os",
      "Tempo com veículo": "tempo_com_veiculo",
    },
    // A migração original cortou a data em UTC: a saída às 21h30 de São Paulo
    // ficou no dia seguinte. Com o instante conhecido, o dia de SP manda.
    derivar: (linha) => {
      const d = {}
      if (linha.retirada_em && linha.data_retirada && dataSP(linha.retirada_em) !== String(linha.data_retirada).slice(0, 10)) d.data_retirada = dataSP(linha.retirada_em)
      if (linha.devolucao_em && linha.data_devolucao && dataSP(linha.devolucao_em) !== String(linha.data_devolucao).slice(0, 10)) d.data_devolucao = dataSP(linha.devolucao_em)
      return d
    },
  },
  {
    nome: "abastecimentos", tipo: "veículosabastecimentos", tabela: "veiculos_abastecimentos",
    campos: {
      "Cidade": "cidade", "Posto": "posto", "Combustível": "combustivel", "COMBUSTÍVEL": "combustivel_tipo",
      "Data e hora do abastecimento": "data_hora_abastecimento", "Valor do abastecimento": "valor_abastecimento",
      "Volume abastecido": "volume_abastecido", "USUÁRIO": "usuario_id",
    },
  },
  {
    // veiculos_infracoes não tem emp_proprietaria_id (tabela do tenant único).
    nome: "infracoes", tipo: "veículosinfrações", tabela: "veiculos_infracoes", semTenant: true,
    campos: {
      "Código": "codigo", "Infração tipo": "infracao_tipo", "Infração data": "infracao_data",
      "Infração órgão autuador": "infracao_orgao_autuador", "Infração local": "infracao_local",
      "Infração auto de": "infracao_auto_de", "Infração descrição": "infracao_descricao", "Infração custo": "infracao_custo",
      "Infração arquivo notificação": "infracao_arquivo_notificacao", "Boleto": "boleto",
      "Notificação infrator": "notificacao_infrator", "Notificação infrator quando": "notificacao_infrator_quando",
      "Justificativa descrição": "justificativa_descricao", "Justificativa quando": "justificativa_quando",
      "Justificativa sindical?": "justificativa_sindical", "JUSTIFICATIVA AVALIADOR": "justificativa_avaliador_id",
      "Avaliação quando": "avaliacao_quando", "AVALIAÇÃO VERIFICADOR": "avaliacao_verificador_id",
      "Identificação real infrator": "identificacao_real_infrator", "Condutor Formalização do real infrator": "formaliz_real_infrator",
      "Reembolso": "reembolso", "Reembolso quando": "reembolso_quando", "Reembolso infrator": "reembolso_infrator",
      "Reembolso obs financeiro": "reembolso_obs_financeiro", "REEMBOLSO AVALIADOR": "reembolso_avaliador_id",
      "CONDUTOR INFRATOR": "condutor_infrator_id", "VEÍCULO": "veiculo_id",
      "ORDEM DE PAGAMENTO": ["ordem_pagamento", "ordem_pagamento_id"],
    },
    // Mesmo backfill de supabase/veiculos.sql: reembolso concluído = cobrança
    // baixada; justificativa sindical = isenta. Só quando ainda não há gestão.
    derivar: (linha, atual) => {
      if (atual?.cobranca_situacao) return {}
      const reembolso = linha.reembolso ?? atual?.reembolso
      const sindical = linha.justificativa_sindical ?? atual?.justificativa_sindical
      if (reembolso === true) {
        const quando = linha.reembolso_quando ?? atual?.reembolso_quando
        return { cobranca_situacao: "baixada", ...(quando ? { baixa_em: new Date(`${quando}T12:00:00-03:00`).toISOString() } : {}) }
      }
      if (sindical === true) return { cobranca_situacao: "isenta" }
      return {}
    },
  },
]

// ── o trabalho: registros ──────────────────────────────────────────────────

const roda = (nome) => !SO || SO.includes(nome)
const resumo = []

async function migrarParte(parte) {
  console.log(`\n▸ ${parte.nome.toUpperCase()}  (${parte.tipo} → ${parte.tabela})`)
  const cols = colunasDe(parte.tabela)
  const registros = await bubble(parte.tipo)
  const aqui = await lerTudo(parte.tabela, "*", !parte.semTenant)
  const porId = new Map(aqui.map((a) => [a.id, a]))
  const porBubble = new Map(aqui.filter((a) => a.bubble_id).map((a) => [a.bubble_id, a]))
  const doBubble = new Set(registros.map((r) => r._id))

  // resolvedores das FKs usadas nesta parte
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
      const destinos = [destinoBruto].flat()
      const bruto = r[rotulo]
      if (vazio(bruto)) continue
      for (const coluna of destinos) {
        const c = cols[coluna]
        if (!c) { colunasFaltando.add(coluna); continue }
        if (c.formato === "uuid" && c.fk) {
          const id = refs.get(c.fk)(bruto)
          if (!id) { semRef[coluna] = (semRef[coluna] ?? 0) + 1; continue }
          linha[coluna] = id
        } else if (COM_HORA.has(coluna)) {
          const v = instanteComHora(bruto)
          if (v !== null) linha[coluna] = v
        } else {
          const v = converter(bruto, c.formato)
          if (v !== null) linha[coluna] = v
        }
      }
    }
    return linha
  }

  const inserir = []
  const atualizar = [] // [id, patch]
  const contaPreencher = {}
  const contaEditar = {}
  let editadosNoConfluir = 0

  for (const r of registros) {
    const atual = (r.Supabase_id && porId.get(r.Supabase_id)) || porBubble.get(r._id)
    const valores = valoresDe(r)
    if (!atual) {
      const linha = { ...valores, bubble_id: r._id, created_at: r["Created Date"] }
      if (!parte.semTenant) linha.emp_proprietaria_id = TENANT
      if ("updated_at" in cols && r["Modified Date"]) linha.updated_at = r["Modified Date"]
      Object.assign(linha, parte.derivar?.(linha, null) ?? {})
      inserir.push(linha)
      continue
    }
    const referencia = new Date(atual.updated_at ?? atual.created_at).getTime()
    const bubbleMaisNovo = r["Modified Date"] && new Date(r["Modified Date"]).getTime() > referencia + FOLGA_MS
    if (atual.updated_at && r["Modified Date"] && new Date(atual.updated_at).getTime() > new Date(r["Modified Date"]).getTime() + FOLGA_MS) editadosNoConfluir++
    const patch = {}
    for (const [coluna, v] of Object.entries(valores)) {
      const formato = cols[coluna].formato
      // Arquivo já trazido para o bucket (--documentos) não volta a apontar
      // para o CDN do Bubble.
      if (!vazio(atual[coluna]) && jaNoBucket(atual[coluna]) && apontaCdn(v)) continue
      if (vazio(atual[coluna])) {
        patch[coluna] = v
        contaPreencher[coluna] = (contaPreencher[coluna] ?? 0) + 1
      } else if (bubbleMaisNovo && !igual(atual[coluna], v, formato)) {
        patch[coluna] = v
        contaEditar[coluna] = (contaEditar[coluna] ?? 0) + 1
      }
    }
    const derivados = parte.derivar?.({ ...atual, ...patch }, atual) ?? {}
    for (const [c, v] of Object.entries(derivados)) {
      if (!igual(atual[c], v, cols[c]?.formato)) { patch[c] = v; contaEditar[`${c} (derivado)`] = (contaEditar[`${c} (derivado)`] ?? 0) + 1 }
    }
    if (Object.keys(patch).length) {
      // Carimbar "agora" faria a linha parecer editada no Confluir e travaria
      // as próximas edições vindas do Bubble. Só acompanha o Bubble quando ele
      // é mais novo; preencher vazio não mexe no carimbo.
      if ("updated_at" in cols && bubbleMaisNovo) patch.updated_at = r["Modified Date"]
      atualizar.push([atual.id, patch])
    }
  }
  const sumiramDoBubble = aqui.filter((a) => a.bubble_id && !doBubble.has(a.bubble_id)).length

  console.log(`  Bubble ${registros.length} · aqui ${aqui.length} · inserir ${inserir.length} · atualizar ${atualizar.length}${sumiramDoBubble ? ` · ${sumiramDoBubble} com bubble_id que sumiu do Bubble (mantidos)` : ""}`)
  if (editadosNoConfluir) console.log(`  ${editadosNoConfluir} editados no Confluir depois do Bubble (preservados)`)
  for (const [c, n] of Object.entries(contaPreencher).sort((a, b) => b[1] - a[1])) console.log(`    preencher ${String(n).padStart(5)}  ${c}`)
  for (const [c, n] of Object.entries(contaEditar).sort((a, b) => b[1] - a[1])) console.log(`    editar    ${String(n).padStart(5)}  ${c}`)
  for (const [c, n] of Object.entries(semRef)) console.log(`    sem resolver ${String(n).padStart(3)}  ${c}`)
  if (colunasFaltando.size) console.log(`    ⚠ colunas inexistentes: ${[...colunasFaltando].join(", ")}`)
  if (inserir.length) console.log(`    inserir: criados de ${inserir.map((l) => l.created_at).sort()[0]?.slice(0, 10)} a ${inserir.map((l) => l.created_at).sort().at(-1)?.slice(0, 10)}`)

  resumo.push({ parte: parte.nome, inserir: inserir.length, atualizar: atualizar.length })
  if (!APLICAR) {
    // referências a linhas desta rodada ainda não existem: aprende ids fictícios
    for (const l of inserir) proprio.aprender(l.bubble_id, `novo-${l.bubble_id}`)
    return
  }

  for (let de = 0; de < inserir.length; de += 200) {
    const lote = inserir.slice(de, de + 200)
    const { data, error } = await db.from(parte.tabela).insert(lote).select("id, bubble_id")
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

// ── condutores: CNH do Bubble → veiculos_condutores ────────────────────────

async function migrarCondutores() {
  console.log(`\n▸ CONDUTORES  (cnh + user."CNH autorizado?" → veiculos_condutores)`)
  const cnhs = await bubble("cnh")
  const usuario = await resolvedor("usuarios", "user")
  const atuais = await lerTudo("veiculos_condutores", "*", false)
  const porUsuario = new Map(atuais.map((c) => [c.usuario_id, c]))
  const autorizadosAqui = new Set((await lerTudo("usuarios", "id, cnh_autorizado", true)).filter((u) => u.cnh_autorizado === true).map((u) => u.id))

  // uma CNH por usuário: a de vencimento mais distante (empate: a mais nova)
  const escolhida = new Map()
  let semUsuario = 0
  for (const c of cnhs) {
    const u = usuario(c["USUÁRIO"])
    if (!u) { semUsuario++; continue }
    const atual = escolhida.get(u)
    const chave = (x) => `${x.Vencimento ?? ""}|${x["Created Date"]}`
    if (!atual || chave(c) > chave(atual)) escolhida.set(u, c)
  }

  const inserir = []
  const atualizar = []
  const conta = {}
  const soma = (k) => (conta[k] = (conta[k] ?? 0) + 1)
  const ids = new Set([...escolhida.keys(), ...autorizadosAqui])
  for (const u of ids) {
    const c = escolhida.get(u)
    const dados = c
      ? {
          cnh_numero: converter(c["Número"], "text"),
          cnh_categoria: converter(c.Categoria, "text"),
          cnh_validade: converter(c.Vencimento, "date"),
          cnh_arquivo_url: converter(c["arquivo do documento"], "text"),
        }
      : {}
    const autorizado = c?.["Autorizado a dirigir?"] === true || autorizadosAqui.has(u)
    const atual = porUsuario.get(u)
    if (!atual) {
      inserir.push({ usuario_id: u, emp_proprietaria_id: TENANT, autorizado, ...Object.fromEntries(Object.entries(dados).filter(([, v]) => v !== null)), observacao: c ? null : "Autorizado no sistema anterior, sem CNH cadastrada." })
      soma(c ? "novo com CNH" : "novo só com a autorização (sem CNH no Bubble)")
      continue
    }
    const patch = {}
    for (const [k, v] of Object.entries(dados)) if (v !== null && vazio(atual[k])) { patch[k] = v; soma(`preencher ${k}`) }
    // autorização dada no Confluir (tem quem autorizou) não é mexida
    if (autorizado && !atual.autorizado && !atual.autorizado_por_id) { patch.autorizado = true; soma("preencher autorizado") }
    if (Object.keys(patch).length) atualizar.push([atual.id, { ...patch, updated_at: new Date().toISOString() }])
  }
  console.log(`  CNHs no Bubble ${cnhs.length} (${semUsuario} sem usuário daqui) · usuários com CNH ${escolhida.size} · autorizados aqui ${autorizadosAqui.size} · condutores aqui ${atuais.length}`)
  console.log(`  inserir ${inserir.length} (autorizados ${inserir.filter((l) => l.autorizado).length}) · atualizar ${atualizar.length}`)
  for (const [k, n] of Object.entries(conta)) console.log(`    ${String(n).padStart(4)}  ${k}`)
  const vencidas = inserir.filter((l) => l.autorizado && l.cnh_validade && l.cnh_validade < dataSP(agora)).length
  if (vencidas) console.log(`    ${vencidas} autorizados com CNH vencida — o app os mostra como "CNH vencida" e não os deixa solicitar`)
  resumo.push({ parte: "condutores", inserir: inserir.length, atualizar: atualizar.length })
  if (!APLICAR) return
  if (inserir.length) {
    const { error } = await db.from("veiculos_condutores").insert(inserir)
    if (error) throw new Error(`insert veiculos_condutores: ${error.message}`)
  }
  for (const [id, patch] of atualizar) {
    const { error } = await db.from("veiculos_condutores").update(patch).eq("id", id)
    if (error) throw new Error(`update veiculos_condutores ${id}: ${error.message}`)
  }
  console.log(`  gravado: ${inserir.length} inseridos, ${atualizar.length} atualizados`)
}

// ── documentos: CDN do Bubble → bucket `veiculos` ──────────────────────────

const ARQUIVOS = [
  { tabela: "veiculos", coluna: "crlv", lista: true, pasta: (l) => `frota/${l.id}/crlv` },
  { tabela: "veiculos", coluna: "seguro_apolice_url", pasta: (l) => `frota/${l.id}/apolice` },
  { tabela: "veiculos", coluna: "crv_transferencia_url", pasta: (l) => `frota/${l.id}/crv` },
  { tabela: "veiculos", coluna: "contrato_locacao_url", pasta: (l) => `frota/${l.id}/contrato-locacao` },
  { tabela: "veiculo_contratos_aluguel", coluna: "arquivo_contrato_url", pasta: (l) => `contratos/${l.id}/contrato` },
  { tabela: "veiculos_infracoes", coluna: "infracao_arquivo_notificacao", pasta: (l) => `infracoes/${l.id}/notificacao` },
  { tabela: "veiculos_infracoes", coluna: "boleto", pasta: (l) => `boletos/${l.id}/boleto` },
  { tabela: "veiculos_infracoes", coluna: "identificacao_real_infrator", pasta: (l) => `infracoes/${l.id}/identificacao-infrator` },
  { tabela: "veiculos_infracoes", coluna: "formaliz_real_infrator", pasta: (l) => `infracoes/${l.id}/formalizacao-infrator` },
  { tabela: "veiculos_infracoes", coluna: "reembolso_infrator", pasta: (l) => `infracoes/${l.id}/reembolso` },
  { tabela: "veiculos_condutores", coluna: "cnh_arquivo_url", pasta: (l) => `cnh/${l.usuario_id}/cnh` },
]
const ehCdn = (v) => typeof v === "string" && (v.startsWith("//") || /^https?:\/\/[^/]*(bubble|amazonaws)/i.test(v))
function tipoDoArquivo(buf) {
  if (buf.subarray(0, 5).toString("latin1") === "%PDF-") return { ext: "pdf", mime: "application/pdf" }
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return { ext: "jpg", mime: "image/jpeg" }
  if (buf[0] === 0x89 && buf.subarray(1, 4).toString("latin1") === "PNG") return { ext: "png", mime: "image/png" }
  return null
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
  console.log(`\n▸ DOCUMENTOS (CDN do Bubble → bucket veiculos)`)
  let total = 0, feitos = 0
  const falhas = []
  for (const a of ARQUIVOS) {
    const comTenant = "emp_proprietaria_id" in colunasDe(a.tabela)
    const linhas = (await lerTudo(a.tabela, "*", comTenant)).filter((l) => {
      const v = l[a.coluna]
      if (a.lista) { try { return JSON.parse(v ?? "[]").some(ehCdn) } catch { return false } }
      return ehCdn(v)
    })
    const alvo = LIMITE ? linhas.slice(0, LIMITE) : linhas
    let n = 0
    for (const l of alvo) {
      const originais = a.lista ? JSON.parse(l[a.coluna]) : [l[a.coluna]]
      n += originais.filter(ehCdn).length
    }
    total += n
    console.log(`  ${a.tabela}.${a.coluna}: ${n} arquivo(s) em ${alvo.length} linha(s)`)
    if (!APLICAR) continue
    for (const l of alvo) {
      const originais = a.lista ? JSON.parse(l[a.coluna]) : [l[a.coluna]]
      const novos = []
      const enviados = []
      let ok = true
      for (const url of originais) {
        if (!ehCdn(url)) { novos.push(url); continue }
        const { buf, tipo, erro } = await baixar(url)
        if (!buf) { falhas.push(`${a.tabela}.${a.coluna} ${l.id}: ${erro}`); ok = false; novos.push(url); continue }
        const caminho = `${a.pasta(l)}-${randomUUID().slice(0, 8)}.${tipo.ext}`
        const { error } = await db.storage.from("veiculos").upload(caminho, buf, { contentType: tipo.mime })
        if (error) { falhas.push(`${a.tabela}.${a.coluna} ${l.id}: upload ${error.message}`); ok = false; novos.push(url); continue }
        enviados.push(caminho)
        novos.push(caminho)
      }
      if (!enviados.length) continue
      const valor = a.lista ? JSON.stringify(novos) : novos[0]
      const { error } = await db.from(a.tabela).update({ [a.coluna]: valor }).eq("id", l.id)
      if (error) {
        await db.storage.from("veiculos").remove(enviados)
        falhas.push(`${a.tabela}.${a.coluna} ${l.id}: update ${error.message}`)
        continue
      }
      feitos += enviados.length
      if (!ok) console.log(`    parcial em ${l.id}`)
    }
  }
  console.log(`  ${APLICAR ? `migrados ${feitos} de ${total}` : `a migrar: ${total}`}`)
  if (falhas.length) {
    console.log(`  falhas (${falhas.length}) — seguem apontando para o Bubble:`)
    for (const f of falhas.slice(0, 30)) console.log(`    ${f}`)
  }
}

// ── reparo do carimbo de uma rodada anterior ───────────────────────────────

async function repararCarimbo() {
  console.log(`\n▸ REPARAR CARIMBO  (updated_at entre ${REPARAR.de} e ${REPARAR.ate})`)
  for (const parte of PARTES) {
    if (!roda(parte.nome)) continue
    const cols = colunasDe(parte.tabela)
    if (!("updated_at" in cols)) continue
    const modificado = new Map((await bubble(parte.tipo)).map((r) => [r._id, r["Modified Date"]]))
    const linhas = (await lerTudo(parte.tabela, "*", !parte.semTenant)).filter(
      (l) => l.updated_at && l.updated_at >= REPARAR.de && l.updated_at <= REPARAR.ate && l.bubble_id && !l.registrado_por_id
    )
    const alvo = linhas.filter((l) => modificado.get(l.bubble_id))
    console.log(`  ${parte.nome}: ${alvo.length} linha(s)${linhas.length - alvo.length ? ` · ${linhas.length - alvo.length} sem par no Bubble (ficam)` : ""}`)
    if (!APLICAR) continue
    for (const l of alvo) {
      const { error } = await db.from(parte.tabela).update({ updated_at: modificado.get(l.bubble_id) }).eq("id", l.id)
      if (error) throw new Error(`reparo ${parte.tabela} ${l.id}: ${error.message}`)
    }
  }
}

// ── execução ───────────────────────────────────────────────────────────────

try {
  if (DOCUMENTOS) {
    await migrarDocumentos()
  } else {
    if (REPARAR) await repararCarimbo()
    for (const parte of PARTES) if (roda(parte.nome)) await migrarParte(parte)
    if (roda("condutores")) await migrarCondutores()
    console.log(`\n${APLICAR ? "Pronto" : "Dry-run"}: ${resumo.map((r) => `${r.parte} +${r.inserir}/~${r.atualizar}`).join(" · ")}`)
    console.log("Depois: node scripts/migrar-veiculos-bubble.mjs --documentos (arquivos para o bucket).")
  }
} catch (e) {
  console.error(`\nERRO: ${e.message}`)
  process.exit(1)
}
