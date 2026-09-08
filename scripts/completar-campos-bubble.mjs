// ===========================================================================
// completar-campos-bubble.mjs — os campos que vieram OCOS da migração.
//
// Passo 3 da virada da Filiação. A auditoria (scripts/auditar-bubble.mjs)
// listou, tabela a tabela, os campos que estão preenchidos no Bubble e vazios
// aqui em registros que JÁ CASAM. Este script preenche exatamente esses:
//
//   cadastro     filiacoes — complemento do endereço (7.365), admissão e
//                lotação na fonte (6.449 / 2.497), matrícula sindical n°
//                (4.579), e-mail pessoal (767), sexo (566), termos LGPD e de
//                desconto, voto online 2026, condição, endereço, telefones…
//   comprovacoes filiacao_recebe_comprovacao — as 358 vieram só com bubble_id
//   remessas     filiacao_recebe_remessa — empresa contratante (74)
//   prontuario   filiacao_prontuario — pessoa (154), descrição, data, tipo,
//                homologação, hospedagem, atendimento
//   trabalhista  vinculos_trabalhistas — pessoa (602), CIPA (323), e-mail
//   empresa      empresa — trabalhadores representados (53)
//   usuarios     usuarios — vínculo com a instituição, CNH, nascimento…
//   recebe       filiacao_recebe — fonte pagadora (14.164), remessa (8.887),
//                pessoa (88). É a tabela de 610 mil linhas: roda em separado
//                e com heap maior (ver USO).
//
// Regra única: SÓ COLUNA VAZIA é preenchida. Nada que alguém já corrigiu à
// mão é tocado. Referência que não resolve fica vazia e é contada.
// Arquivos (foto do filiado, comprovante da remessa) entram com a URL do
// CDN; trazê-los para o bucket é do migrar-documentos.
//
// Lê o cache de .auditoria-bubble/ (o mesmo da auditoria); sem cache, baixa.
//
// USO:
//   node scripts/completar-campos-bubble.mjs                    (dry-run, tudo menos recebe)
//   node scripts/completar-campos-bubble.mjs --so cadastro,prontuario
//   node scripts/completar-campos-bubble.mjs --apply
//   node --max-old-space-size=6144 scripts/completar-campos-bubble.mjs --so recebe --apply
//
// --desde <ISO>: modo do dia da virada. O n8n foi desligado em 08/09 e o
// Bubble continuou em uso até segunda; o que NASCEU entra pelo delta, mas o
// que MUDOU num registro que já veio (uma desfiliação lançada na quinta, um
// telefone corrigido) ficaria para trás, porque este script só preenche
// coluna vazia. Com --desde, nos registros com Modified Date a partir da
// data, o valor do Bubble MANDA — sobrescreve o daqui quando difere. Vazio
// no Bubble continua não apagando nada.
//   node scripts/completar-campos-bubble.mjs --desde 2026-09-08T20:00:00Z --apply
// ===========================================================================

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs"
import { join } from "node:path"

const args = process.argv.slice(2)
const APLICAR = args.includes("--apply")
const SO = (() => {
  const i = args.indexOf("--so")
  return i >= 0 ? args[i + 1].split(",") : null
})()
const DESDE = (() => {
  const i = args.indexOf("--desde")
  return i >= 0 ? new Date(args[i + 1]) : null
})()
if (DESDE && Number.isNaN(DESDE.getTime())) {
  console.error("--desde precisa de uma data ISO, ex.: 2026-09-08T20:00:00Z")
  process.exit(1)
}
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
if (DESDE) console.log(`Modo --desde: registros alterados no Bubble a partir de ${DESDE.toISOString()} têm o valor do Bubble por cima do daqui.`)

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

async function lerTudo(tabela, colunas, semTenant) {
  const linhas = []
  let filtrar = !semTenant
  for (let de = 0; ; de += 1000) {
    let q = db.from(tabela).select(colunas).order("id", { ascending: true }).range(de, de + 999)
    if (filtrar) q = q.eq("emp_proprietaria_id", TENANT)
    let { data, error } = await q
    if (error && filtrar && /emp_proprietaria_id/.test(error.message)) {
      filtrar = false
      ;({ data, error } = await db.from(tabela).select(colunas).order("id", { ascending: true }).range(de, de + 999))
    }
    if (error) throw new Error(`${tabela}: ${error.message}`)
    linhas.push(...data)
    if (data.length < 1000) break
    if (linhas.length % 100000 === 0) process.stdout.write(".")
  }
  return linhas
}

// resolvedores de referência, um por tabela-alvo, criados sob demanda
const resolvedores = new Map()
async function ref(tipoBubble, tabela, semTenant) {
  const chave = tabela
  if (resolvedores.has(chave)) return resolvedores.get(chave)
  const [b, a] = await Promise.all([bubble(tipoBubble), lerTudo(tabela, "id, bubble_id", semTenant)])
  const idsAqui = new Set(a.map((l) => l.id))
  const porBubble = new Map(a.filter((l) => l.bubble_id).map((l) => [l.bubble_id, l.id]))
  const supaDe = new Map(b.map((r) => [r._id, r.Supabase_id]))
  const f = (idBubble) => {
    if (!idBubble) return null
    const s = supaDe.get(idBubble)
    if (s && idsAqui.has(s)) return s
    return porBubble.get(idBubble) ?? null
  }
  resolvedores.set(chave, f)
  return f
}

const vazio = (v) => v === null || v === undefined || v === "" || (Array.isArray(v) && v.length === 0)
const conv = {
  t: (v) => (typeof v === "string" && v.trim() !== "" ? v.trim() : null),
  d: (v) => (v ? String(v).slice(0, 10) : null),
  ts: (v) => (v ? String(v) : null),
  n: (v) => (typeof v === "number" ? v : v == null || v === "" ? null : Number(v) || null),
  b: (v) => (v === true ? true : null), // só true preenche; false não é dado que falte
  s: (v) => (v == null || v === "" ? null : String(v).trim() || null),
}

// ── o mapa: por tabela, campo do Bubble → [coluna, conversor | ref] ─────────
// ref: { tipo: "<tipo do Bubble>", tabela: "<tabela daqui>", semTenant? }

const R = {
  filiado: { tipo: "filiação", tabela: "filiacoes" },
  empresa: { tipo: "empresa", tabela: "empresa", semTenant: true },
  remessa: { tipo: "filiaçãoreceberemessa", tabela: "filiacao_recebe_remessa" },
  homologacao: { tipo: "jurídico-homologações", tabela: "juridico_homologacoes" },
  cupom: { tipo: "hospedagemcupom", tabela: "hospedagem_cupom" },
  atendimento: { tipo: "saúdeatendimentos", tabela: "saude_atendimentos" },
  usuario: { tipo: "user", tabela: "usuarios" },
  lgpd: { tipo: "filiaçãotllgpd", tabela: "filiacao_tl_lgpd" },
  desconto: { tipo: "filiaçãotldesconto", tabela: "filiacao_tl_desconto" },
}

const PARTES = {
  cadastro: {
    tipo: "filiação",
    tabela: "filiacoes",
    campos: {
      "Endereço Complemento": ["endereco_complemento", "t"],
      "Endereço Logradouro": ["endereco_logradouro", "t"],
      "Endereço Número": ["endereco_numero", "t"],
      "Endereço Bairro": ["endereco_bairro", "t"],
      "Endereço Cidade": ["endereco_cidade", "t"],
      "Endereço Estado": ["endereco_estado", "t"],
      "Endereço CEP": ["endereco_cep", "t"],
      "FONTE PG admissão": ["filiacao_fonte_pg_admissao", "d"],
      "FONTE PG Lotação": ["filiacao_lotacao", "t"],
      "Matrícula sindical n°": ["matricula_sindical_numero", "n"],
      "Matrícula sindical": ["matricula_sindical", "s"],
      "Email pessoal": ["email_pessoal", "t"],
      "Email corporativo": ["email_corporativo", "t"],
      "SEXO": ["sexo", "t"],
      "Telefone 1": ["telefone_1", "t"],
      "Telefone 2": ["telefone_2", "t"],
      "Telefone 1 whatsapp?": ["telefone_1_whatsapp", "b"],
      "Telefone 2 whatsapp?": ["telefone_2_whatsapp", "b"],
      "TL LGPD": ["tl_lgpd_id", R.lgpd],
      "TL LGPD data": ["tl_lgpd_data", "d"],
      "TL Desconto": ["tl_desconto_id", R.desconto],
      "TL Desconto data": ["tl_desconto_data", "d"],
      "votoonline2026": ["votoonline2026", "b"],
      "FILIAÇÃO CONDIÇÃO": ["filiacao_condicao", "t"],
      "Outra filiação desfiliar?": ["outra_filiacao_desfiliar", "b"],
      "Outra filiação Entidade": ["outra_filiacao_entidade", "t"],
      "Nome social": ["nome_social", "t"],
      "Nome completo": ["nome_completo", "t"],
      "CPF": ["cpf", "s"],
      "Nascimento data": ["nascimento_data", "d"],
      "Código de verificação": ["codigo_verificacao", "t"],
      "Foto": ["foto", "t"],
      "USUÁRIO": ["usuario_id", R.usuario],
    },
  },
  comprovacoes: {
    tipo: "filiaçãorecebecomprovação",
    tabela: "filiacao_recebe_comprovacao",
    campos: {
      "Data": ["data", "d"],
      "Valor": ["valor", "n"],
      "Comprovante": ["comprovante", "t"],
      "FONTE PG": ["fonte_pg_id", R.empresa],
      "REMESSA": ["remessa_id", R.remessa],
    },
  },
  remessas: {
    tipo: "filiaçãoreceberemessa",
    tabela: "filiacao_recebe_remessa",
    campos: { "EMP CONTRATANTE": ["emp_contratante_id", R.empresa] },
  },
  prontuario: {
    tipo: "filiaçãoprontuário",
    tabela: "filiacao_prontuario",
    campos: {
      "FILIAÇÃO": ["filiacao_id", R.filiado],
      "Descrição": ["descricao", "t"],
      "Data": ["data", "ts"],
      "Tipo": ["tipo", "t"],
      "HOMOLOGAÇÃO": ["homologacao_id", R.homologacao],
      "HOSPEDAGEM": ["hospedagem_id", R.cupom],
      "ATENDIMENTO": ["atendimento_id", R.atendimento],
      "DIRETOR/FUNCIONARIO": ["diretor_funcionario_id", R.usuario],
    },
  },
  trabalhista: {
    tipo: "vínculotrabalhista",
    tabela: "vinculos_trabalhistas",
    campos: {
      "FILIADO": ["filiado_id", R.filiado],
      "CIPA ou CIPLAT?": ["cipa_ou_ciplat", "b"],
      "Email corporativo": ["email_corporativo", "t"],
      "Matrícula": ["matricula", "s"],
      "Cargo": ["cargo", "t"],
      "Lotação": ["lotacao", "t"],
      "Regime de trabalho": ["regime_trabalho", "t"],
    },
  },
  empresa: {
    tipo: "empresa",
    tabela: "empresa",
    semTenant: true,
    campos: {
      "Trabalhadores representados pelo NF?": ["trabalhadores_rep_nf", "b"],
      "Inativa?": ["inativa", "b"],
      "Quantidade trabalhadores": ["quantidade_trabalhadores", "n"],
    },
  },
  usuarios: {
    tipo: "user",
    tabela: "usuarios",
    campos: {
      "Vínculo instituição OS": ["vinculo_instituicao_os", "t"],
      "Vínculo instituição": ["vinculo_instituicao", "t"],
      "Foto": ["foto", "t"],
      "CNH autorizado?": ["cnh_autorizado", "b"],
      "Nascimento data": ["nascimento_data", "d"],
      "Whatsapp": ["whatsapp", "t"],
      "Nome completo": ["nome_completo", "t"],
      "Nome guerra": ["nome_guerra", "t"],
    },
  },
  recebe: {
    tipo: "filiaçãorecebe",
    tabela: "filiacao_recebe",
    pesado: true,
    campos: {
      "FONTE PG": ["fonte_pg_id", R.empresa],
      "REMESSA": ["remessa_id", R.remessa],
      "FILIADO": ["filiado_id", R.filiado],
      "Matrícula sindical": ["matricula_sindical", "s"],
      "CPF": ["cpf", "s"],
    },
  },
}

// ── o trabalho ─────────────────────────────────────────────────────────────

const roda = (nome, parte) => (SO ? SO.includes(nome) : !parte.pesado)
const totalGeral = { linhas: 0, campos: 0 }

for (const [nome, parte] of Object.entries(PARTES)) {
  if (!roda(nome, parte)) continue
  console.log(`\n▸ ${nome.toUpperCase()}  (${parte.tipo} → ${parte.tabela})`)
  const colunas = Object.values(parte.campos).map(([c]) => c)
  const [registros, linhas] = await Promise.all([
    bubble(parte.tipo),
    lerTudo(parte.tabela, ["id", "bubble_id", ...colunas].join(", "), parte.semTenant),
  ])
  console.log(`  Bubble ${registros.length} · aqui ${linhas.length}`)

  // resolvedores que esta parte precisa
  const refs = new Map()
  for (const [rotulo, [, como]] of Object.entries(parte.campos)) {
    if (typeof como === "object") refs.set(rotulo, await ref(como.tipo, como.tabela, como.semTenant))
  }

  const porId = new Map(linhas.map((l) => [l.id, l]))
  const porBubble = new Map(linhas.filter((l) => l.bubble_id).map((l) => [l.bubble_id, l]))
  const patches = [] // { id, patch }
  const porCampo = Object.fromEntries(colunas.map((c) => [c, 0]))
  const semRef = Object.fromEntries(colunas.map((c) => [c, 0]))
  let alterados = 0

  for (const r of registros) {
    const linha = (r.Supabase_id && porId.get(r.Supabase_id)) || porBubble.get(r._id) || null
    if (!linha) continue
    // Alterado no Bubble depois do desligamento: o Bubble manda.
    const manda = DESDE && r["Modified Date"] && new Date(r["Modified Date"]) >= DESDE
    if (manda) alterados++
    const patch = {}
    for (const [rotulo, [coluna, como]] of Object.entries(parte.campos)) {
      // Booleano com default false conta como vazio: "false" ali é ausência
      // da migração, não uma escolha de alguém.
      const ocupada = como === "b" ? linha[coluna] === true : !vazio(linha[coluna])
      if (ocupada && !manda) continue
      const bruto = r[rotulo]
      if (vazio(bruto)) continue
      let valor
      if (typeof como === "object") {
        valor = refs.get(rotulo)(bruto)
        if (!valor) { semRef[coluna]++; continue }
      } else valor = conv[como](bruto)
      if (valor === null || valor === undefined) continue
      if (ocupada && valor === linha[coluna]) continue // já igual
      patch[coluna] = valor
      porCampo[coluna]++
    }
    if (Object.keys(patch).length) patches.push({ id: linha.id, patch })
  }

  for (const [c, n] of Object.entries(porCampo).sort((a, b) => b[1] - a[1])) {
    if (n || semRef[c]) console.log(`  ${String(n).padStart(7)}  ${c}${semRef[c] ? `   (${semRef[c]} referência(s) sem resolver)` : ""}`)
  }
  console.log(`  linhas a tocar: ${patches.length}${DESDE ? ` · alterados no Bubble desde a data: ${alterados}` : ""}`)
  totalGeral.linhas += patches.length
  totalGeral.campos += Object.values(porCampo).reduce((a, b) => a + b, 0)

  if (!APLICAR || patches.length === 0) continue

  // Agrupa patches idênticos para atualizar em lote; o resto vai um a um.
  let n = 0
  const porAssinatura = new Map()
  for (const p of patches) {
    const k = JSON.stringify(p.patch)
    const l = porAssinatura.get(k) ?? []
    l.push(p.id)
    porAssinatura.set(k, l)
  }
  for (const [k, ids] of porAssinatura) {
    const patch = JSON.parse(k)
    for (let de = 0; de < ids.length; de += 200) {
      const lote = ids.slice(de, de + 200)
      const { error } = await db.from(parte.tabela).update(patch).in("id", lote)
      if (error) {
        console.error(`\nFalhou em ${parte.tabela}: ${error.message}\nFeitas até aqui: ${n}.`)
        process.exit(1)
      }
      n += lote.length
      if (n % 2000 < 200) process.stdout.write(".")
    }
  }
  console.log(`\n  gravadas ${n} linhas`)
}

console.log(`\n${APLICAR ? "Pronto" : "Dry-run"}: ${totalGeral.linhas} linhas, ${totalGeral.campos} campos${SO ? "" : " (recebe fica para --so recebe, com heap maior)"}.`)
