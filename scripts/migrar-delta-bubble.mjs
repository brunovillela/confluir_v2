// ===========================================================================
// migrar-delta-bubble.mjs — o que nasceu no Bubble e a sincronização não trouxe.
//
// Passo 6 da virada da Filiação. Alguns tipos do Bubble ficaram fora da
// sincronização (n8n): tudo que foi criado neles em 2026 só existe lá. Este
// script insere o que falta, na ordem em que as referências exigem:
//
//   remessas      filiaçãoreceberemessa → filiacao_recebe_remessa   (17)
//   recebe        filiaçãorecebe → filiacao_recebe                  (≈112 mil)
//   comprovacoes  filiaçãorecebecomprovação → filiacao_recebe_comprovacao (37)
//   prontuario    filiaçãoprontuário → filiacao_prontuario          (960)
//   trabalhista   vínculotrabalhista → vinculos_trabalhistas         (526)
//   usuarios      user → usuarios                                    (5)
//   cadastros     filiação → filiacoes — só quem tem condição e não é
//                 Inativo (≈23 de 1.695; o resto é descarte, contado)
//
// Os demais tipos (vínculos de filiação, reembolsos, convênios, dados
// bancários, contatos) já têm script próprio e idempotente: rodar de novo
// com o cache renovado traz o que apareceu desde a última vez.
//
// RODAR DEPOIS DE CONGELAR O BUBBLE, com o cache renovado:
//   Remove-Item .auditoria-bubble\*.json     (PowerShell)
// Sem isso, o script vê o Bubble de quando o cache foi baixado.
//
// Só insere: registro que já casa (Supabase_id ou bubble_id) não é tocado.
// Referência que não resolve entra nula e é contada. A tabela de
// recebimentos precisa de heap maior.
//
// USO:
//   node scripts/migrar-delta-bubble.mjs                          (dry-run, tudo menos recebe)
//   node scripts/migrar-delta-bubble.mjs --apply
//   node --max-old-space-size=6144 scripts/migrar-delta-bubble.mjs --so recebe --apply
//   node scripts/migrar-delta-bubble.mjs --so cadastros --todos-cadastros   (trazer os 1.695)
// ===========================================================================

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs"
import { join } from "node:path"

const args = process.argv.slice(2)
const APLICAR = args.includes("--apply")
const TODOS_CADASTROS = args.includes("--todos-cadastros")
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

// O cursor do Bubble para em 50.000: acima disso, janelas por Created Date.
async function bubble(tipo) {
  mkdirSync(CACHE, { recursive: true })
  const arquivo = join(CACHE, normalizar(tipo) + ".json")
  if (existsSync(arquivo)) return JSON.parse(readFileSync(arquivo, "utf8"))
  const TETO = 49_900
  const linhas = []
  const vistos = new Set()
  let desde = null
  for (;;) {
    let cursor = 0, ultimo = null, acabou = false
    for (;;) {
      const params = new URLSearchParams({ limit: "100", cursor: String(cursor), sort_field: "Created Date", descending: "false" })
      if (desde) params.set("constraints", JSON.stringify([{ key: "Created Date", constraint_type: "greater than", value: desde }]))
      const r = await fetch(`${BASE}/obj/${encodeURIComponent(tipo)}?${params}`, { headers: { Authorization: `Bearer ${TOKEN}` } })
      if (r.status !== 200) throw new Error(`Bubble ${tipo}: ${r.status}`)
      const j = await r.json()
      const res = j.response?.results ?? []
      for (const item of res) {
        if (!vistos.has(item._id)) { vistos.add(item._id); linhas.push(item) }
        ultimo = item["Created Date"] ?? ultimo
      }
      cursor += res.length
      if (linhas.length % 10000 < 100) process.stdout.write(".")
      if (res.length === 0 || (j.response?.remaining ?? 0) === 0) { acabou = true; break }
      if (cursor >= TETO) break
    }
    if (acabou || !ultimo) break
    desde = new Date(new Date(ultimo).getTime() - 1).toISOString()
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

const resolvedores = new Map()
async function ref(tipoBubble, tabela, semTenant) {
  if (resolvedores.has(tabela)) return resolvedores.get(tabela)
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
  f.aprender = (idBubble, id) => porBubble.set(idBubble, id) // linhas inseridas nesta rodada
  resolvedores.set(tabela, f)
  return f
}

const conv = {
  t: (v) => (typeof v === "string" && v.trim() !== "" ? v.trim() : null),
  d: (v) => (v ? String(v).slice(0, 10) : null),
  ts: (v) => (v ? String(v) : null),
  n: (v) => (typeof v === "number" ? v : v == null || v === "" ? null : Number(v) || null),
  b: (v) => (v === true ? true : v === false ? false : null),
  s: (v) => (v == null || v === "" ? null : String(v).trim() || null),
}
const R = {
  filiado: { tipo: "filiação", tabela: "filiacoes" },
  empresa: { tipo: "empresa", tabela: "empresa", semTenant: true },
  remessa: { tipo: "filiaçãoreceberemessa", tabela: "filiacao_recebe_remessa" },
  homologacao: { tipo: "jurídico-homologações", tabela: "juridico_homologacoes" },
  cupom: { tipo: "hospedagemcupom", tabela: "hospedagem_cupom" },
  atendimento: { tipo: "saúdeatendimentos", tabela: "saude_atendimentos" },
  usuario: { tipo: "user", tabela: "usuarios" },
  endereco: { tipo: "endereços", tabela: "enderecos" },
  lgpd: { tipo: "filiaçãotllgpd", tabela: "filiacao_tl_lgpd" },
  desconto: { tipo: "filiaçãotldesconto", tabela: "filiacao_tl_desconto" },
}

// ── os tipos, na ordem das referências ─────────────────────────────────────

const PARTES = [
  {
    nome: "remessas", tipo: "filiaçãoreceberemessa", tabela: "filiacao_recebe_remessa",
    campos: { "Aberto?": ["aberto", "b"], "ANO": ["ano", "s"], "MÊS": ["mes", "t"], "Ordem": ["ordem", "n"], "TIPO": ["tipo", "t"], "EMP CONTRATANTE": ["emp_contratante_id", R.empresa] },
  },
  {
    nome: "recebe", tipo: "filiaçãorecebe", tabela: "filiacao_recebe", pesado: true,
    campos: { "CPF": ["cpf", "s"], "Valor": ["valor", "n"], "Matrícula sindical": ["matricula_sindical", "s"], "FONTE PG matrícula": ["fonte_pg_matricula", "s"], "FONTE PG": ["fonte_pg_id", R.empresa], "FILIADO": ["filiado_id", R.filiado], "REMESSA": ["remessa_id", R.remessa] },
  },
  {
    nome: "comprovacoes", tipo: "filiaçãorecebecomprovação", tabela: "filiacao_recebe_comprovacao",
    campos: { "Data": ["data", "d"], "Valor": ["valor", "n"], "Comprovante": ["comprovante", "t"], "FONTE PG": ["fonte_pg_id", R.empresa], "REMESSA": ["remessa_id", R.remessa] },
  },
  {
    nome: "prontuario", tipo: "filiaçãoprontuário", tabela: "filiacao_prontuario",
    campos: { "Data": ["data", "ts"], "Descrição": ["descricao", "t"], "Tipo": ["tipo", "t"], "FILIAÇÃO": ["filiacao_id", R.filiado], "HOMOLOGAÇÃO": ["homologacao_id", R.homologacao], "HOSPEDAGEM": ["hospedagem_id", R.cupom], "ATENDIMENTO": ["atendimento_id", R.atendimento], "DIRETOR/FUNCIONARIO": ["diretor_funcionario_id", R.usuario] },
  },
  {
    nome: "trabalhista", tipo: "vínculotrabalhista", tabela: "vinculos_trabalhistas",
    campos: { "Contrato de trabalho admissão": ["contrato_admissao", "d"], "Contrato de trabalho demissão": ["contrato_demissao", "d"], "Contrato de trabalho": ["contrato_trabalho", "t"], "Cargo": ["cargo", "t"], "CBO número": ["cbo_numero", "s"], "CIPA ou CIPLAT?": ["cipa_ou_ciplat", "b"], "Email corporativo": ["email_corporativo", "t"], "Lotação": ["lotacao", "t"], "Matrícula": ["matricula", "s"], "Regime de trabalho OS": ["regime_trabalho_os", "t"], "Regime de trabalho": ["regime_trabalho", "t"], "EMPREGADOR": ["empregador_id", R.empresa], "ENDEREÇO": ["endereco_id", R.endereco], "FILIADO": ["filiado_id", R.filiado], "TRABALHADOR": ["trabalhador_id", R.usuario] },
  },
  {
    nome: "usuarios", tipo: "user", tabela: "usuarios",
    campos: { "Nome completo": ["nome_completo", "t"], "Nome guerra": ["nome_guerra", "t"], "CPF": ["cpf", "s"], "Nascimento data": ["nascimento_data", "d"], "Nascimento dia": ["nascimento_dia", "n"], "Nascimento mês": ["nascimento_mes", "n"], "SEXO": ["sexo", "t"], "Estado civil": ["estado_civil", "t"], "Escolaridade": ["escolaridade", "t"], "Whatsapp": ["whatsapp", "t"], "Empresa - email": ["email_empresa", "t"], "Empresa - matrícula": ["empresa_matricula", "s"], "Vínculo instituição": ["vinculo_instituicao", "t"], "Vínculo instituição OS": ["vinculo_instituicao_os", "t"], "Filiada(o)?": ["filiado", "b"], "Inativo?": ["inativo", "b"], "Deletado?": ["deletado", "b"], "Autoriza receber notificações?": ["autoriza_notificacoes", "b"], "CNH autorizado?": ["cnh_autorizado", "b"], "Slug": ["slug", "t"] },
    nota: "o e-mail de login do Bubble não sai pela Data API: o usuário entra sem e-mail e sem acesso",
  },
  {
    nome: "cadastros", tipo: "filiação", tabela: "filiacoes",
    filtro: (r) => TODOS_CADASTROS || (r["FILIAÇÃO CONDIÇÃO"] && r["FILIAÇÃO CONDIÇÃO"] !== "Inativo"),
    campos: { "CPF": ["cpf", "s"], "Nome completo": ["nome_completo", "t"], "Nome social": ["nome_social", "t"], "SEXO": ["sexo", "t"], "Nascimento data": ["nascimento_data", "d"], "Nascimento dia": ["nascimento_dia", "n"], "Nascimento mes": ["nascimento_mes", "n"], "Telefone 1": ["telefone_1", "t"], "Telefone 1 whatsapp?": ["telefone_1_whatsapp", "b"], "Telefone 2": ["telefone_2", "t"], "Telefone 2 whatsapp?": ["telefone_2_whatsapp", "b"], "Email pessoal": ["email_pessoal", "t"], "Email corporativo": ["email_corporativo", "t"], "Endereço CEP": ["endereco_cep", "t"], "Endereço Logradouro": ["endereco_logradouro", "t"], "Endereço Número": ["endereco_numero", "t"], "Endereço Complemento": ["endereco_complemento", "t"], "Endereço Bairro": ["endereco_bairro", "t"], "Endereço Cidade": ["endereco_cidade", "t"], "Endereço Estado": ["endereco_estado", "t"], "Matrícula sindical": ["matricula_sindical", "s"], "Matrícula sindical n°": ["matricula_sindical_numero", "n"], "Filiação excluída?": ["filiacao_excluida", "b"], "Válido?": ["valido", "b"], "Recebe mensagens": ["recebe_mensagens", "b"], "FONTE PG Lotação": ["filiacao_lotacao", "t"], "FONTE PG admissão": ["filiacao_fonte_pg_admissao", "d"], "FONTE PG Offshore?": ["fonte_pg_offshore", "b"], "FILIAÇÃO CONDIÇÃO": ["filiacao_condicao", "t"], "FILIAÇÃO CONDIÇÃO FONTE": ["condicao_na_fonte", "t"], "Outra filiação Entidade": ["outra_filiacao_entidade", "t"], "Outra filiação desfiliar?": ["outra_filiacao_desfiliar", "b"], "TL LGPD": ["tl_lgpd_id", R.lgpd], "TL LGPD data": ["tl_lgpd_data", "d"], "TL Desconto": ["tl_desconto_id", R.desconto], "TL Desconto data": ["tl_desconto_data", "d"], "Código de verificação": ["codigo_verificacao", "t"], "votoonline2026": ["votoonline2026", "b"], "Foto": ["foto", "t"], "SINDICATO": ["sindicato_id", R.empresa], "USUÁRIO": ["usuario_id", R.usuario], "Slug": ["slug", "t"] },
    nota: "o vínculo de filiação de cada um entra com o migrar-vinculos-bubble.mjs rodado em seguida",
  },
]

// ── o trabalho ─────────────────────────────────────────────────────────────

const roda = (p) => (SO ? SO.includes(p.nome) : !p.pesado)
const total = { inseridos: 0 }

for (const parte of PARTES) {
  if (!roda(parte)) continue
  console.log(`\n▸ ${parte.nome.toUpperCase()}  (${parte.tipo} → ${parte.tabela})`)
  const [registros, aqui] = await Promise.all([bubble(parte.tipo), lerTudo(parte.tabela, "id, bubble_id")])
  const idsAqui = new Set(aqui.map((a) => a.id))
  const bubbleAqui = new Set(aqui.map((a) => a.bubble_id).filter(Boolean))
  const faltam = registros.filter((r) => !((r.Supabase_id && idsAqui.has(r.Supabase_id)) || bubbleAqui.has(r._id)))
  const escolhidos = parte.filtro ? faltam.filter(parte.filtro) : faltam
  console.log(`  Bubble ${registros.length} · aqui ${aqui.length} · faltam ${faltam.length}${parte.filtro ? ` · entram ${escolhidos.length} (descartados ${faltam.length - escolhidos.length})` : ""}`)
  if (parte.nota) console.log(`  nota: ${parte.nota}`)

  const refs = new Map()
  for (const [rotulo, [, como]] of Object.entries(parte.campos)) {
    if (typeof como === "object") refs.set(rotulo, await ref(como.tipo, como.tabela, como.semTenant))
  }
  const semRef = {}
  const linhas = escolhidos.map((r) => {
    const linha = { bubble_id: r._id, emp_proprietaria_id: TENANT, created_at: r["Created Date"] }
    for (const [rotulo, [coluna, como]] of Object.entries(parte.campos)) {
      const bruto = r[rotulo]
      if (bruto === undefined || bruto === null || bruto === "") continue
      if (typeof como === "object") {
        const v = refs.get(rotulo)(bruto)
        if (!v) { semRef[coluna] = (semRef[coluna] ?? 0) + 1; continue }
        linha[coluna] = v
      } else {
        const v = conv[como](bruto)
        if (v !== null && v !== undefined) linha[coluna] = v
      }
    }
    return linha
  })
  for (const [c, n] of Object.entries(semRef)) console.log(`  ${String(n).padStart(7)}  ${c} sem resolver`)
  if (!APLICAR || linhas.length === 0) continue

  let n = 0
  const proprio = resolvedores.get(parte.tabela)
  for (let de = 0; de < linhas.length; de += 500) {
    const lote = linhas.slice(de, de + 500)
    const { data, error } = await db.from(parte.tabela).insert(lote).select("id, bubble_id")
    if (error) {
      console.error(`\nFalhou em ${parte.tabela} a partir de ${de}: ${error.message}\nInseridos até aqui: ${n}.`)
      process.exit(1)
    }
    // quem foi inserido agora passa a resolver para as partes seguintes
    if (proprio) for (const d of data ?? []) proprio.aprender(d.bubble_id, d.id)
    n += lote.length
    if (n % 5000 < 500) process.stdout.write(".")
  }
  console.log(`\n  inseridos ${n}`)
  total.inseridos += n
}

console.log(`\n${APLICAR ? "Pronto" : "Dry-run"}: ${total.inseridos} inseridos${SO ? "" : " (recebe fica para --so recebe, com heap maior)"}.`)
