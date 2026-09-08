// ===========================================================================
// auditar-bubble.mjs — o que existe no Bubble e NÃO chegou ao Supabase.
//
// Compara, tipo a tipo, o banco do Bubble (via Data API) com a tabela
// correspondente aqui. Para cada par responde três perguntas:
//
//   1. REGISTROS: quantos há lá, quantos cá, quantos casam, quantos só existem
//      de um lado (e de que ano são — criado depois da migração é sincronia
//      que não roda; criado antes é registro que a migração perdeu).
//   2. CAMPOS: para cada campo do Bubble, quantos registros CASADOS o têm
//      preenchido lá e vazio aqui. Esse número é a lacuna a re-migrar.
//   3. MODELO: quais campos do Bubble não têm coluna nenhuma aqui, e quais
//      tipos do Bubble não têm tabela nenhuma. Não é lacuna de dado, é lacuna
//      de modelo — precisa de decisão, não de script.
//
// O Bubble OMITE campo vazio na resposta, então "preenchido lá" é "a chave
// veio". Um registro só não revela o schema; o schema vem de /meta.
//
// NÃO GRAVA NADA. Lê os dois lados, guarda o que baixou do Bubble em cache
// (baixar 600 mil linhas de recebimento leva minutos) e imprime o relatório.
//
// USO:
//   node scripts/auditar-bubble.mjs                       (todos os pares)
//   node scripts/auditar-bubble.mjs --so filiação,empresa (só alguns)
//   node scripts/auditar-bubble.mjs --sem-cache           (rebaixa do Bubble)
//   node scripts/auditar-bubble.mjs --json saida.json     (detalhe p/ backfill)
// ===========================================================================

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs"
import { join } from "node:path"

const args = process.argv.slice(2)
const arg = (nome) => {
  const i = args.indexOf(nome)
  return i >= 0 ? args[i + 1] : null
}
const SO = arg("--so")?.split(",").map((s) => s.trim()) ?? null
const SEM_CACHE = args.includes("--sem-cache")
const JSON_SAIDA = arg("--json")
const CACHE = arg("--cache") ?? ".auditoria-bubble"

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

// ── os pares ───────────────────────────────────────────────────────────────
//
// `campos` mapeia o rótulo do campo no Bubble (o `display` do /meta) para a
// coluna aqui. `null` = não há coluna (lacuna de MODELO). Campo do Bubble que
// não aparece no mapa é casado por nome normalizado; se nem assim casar, entra
// no relatório como "sem coluna". Campos-lista (list.custom.*) são relações
// inversas e são ignorados: o dado mora do outro lado.
//
// `filtroAqui` restringe a leitura do Supabase ao tenant quando a tabela tem
// a coluna; tabelas sem `emp_proprietaria_id` são lidas inteiras.

const PARES = [
  {
    tipo: "filiação",
    tabela: "filiacoes",
    campos: {
      "Nascimento mes": "nascimento_mes",
      "Matrícula sindical n°": "matricula_sindical_numero",
      "FONTE PG Lotação": "filiacao_lotacao",
      "FONTE PG admissão": "filiacao_fonte_pg_admissao",
      "Outra filiação solicitação desfiliação": "outra_filiacao_solicitacao",
      "TL LGPD": "tl_lgpd_id",
      "TL Desconto": "tl_desconto_id",
      "SINDICATO": "sindicato_id",
      "USUÁRIO": "usuario_id",
      "FILIAÇÃO CONDIÇÃO": "filiacao_condicao",
      "FILIAÇÃO COLETIVA": "filiacao_coletiva_id",
      // Modelados no VÍNCULO, não no cadastro — conferidos lá.
      "Filiação data adesão": "@filiacao_vinculos.data_filiacao",
      "Filiação data saída": "@filiacao_vinculos.data_desfiliacao",
      "Filiação Ficha de filiação": "@filiacao_vinculos.ficha_filiacao",
      "Filiação Desfiliação carta": "@filiacao_vinculos.carta_desfiliacao",
      "FONTE PG": "@filiacao_vinculos.fonte_pagadora_id",
      "FONTE PG cargo": "@filiacao_vinculos.cargo",
      "FONTE PG demissão": "@filiacao_vinculos.data_saida_demissao",
      "FONTE PG matrícula": "@filiacao_vinculos.matricula",
      "FONTE PG Offshore?": null,
      "FILIAÇÃO CONDIÇÃO FONTE": null,
      "Filiação DESFILIAÇÃO OFÍCIO": null,
      "FILIACAO VINCULADA": "@filiacao_vinculos.filiacao_vinculada_id",
      "FILIACAO VINCULADA - TIPO": "@filiacao_vinculos.filiacao_vinculada_tipo",
      "QR Code verificação": null,
      "Código de verificação": "codigo_verificacao",
    },
  },
  {
    tipo: "filiaçãovínculos",
    tabela: "filiacao_vinculos",
    campos: {
      "Data de saída_demissao": "data_saida_demissao",
      "Data de entrada_admissao": "data_entrada_admissao",
      "FILIAÇÃO VINCULADA": "filiacao_vinculada_id",
      "FILIAÇÃO VINCULADA Tipo": "filiacao_vinculada_tipo",
      "FILIADO": "filiado_id",
      "FONTE PAGADORA": "fonte_pagadora_id",
      "Lotação offshore?": null,
      "Data de filiação": "data_filiacao",
      "Data de desfiliação": "data_desfiliacao",
      "Ficha de filiação": "ficha_filiacao",
      "Ficha de filiação aceita?": "ficha_filiacao_aceita",
      "Carta de desfiliação": "carta_desfiliacao",
      "Carta de desfiliação aceita?": "carta_desfiliacao_aceita",
    },
  },
  {
    tipo: "vínculotrabalhista",
    tabela: "vinculos_trabalhistas",
    campos: {
      "Contrato de trabalho admissão": "contrato_admissao",
      "Contrato de trabalho demissão": "contrato_demissao",
      "Contrato de trabalho": "contrato_trabalho",
      "Contrato de trabalho tipo": null,
      "CBO número": "cbo_numero",
      "CIPA ou CIPLAT?": "cipa_ou_ciplat",
      "EMPREGADOR": "empregador_id",
      "ENDEREÇO": "endereco_id",
      "FILIADO": "filiado_id",
      "TRABALHADOR": "trabalhador_id",
      "Regime de trabalho OS": "regime_trabalho_os",
      "Regime de trabalho": "regime_trabalho",
    },
  },
  {
    tipo: "filiaçãorecebe",
    tabela: "filiacao_recebe",
    campos: {
      "FONTE PG": "fonte_pg_id",
      "FILIADO": "filiado_id",
      "REMESSA": "remessa_id",
      "FONTE PG matrícula": "fonte_pg_matricula",
    },
  },
  {
    tipo: "filiaçãoreceberemessa",
    tabela: "filiacao_recebe_remessa",
    campos: { "EMP CONTRATANTE": "emp_contratante_id", "Aberto?": "aberto" },
  },
  {
    tipo: "filiaçãorecebecomprovação",
    tabela: "filiacao_recebe_comprovacao",
    campos: { "FONTE PG": "fonte_pg_id", "REMESSA": "remessa_id" },
  },
  { tipo: "filiaçãoremessatipo", tabela: null },
  {
    tipo: "filiaçãoregistro",
    tabela: "filiacao_registro",
    campos: {
      "CONDICAO SINDICAL": "condicao_sindical",
      "ENDERECO": "endereco_id",
      "SINDICATO CONTRANTANTE": "sindicato_id",
      "Matricula sindical#number": "matricula_sindical_n",
      "Matricula sindical#text": "matricula_sindical",
    },
  },
  {
    tipo: "filiaçãoprontuário",
    tabela: "filiacao_prontuario",
    campos: {
      "ATENDIMENTO": "atendimento_id",
      "CIPA": null,
      "DIRETOR/FUNCIONARIO": "diretor_funcionario_id",
      "FILIAÇÃO COLETIVA": null,
      "FILIAÇÃO": "filiacao_id",
      "HOMOLOGAÇÃO": "homologacao_id",
      "HOSPEDAGEM": "hospedagem_id",
    },
  },
  {
    tipo: "filiaçãoconvênio",
    tabela: "filiacao_convenios",
    campos: {
      "CATEGORIA": "categoria_id",
      "CONVENIADOR": "conveniador_id",
      "SINDICATO": "sindicato_id",
      "Ativo?": "ativo",
    },
  },
  { tipo: "filiaçãoconvênioscategorias", tabela: null },
  { tipo: "filiaçãoconvêniounidades", tabela: null },
  { tipo: "filiaçãoreembolso", tabela: null },
  { tipo: "filiaçãoreembolsoconfig", tabela: null },
  {
    tipo: "filiaçãotldesconto",
    tabela: "filiacao_tl_desconto",
    campos: { "Em vigor?": "em_vigor" },
  },
  {
    tipo: "filiaçãotllgpd",
    tabela: "filiacao_tl_lgpd",
    campos: { "Em vigor?": "em_vigor" },
  },
  { tipo: "filiaçãocoletiva", tabela: null, nota: "a filiacao_coletiva daqui é nova, sem bubble_id" },
  {
    tipo: "filreembhospedagem",
    tabela: "fil_reemb_hospedagem",
    campos: {
      "Embarque?": "embarque",
      "Cancelado?": "cancelado",
      "Avaliação aprovado?": null,
      "Avaliação Avaliador": null,
      "Avaliação Data": null,
      "Avaliação observação": null,
      "ARQ Comprovante de embarque": null,
      "Embarque/Desemb Data?": null,
      "FILIAÇÃO": null,
      "ARQ Nota fiscal hospedagem": null,
      "ORDEM DE PAGAMENTO": null,
      "SINDICATO": null,
    },
  },
  {
    tipo: "empresa",
    tabela: "empresa",
    semTenant: true,
    campos: {
      "É beneficiário de ajuda?": "beneficiario_ajuda",
      "É conveniador?": "conveniador",
      "Inativa?": "inativa",
      "É fundo de pensão?": "fundo_pensao",
      "É Pessoa jurídica?": "pessoa_juridica",
      "É fornecedor?": null,
      "CATEGORIA": null,
      "FORNECIMENTO TIPO": null,
      "Nome fantasia_Nome completo ": "nome_fantasia",
      "Trabalhadores representados pelo NF?": "trabalhadores_rep_nf",
    },
  },
  {
    tipo: "endereços",
    tabela: "enderecos",
    campos: {
      "É favorito?": "favorito",
      "EMPRESA": "empresa_id",
      "FILIADO": "filiado_id",
      "USUÁRIO": "usuario_id",
      "Nome do endereço": "nome_endereco",
      "Tipo de endereço": "tipo_endereco",
    },
  },
  {
    tipo: "telefones",
    tabela: "telefones",
    campos: {
      "É favorito?": "favorito",
      "FILIADO": "filiado_id",
      "USUÁRIO": "usuario_id",
      "EMPRESA": null,
      "PRESTADOR DE SERVIÇO": null,
      "Pessoa de contato": null,
      "Telefone": "numero",
      "Tipo de contato": "tipo",
      "Whatsapp?": "whatsapp",
    },
  },
  {
    tipo: "emails",
    tabela: "emails",
    campos: {
      "É favorito?": "favorito",
      "FILIADO": "filiado_id",
      "USUÁRIO": "usuario_id",
      "Pessoa de contato": "pessoa_contato",
      "Tipo de email": "tipo_email",
    },
  },
  {
    // O login do filiado (usuario_id em filiacoes). É de Institucional, mas
    // a área do filiado depende dele.
    tipo: "user",
    tabela: "usuarios",
    campos: {
      "Filiada(o)?": "filiado",
      "CNH autorizado?": "cnh_autorizado",
      "CNH": null,
      "CPF arquivo do documento": "cpf_arquivo",
      "Deletado?": "deletado",
      "Inativo?": "inativo",
      "Empresa - email": "email_empresa",
      "Empresa - matrícula": "empresa_matricula",
      "Empresa - verificado?": null,
      "EMPRESA": null,
      "EMPRESA PRESTADORA": null,
      "Empresa_vínculo": null,
      "Nascimento mês": "nascimento_mes",
      "Autoriza receber notificações?": "autoriza_notificacoes",
      "PERMISSÕES": null,
      "SEXO": "sexo",
      "Sexo": null,
      "SINDICATO": "sindicato_id",
      "Vínculo instituição OS": "vinculo_instituicao_os",
      "Vínculo instituição": "vinculo_instituicao",
    },
  },
  {
    tipo: "dadosbancários",
    tabela: "dados_bancarios",
    semTenant: true,
    campos: {
      "Agência": "agencia",
      "Banco código": null,
      "Beneficiário CNPJ - CPF": "favorecido",
      "Conta corrente?": "tipo_conta",
      "Tipo dos dados bancários": null,
      "FILIADO": null,
      "EMPRESA": "fornecedor_id",
      "USUÁRIO": "usuario_id",
      "PRESTADOR DE SERVIÇO": null,
      "Pix chave": "pix",
      "Pix beneficiário nome": null,
      "Pix tipo": null,
      "Prefere pix?": null,
      "É favorito?": null,
    },
  },
]

// ── utilidades ─────────────────────────────────────────────────────────────

// "Data de filiação" → data_filiacao: as colunas daqui pulam a preposição.
const SEM_PREPOSICAO = (s) => s.replace(/\b(de|da|do|das|dos|e)\b/gi, " ")
const normalizar = (s) =>
  String(s)
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[?°]/g, "")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")

// Nem toda tabela tem emp_proprietaria_id (filiacao_registro, dados_bancarios,
// filiacao_convenios…): quando a coluna não existe, lê-se a tabela inteira.
async function lerTudo(tabela, semTenant) {
  const linhas = []
  let filtrar = !semTenant
  for (let de = 0; ; de += 1000) {
    let q = db.from(tabela).select("*").order("id", { ascending: true }).range(de, de + 999)
    if (filtrar) q = q.eq("emp_proprietaria_id", TENANT)
    let { data, error } = await q
    if (error && filtrar && /emp_proprietaria_id/.test(error.message)) {
      filtrar = false
      ;({ data, error } = await db.from(tabela).select("*").order("id", { ascending: true }).range(de, de + 999))
    }
    if (error) throw new Error(`${tabela}: ${error.message}`)
    linhas.push(...data)
    if (data.length < 1000) break
  }
  return linhas
}

async function bubbleTudo(tipo) {
  mkdirSync(CACHE, { recursive: true })
  const arquivo = join(CACHE, normalizar(tipo) + ".json")
  if (!SEM_CACHE && existsSync(arquivo)) {
    return JSON.parse(readFileSync(arquivo, "utf8"))
  }
  // O cursor do Bubble para em 50.000. Acima disso a leitura vai em JANELAS:
  // ordena por Created Date, lê até o teto e recomeça com "Created Date maior
  // que o último visto" (menos 1 ms, para não perder empate de timestamp — a
  // dedupe por _id descarta o que vier repetido).
  const TETO = 49_900
  const linhas = []
  const vistos = new Set()
  let desde = null
  for (;;) {
    let cursor = 0
    let ultimo = null
    let acabou = false
    for (;;) {
      const params = new URLSearchParams({
        limit: "100",
        cursor: String(cursor),
        sort_field: "Created Date",
        descending: "false",
      })
      if (desde) {
        params.set(
          "constraints",
          JSON.stringify([{ key: "Created Date", constraint_type: "greater than", value: desde }])
        )
      }
      const r = await fetch(`${BASE}/obj/${encodeURIComponent(tipo)}?${params}`, {
        headers: { Authorization: `Bearer ${TOKEN}` },
      })
      if (r.status === 404) return null
      if (r.status !== 200) {
        throw new Error(`Bubble ${tipo} em ${cursor}: ${r.status} ${(await r.text()).slice(0, 120)}`)
      }
      const j = await r.json()
      const res = j.response?.results ?? []
      for (const item of res) {
        if (!vistos.has(item._id)) {
          vistos.add(item._id)
          linhas.push(item)
        }
        ultimo = item["Created Date"] ?? ultimo
      }
      cursor += res.length
      if (linhas.length % 10000 < 100) process.stdout.write(".")
      if (res.length === 0 || (j.response?.remaining ?? 0) === 0) {
        acabou = true
        break
      }
      if (cursor >= TETO) break
    }
    if (acabou || !ultimo) break
    desde = new Date(new Date(ultimo).getTime() - 1).toISOString()
  }
  writeFileSync(arquivo, JSON.stringify(linhas))
  return linhas
}

const preenchidoBubble = (v) =>
  v !== undefined &&
  v !== null &&
  !(typeof v === "string" && v.trim() === "") &&
  !(Array.isArray(v) && v.length === 0)
const preenchidoAqui = (v) =>
  v !== undefined &&
  v !== null &&
  !(typeof v === "string" && v.trim() === "") &&
  !(Array.isArray(v) && v.length === 0)
const ehBubbleCdn = (v) =>
  typeof v === "string" && /bubble\.io|amazonaws|cdn\.bubble/i.test(v)
const ano = (d) => (d ? String(d).slice(0, 4) : "?")

// ── os dois schemas ────────────────────────────────────────────────────────
const metaRes = await fetch(`${BASE}/meta`, { headers: { Authorization: `Bearer ${TOKEN}` } })
const meta = (await metaRes.json()).types ?? {}

// As colunas de cada tabela saem do OpenAPI do PostgREST. Ler da primeira
// linha não serve: tabela vazia no tenant fazia todo campo parecer inexistente.
const SUPA_URL = env.NEXT_PUBLIC_SUPABASE_URL || env.SUPABASE_URL
const SUPA_KEY = env.SUPABASE_SERVICE_ROLE_KEY
const openapi = await (
  await fetch(`${SUPA_URL}/rest/v1/`, { headers: { apikey: SUPA_KEY, Authorization: `Bearer ${SUPA_KEY}` } })
).json()
const colunasDe = (tabela) => new Set(Object.keys(openapi.definitions?.[tabela]?.properties ?? {}))

// ── a auditoria ────────────────────────────────────────────────────────────
const relatorio = []

for (const par of PARES) {
  if (SO && !SO.includes(par.tipo) && !SO.includes(par.tabela ?? "")) continue
  const def = meta[par.tipo]
  console.log(`\n${"═".repeat(78)}\n${par.tipo}  →  ${par.tabela ?? "(SEM TABELA AQUI)"}`)
  if (!def) {
    console.log("  tipo não exposto no /meta")
    continue
  }

  process.stdout.write("  lendo o Bubble")
  const bubble = await bubbleTudo(par.tipo)
  console.log(` ${bubble?.length ?? "?"} registros`)
  if (!bubble) continue

  if (!par.tabela) {
    const porAno = new Map()
    for (const b of bubble) porAno.set(ano(b["Created Date"]), (porAno.get(ano(b["Created Date"])) ?? 0) + 1)
    console.log(`  ⚠ ${bubble.length} registro(s) no Bubble e NENHUMA tabela aqui${par.nota ? " — " + par.nota : ""}`)
    console.log(`    por ano: ${[...porAno].sort().map(([a, n]) => `${a}:${n}`).join("  ")}`)
    relatorio.push({ tipo: par.tipo, tabela: null, bubble: bubble.length, semTabela: true })
    continue
  }

  process.stdout.write("  lendo o Supabase")
  const aqui = await lerTudo(par.tabela, par.semTenant)
  console.log(` ${aqui.length} linhas`)

  // casamento
  const porId = new Map(aqui.map((a) => [a.id, a]))
  const porBubbleId = new Map(aqui.filter((a) => a.bubble_id).map((a) => [a.bubble_id, a]))
  const casados = []
  const soBubble = []
  const idsCasados = new Set()
  for (const b of bubble) {
    const a = (b.Supabase_id && porId.get(b.Supabase_id)) || porBubbleId.get(b._id) || null
    if (a) {
      casados.push([b, a])
      idsCasados.add(a.id)
    } else soBubble.push(b)
  }
  const soAqui = aqui.filter((a) => !idsCasados.has(a.id))
  const soAquiDoBubble = soAqui.filter((a) => a.bubble_id).length

  const anosSoBubble = new Map()
  for (const b of soBubble) anosSoBubble.set(ano(b["Created Date"]), (anosSoBubble.get(ano(b["Created Date"])) ?? 0) + 1)

  console.log(`\n  REGISTROS  Bubble ${bubble.length} | aqui ${aqui.length} | casam ${casados.length}`)
  if (soBubble.length) {
    console.log(`    só no Bubble: ${soBubble.length}  (${[...anosSoBubble].sort().map(([a, n]) => `${a}:${n}`).join("  ")})`)
  }
  if (soAqui.length) {
    console.log(`    só aqui: ${soAqui.length}${soAquiDoBubble ? `  (${soAquiDoBubble} com bubble_id que não existe mais lá)` : "  (criados no Confluir)"}`)
  }

  // campos
  const colunas = colunasDe(par.tabela)
  const colunasNorm = new Map([...colunas].map((c) => [normalizar(c), c]))
  const IGNORAR = new Set(["Created Date", "Modified Date", "Created By", "unique ID", "Supabase_id", "Slug"])
  const linhasCampo = []
  const contagemDisplay = new Map()
  for (const f of def.fields) contagemDisplay.set(f.display, (contagemDisplay.get(f.display) ?? 0) + 1)

  for (const f of def.fields) {
    if (IGNORAR.has(f.display)) continue
    if (f.type.startsWith("list.")) continue
    // display repetido (ex.: duas "Matricula sindical") → chave com o tipo
    const chave = contagemDisplay.get(f.display) > 1 ? `${f.display}#${f.type}` : f.display
    let coluna
    if (chave in (par.campos ?? {})) coluna = par.campos[chave]
    else if (f.display in (par.campos ?? {})) coluna = par.campos[f.display]
    else
      coluna =
        colunasNorm.get(normalizar(f.display)) ??
        colunasNorm.get(normalizar(SEM_PREPOSICAO(f.display))) ??
        undefined

    const valorB = (b) => b[f.id] ?? b[f.display]
    const cheioLa = (b) =>
      f.type === "boolean" ? valorB(b) === true : preenchidoBubble(valorB(b))
    const preenchidosLa = casados.filter(([b]) => cheioLa(b)).length

    if (coluna === undefined) {
      linhasCampo.push({ campo: f.display, tipo: f.type, coluna: null, la: preenchidosLa, aqui: null, falta: null, situacao: "SEM COLUNA (não mapeado)" })
      continue
    }
    if (coluna === null) {
      linhasCampo.push({ campo: f.display, tipo: f.type, coluna: null, la: preenchidosLa, aqui: null, falta: null, situacao: "SEM COLUNA (modelo)" })
      continue
    }
    if (String(coluna).startsWith("@")) {
      linhasCampo.push({ campo: f.display, tipo: f.type, coluna, la: preenchidosLa, aqui: null, falta: null, situacao: "modelado em outra tabela" })
      continue
    }
    if (!colunas.has(coluna)) {
      linhasCampo.push({ campo: f.display, tipo: f.type, coluna, la: preenchidosLa, aqui: null, falta: null, situacao: "COLUNA NÃO EXISTE" })
      continue
    }
    let aquiCheio = 0
    let falta = 0
    let cdn = 0
    for (const [b, a] of casados) {
      const la = cheioLa(b)
      const ca = f.type === "boolean" ? a[coluna] === true : preenchidoAqui(a[coluna])
      if (ca) aquiCheio++
      if (la && !ca) falta++
      if (f.type === "file" || f.type === "image") if (ehBubbleCdn(a[coluna])) cdn++
    }
    linhasCampo.push({ campo: f.display, tipo: f.type, coluna, la: preenchidosLa, aqui: aquiCheio, falta, cdn, situacao: falta > 0 ? "FALTA" : "ok" })
  }

  const comFalta = linhasCampo.filter((l) => l.situacao === "FALTA").sort((a, b) => b.falta - a.falta)
  const semColuna = linhasCampo.filter((l) => l.situacao.startsWith("SEM COLUNA") || l.situacao === "COLUNA NÃO EXISTE")
  const outraTabela = linhasCampo.filter((l) => l.situacao === "modelado em outra tabela")
  const ok = linhasCampo.filter((l) => l.situacao === "ok")

  if (comFalta.length) {
    console.log(`\n  CAMPOS COM DADO LÁ E VAZIO AQUI (entre os ${casados.length} casados):`)
    for (const l of comFalta) {
      console.log(`    ${String(l.falta).padStart(7)}  ${l.campo.padEnd(40)} → ${l.coluna.padEnd(28)} (lá ${l.la}, aqui ${l.aqui})${l.cdn ? `  · ${l.cdn} ainda no CDN` : ""}`)
    }
  }
  if (semColuna.length) {
    console.log(`\n  CAMPOS SEM COLUNA AQUI:`)
    for (const l of semColuna.sort((a, b) => b.la - a.la)) {
      console.log(`    ${String(l.la).padStart(7)}  ${l.campo.padEnd(40)} ${l.tipo.padEnd(30)} ${l.situacao}`)
    }
  }
  if (outraTabela.length) {
    console.log(`\n  modelados em outra tabela (conferidos no par dela): ${outraTabela.map((l) => l.campo).join(", ")}`)
  }
  console.log(`\n  campos ok: ${ok.length}${ok.some((l) => l.cdn) ? `  · arquivos ainda no CDN: ${ok.filter((l) => l.cdn).map((l) => `${l.campo}=${l.cdn}`).join(", ")}` : ""}`)

  relatorio.push({
    tipo: par.tipo,
    tabela: par.tabela,
    bubble: bubble.length,
    aqui: aqui.length,
    casados: casados.length,
    soBubble: soBubble.length,
    soBubblePorAno: Object.fromEntries(anosSoBubble),
    soAqui: soAqui.length,
    campos: linhasCampo,
  })
}

if (JSON_SAIDA) {
  writeFileSync(JSON_SAIDA, JSON.stringify(relatorio, null, 1))
  console.log(`\nDetalhe salvo em ${JSON_SAIDA}`)
}
