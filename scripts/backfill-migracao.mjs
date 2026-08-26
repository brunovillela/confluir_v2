// ===========================================================================
// backfill-migracao.mjs — resgata campos que vieram NULOS da migração Bubble,
// casando por `bubble_id`, a partir de um CSV/planilha exportada do Bubble.
// ---------------------------------------------------------------------------
// SEGURANÇA (leia antes de rodar):
//   • DRY-RUN por padrão: só RELATA o que faria, não grava nada.
//     Passe --apply para efetivar.
//   • Só preenche colunas que estão NULAS no banco (`.is(col, null)`) — nunca
//     sobrescreve o que já veio na migração.
//   • Trava no TENANT REAL (emp_proprietaria_id) — não toca demo nem outros.
//   • Referências (fornecedor/favorecido) são resolvidas pelo `bubble_id` do
//     registro referenciado (empresa/usuarios) → uuid do Supabase.
//
// USO:
//   node scripts/backfill-migracao.mjs <arquivo.csv|xlsx> <job>            (dry-run)
//   node scripts/backfill-migracao.mjs <arquivo.csv|xlsx> <job> --apply    (grava)
//   jobs disponíveis: compras | financeiro
//
// PASSO 1 (sempre): rode em dry-run. O script imprime os CABEÇALHOS achados no
// arquivo e valida o mapeamento. Se um cabeçalho do mapa não existir no CSV,
// ele avisa — aí ajuste MAPA_* abaixo para casar com os nomes reais das colunas.
// ===========================================================================

import { readFileSync } from "node:fs"
import * as XLSX from "xlsx"

const TENANT_REAL = "c763cb99-edfd-4840-8453-ed3fcb66d4a1"

// ── MAPEAMENTO (ajustar os `csv:` aos cabeçalhos reais do arquivo) ──────────
// tipo: "texto" copia direto | "ref" resolve o bubble_id do CSV → uuid via
// `refTabela` (empresa|usuarios) e grava o uuid na coluna `db`.
const JOBS = {
  compras: {
    tabela: "compras_solicitacoes",
    // Coluna do CSV que contém o "unique id" do Bubble (casa com bubble_id):
    chaveCsv: "unique id",
    colunas: [
      { csv: "01.1 Solicitação Produto ou serviço", db: "solicitacao_produto", tipo: "texto" },
      { csv: "Justificativa", db: "justificativa", tipo: "texto" },
      { csv: "Descrição objetivo", db: "descricao_objetivo", tipo: "texto" },
      { csv: "01.1 Solicitação Observações", db: "solicitacao_observacao", tipo: "texto" },
      // Referência: unique id da empresa fornecedora → empresa.bubble_id.
      { csv: "04 Compra FORNECEDOR", db: "compra_fornecedor_id", tipo: "ref", refTabela: "empresa" },
    ],
  },
  financeiro: {
    tabela: "ordens_pagamento",
    chaveCsv: "unique id",
    colunas: [
      { csv: "Descrição", db: "descricao", tipo: "texto" },
      // Favorecido polimórfico: dois campos separados no Bubble, cada um o
      // unique id do referenciado. Empresa → beneficiario_fornecedor_id;
      // Pessoa/filiado → beneficiario_usuario_id.
      { csv: "BENEFICIÁRIO (FORNECEDOR)", db: "beneficiario_fornecedor_id", tipo: "ref", refTabela: "empresa" },
      { csv: "BENEFICIÁRIO (USER)", db: "beneficiario_usuario_id", tipo: "ref", refTabela: "usuarios" },
    ],
  },
}

// ── argumentos ──────────────────────────────────────────────────────────────
const [arquivo, job] = process.argv.slice(2)
const APLICAR = process.argv.includes("--apply")
if (!arquivo || !JOBS[job]) {
  console.error("uso: node scripts/backfill-migracao.mjs <arquivo> <compras|financeiro> [--apply]")
  process.exit(1)
}
const cfg = JOBS[job]

// ── supabase (service role) ──────────────────────────────────────────────────
const env = Object.fromEntries(
  readFileSync(".env.local", "utf8").split("\n").filter((l) => l.includes("=")).map((l) => {
    const i = l.indexOf("="); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, "")]
  })
)
const { createClient } = await import("@supabase/supabase-js")
const admin = createClient(env.NEXT_PUBLIC_SUPABASE_URL || env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } })

// ── ler o arquivo (CSV como texto UTF-8; xlsx como buffer) ───────────────────
const ehCsv = /\.csv$/i.test(arquivo)
const wb = ehCsv
  ? XLSX.read(readFileSync(arquivo, "utf8"), { type: "string" })
  : XLSX.read(readFileSync(arquivo), { type: "buffer" })
const ws = wb.Sheets[wb.SheetNames[0]]
const linhas = XLSX.utils.sheet_to_json(ws, { defval: null, raw: false })
const cabecalhos = linhas.length ? Object.keys(linhas[0]) : []
console.log(`\nArquivo: ${arquivo}  ·  ${linhas.length} linhas  ·  job: ${job}  ·  ${APLICAR ? "APLICAR" : "DRY-RUN"}`)
console.log("Cabeçalhos encontrados:", cabecalhos.join(" | "))

// valida o mapeamento contra os cabeçalhos reais
const faltando = [cfg.chaveCsv, ...cfg.colunas.map((c) => c.csv)].filter((h) => !cabecalhos.includes(h))
if (faltando.length) {
  console.error("\n⚠ Cabeçalhos do MAPA que NÃO existem no arquivo:", faltando.join(", "))
  console.error("Ajuste os `csv:` em JOBS." + job + " para casar com os nomes acima e rode de novo.")
  process.exit(1)
}

// ── pré-carrega mapas de referência (bubble_id → uuid) ───────────────────────
const refs = {}
for (const col of cfg.colunas.filter((c) => c.tipo === "ref")) {
  if (refs[col.refTabela]) continue
  const mapa = new Map()
  let de = 0
  for (;;) {
    const { data, error } = await admin.from(col.refTabela).select("id, bubble_id").not("bubble_id", "is", null).range(de, de + 999)
    if (error) { console.error(`erro lendo ${col.refTabela}:`, error.message); process.exit(1) }
    for (const r of data) mapa.set(String(r.bubble_id), r.id)
    if (data.length < 1000) break
    de += 1000
  }
  refs[col.refTabela] = mapa
  console.log(`ref ${col.refTabela}: ${mapa.size} bubble_id carregados`)
}

// ── processa ──────────────────────────────────────────────────────────────
const stat = { linhas: linhas.length, semChave: 0, semAlvo: 0, refNaoResolvida: 0, atualizadas: 0, semMudanca: 0, erros: 0 }
let n = 0
for (const linha of linhas) {
  const bubbleId = String(linha[cfg.chaveCsv] ?? "").trim()
  if (!bubbleId) { stat.semChave++; continue }

  const patch = {}
  for (const col of cfg.colunas) {
    const bruto = linha[col.csv]
    if (bruto === null || String(bruto).trim() === "") continue
    if (col.tipo === "ref") {
      const uuid = refs[col.refTabela].get(String(bruto).trim())
      if (!uuid) { stat.refNaoResolvida++; continue }
      patch[col.db] = uuid
    } else {
      patch[col.db] = String(bruto).trim()
    }
  }
  if (Object.keys(patch).length === 0) { stat.semAlvo++; continue }

  if (!APLICAR) { stat.atualizadas++; if (++n <= 5) console.log("  exemplo:", bubbleId, "→", patch); continue }

  // aplica coluna a coluna, só onde está NULO, travado no tenant real.
  // Com retry: quedas transitórias de conexão ("fetch failed") não deixam
  // buracos (é idempotente — só preenche nulo).
  let mudou = false
  for (const [db, val] of Object.entries(patch)) {
    let r, ultimoErro
    for (let tent = 1; tent <= 5; tent++) {
      r = await admin
        .from(cfg.tabela)
        .update({ [db]: val }, { count: "exact" })
        .eq("bubble_id", bubbleId)
        .eq("emp_proprietaria_id", TENANT_REAL)
        .is(db, null)
      if (!r.error) break
      ultimoErro = r.error
      await new Promise((res) => setTimeout(res, 400 * tent))
    }
    if (r.error) { stat.erros++; if (stat.erros <= 5) console.error("  erro:", bubbleId, db, ultimoErro.message); }
    else if (r.count > 0) mudou = true
  }
  mudou ? stat.atualizadas++ : stat.semMudanca++
  if (++n % 500 === 0) console.log(`  … ${n} processadas`)
}

console.log("\n=== RESUMO ===")
console.log(stat)
if (!APLICAR) console.log("\n(DRY-RUN — nada foi gravado. Reveja e rode com --apply para efetivar.)")
