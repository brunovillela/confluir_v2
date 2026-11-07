// Conferência do isolamento entre entidades no banco (RLS), só lendo.
//
// POR QUÊ: o app lê os dados com createAdminClient(), que entra no banco como
// a entidade atual (JWT `authenticated` com a claim `tenant_id`); quem separa
// uma entidade da outra são as políticas `tenant_isolation` (ADR 0003). Uma
// tabela nova sem RLS, ou com política frouxa, ou uma view que ignora o RLS,
// vazaria dados de uma entidade para outra sem nenhum erro aparente. Em
// 07/11 isso foi conferido à mão tabela por tabela; aqui vira um comando.
//
// COMO: lista tabelas e views pela API do PostgREST (OpenAPI). Para cada uma
// com `emp_proprietaria_id`:
//   - lê com um token de uma entidade INEXISTENTE → não pode vir linha;
//   - lê com a chave pública (anon), sem login → não pode vir linha (ou erro);
//   - lê com o token de cada entidade que tem linhas → se não vier, avisa
//     (tabela só do servidor, lida pelo cliente de serviço — pode ser de
//     propósito, mas convém saber).
// Tabelas sem a coluna só entram na conferência da chave pública.
// Nada é gravado. Cada consulta pede UMA linha (limit 1), nunca count: para
// provar vazamento basta saber se alguma linha aparece. Em 07/11 a versão com
// count=exact, 4 em paralelo, coincidiu com a API de produção fora do ar (522).
// Por isso também roda uma consulta por vez, com pausa entre elas.
//
// USO:
//   npm run db:isolamento            (falha com código 1 se houver vazamento)
//   npm run db:isolamento -- --tudo  (lista também as tabelas que passaram)
//
// Lê do .env.local: NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY,
// SUPABASE_SERVICE_ROLE_KEY e SUPABASE_JWT_SECRET (nenhum é impresso).

import { readFileSync } from "node:fs"
import { createHmac, randomUUID } from "node:crypto"
import { createClient } from "@supabase/supabase-js"

const env = Object.fromEntries(
  readFileSync(".env.local", "utf8")
    .split("\n")
    .filter((l) => l.includes("=") && !l.trimStart().startsWith("#"))
    .map((l) => {
      const i = l.indexOf("=")
      return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, "")]
    })
)
const URL_BANCO = env.NEXT_PUBLIC_SUPABASE_URL || env.SUPABASE_URL
const ANON = env.NEXT_PUBLIC_SUPABASE_ANON_KEY || env.SUPABASE_ANON_KEY
const SERVICO = env.SUPABASE_SERVICE_ROLE_KEY
const SEGREDO = env.SUPABASE_JWT_SECRET
for (const [nome, v] of Object.entries({ URL_BANCO, ANON, SERVICO, SEGREDO })) {
  if (!v) {
    console.error(`Falta ${nome} no .env.local.`)
    process.exit(2)
  }
}
const TUDO = process.argv.includes("--tudo")
const COLUNA = "emp_proprietaria_id"

/**
 * Tabelas que a chave pública pode ler de propósito (páginas públicas). Só
 * entra aqui o que foi conferido: a tabela não tem dado pessoal nem de uma
 * entidade que outra não deva ver.
 */
const PUBLICAS_DE_PROPOSITO = new Set([])

/**
 * Tabelas que só o servidor lê (cliente de serviço), sem política para a
 * entidade — de propósito. Ficam fora dos avisos para que uma nova apareça.
 */
const SO_DO_SERVIDOR = new Set([
  // Painel analítico: sem acesso direto (privilégios revogados de anon e
  // authenticated); lidos pelas funções rpc da analítica, que recebem a
  // entidade (lib/db/analitica.ts).
  "fato_arrecadacao_mensal",
  "fato_despesa_mensal",
  "fato_filiacao_mensal",
  "fato_frota_mensal",
  // Confirmação do link único pelo bot: o webhook atende todas as entidades e
  // o token carrega a entidade (lib/db/votacao-telegram.ts).
  "votacao_telegram_confirmacoes",
])

// Mesmo token do createAdminClient (src/lib/supabase/admin.ts → jwtDoTenant).
function tokenDaEntidade(tenantId) {
  const b64 = (o) => Buffer.from(JSON.stringify(o)).toString("base64url")
  const agora = Math.floor(Date.now() / 1000)
  const cabecalho = b64({ alg: "HS256", typ: "JWT" })
  const corpo = b64({
    role: "authenticated",
    aud: "authenticated",
    sub: randomUUID(),
    tenant_id: tenantId,
    iat: agora,
    exp: agora + 600,
  })
  const assinatura = createHmac("sha256", SEGREDO).update(`${cabecalho}.${corpo}`).digest("base64url")
  return `${cabecalho}.${corpo}.${assinatura}`
}

// Toda requisição com prazo: uma resposta que nunca chega não pode travar a conferência.
const comPrazo = (url, opcoes = {}) => fetch(url, { ...opcoes, signal: AbortSignal.timeout(30_000) })
const cliente = (token) =>
  createClient(URL_BANCO, ANON, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { fetch: comPrazo, ...(token ? { headers: { Authorization: `Bearer ${token}` } } : {}) },
  })
const servico = createClient(URL_BANCO, SERVICO, { auth: { persistSession: false }, global: { fetch: comPrazo } })
const anonimo = cliente(null)
const forasteiro = cliente(tokenDaEntidade(randomUUID()))

const espera = (ms) => new Promise((r) => setTimeout(r, ms))
const naoConferidas = new Set()

/**
 * Presença de linhas: 1 se alguma aparece, 0 se nenhuma. `null` = leitura NEGADA (401/403 ou erro de permissão do banco),
 * que conta como isolado. Falha de rede ou 5xx não é negação: tenta de novo
 * e, se persistir, a tabela fica como não conferida (o script sai com erro).
 */
const PAUSA_MS = 150
async function contar(c, tabela, filtro) {
  for (let tentativa = 1; tentativa <= 3; tentativa++) {
    await espera(PAUSA_MS)
    let q = c.from(tabela).select("*").limit(1)
    if (filtro) q = q.eq(COLUNA, filtro)
    const { data, error, status } = await q
    if (!error) return data?.length ?? 0
    if (status === 401 || status === 403 || /^(42501|PGRST)/.test(error.code ?? "")) return null
    await espera(5000 * tentativa)
  }
  naoConferidas.add(tabela)
  return null
}

// ── tabelas e views expostas pela API ───────────────────────────────────────
let openapi = null
for (let tentativa = 1; tentativa <= 3 && !openapi; tentativa++) {
  try {
    const r = await comPrazo(`${URL_BANCO}/rest/v1/`, { headers: { apikey: SERVICO, Authorization: `Bearer ${SERVICO}` } })
    if (r.ok) openapi = await r.json()
    else console.error(`A API respondeu ${r.status} ao listar as tabelas (tentativa ${tentativa}).`)
  } catch (e) {
    console.error(`Falha ao listar as tabelas (tentativa ${tentativa}): ${e.message}`)
  }
  if (!openapi) await espera(3000 * tentativa)
}
if (!openapi) {
  console.error("Não consegui listar as tabelas pela API — tente de novo em instantes.")
  process.exit(2)
}
const definicoes = openapi.definitions ?? {}
const nomes = Object.keys(definicoes).sort()
if (nomes.length === 0) {
  console.error("A API não devolveu nenhuma tabela — confira a URL e a chave.")
  process.exit(2)
}

// A entidade é `tenants.empresa_id` (o mesmo valor de emp_proprietaria_id), não `tenants.id`.
const { data: entidades, error: eEnt } = await servico.from("tenants").select("empresa_id")
if (eEnt) {
  console.error(`Não consegui ler as entidades (tenants): ${eEnt.message}`)
  process.exit(2)
}
const tokens = new Map(
  (entidades ?? [])
    .filter((e) => e.empresa_id)
    .map((e) => [String(e.empresa_id), cliente(tokenDaEntidade(String(e.empresa_id)))])
)

const vazamentos = []
const avisos = []
const ok = []
let comEntidade = 0

// Uma tabela por vez: a conferência não pode pesar no banco de produção.
const fila = [...nomes]
async function trabalhador() {
  for (let tabela = fila.shift(); tabela; tabela = fila.shift()) {
    const colunas = definicoes[tabela]?.properties ?? {}
    const temEntidade = COLUNA in colunas

    const peloAnonimo = await contar(anonimo, tabela)
    if (peloAnonimo && !PUBLICAS_DE_PROPOSITO.has(tabela)) {
      vazamentos.push(`${tabela}: a chave pública (sem login) lê linhas`)
    }
    if (!temEntidade) continue
    comEntidade++

    const deFora = await contar(forasteiro, tabela)
    if (deFora) vazamentos.push(`${tabela}: uma entidade inexistente lê linhas`)

    // Cada entidade com linhas precisa ler as suas — senão a tabela é só do servidor.
    const semLeitura = []
    for (const [id, c] of tokens) {
      const total = await contar(servico, tabela, id)
      if (!total) continue
      const vistas = await contar(c, tabela, id)
      if (!vistas) semLeitura.push(`${id.slice(0, 8)}…`)
    }
    if (semLeitura.length && !SO_DO_SERVIDOR.has(tabela)) avisos.push(`${tabela}: a entidade não lê as próprias linhas — ${semLeitura.join(", ")}`)
    else if (!deFora && !peloAnonimo) ok.push(tabela)
  }
}
await Promise.all(Array.from({ length: 1 }, trabalhador))

console.log(
  `Isolamento entre entidades: ${nomes.length} tabelas/views na API, ${comEntidade} com ${COLUNA}, ${tokens.size} entidades.`
)
if (TUDO && ok.length) console.log(`\nIsoladas (${ok.length}): ${ok.join(", ")}`)
if (avisos.length) {
  console.log(`\nAvisos — só o servidor lê (cliente de serviço); confira se é de propósito (${avisos.length}):`)
  for (const a of avisos.sort()) console.log(`  · ${a}`)
}
if (naoConferidas.size) {
  console.log(
    `\nNÃO CONFERIDAS — a API falhou mesmo depois de 3 tentativas (${naoConferidas.size}): ${[...naoConferidas].sort().join(", ")}`
  )
}
if (vazamentos.length) {
  console.log(`\nVAZAMENTO (${vazamentos.length}):`)
  for (const v of vazamentos.sort()) console.log(`  ✗ ${v}`)
  process.exit(1)
}
if (naoConferidas.size) process.exit(2)
console.log("\nNenhum vazamento: nenhuma tabela é lida por entidade de fora nem pela chave pública.")
