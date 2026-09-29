// Semeia o tenant DEMO para os prints de Acordos coletivos e Negociações
// sindicais (manual). Idempotente: apaga o que semeou antes (ids fixos ac…) e
// recria. Os PDFs vêm de C:/Users/nomos/Downloads (ACTs reais).
//
//   node scripts/seed-prints-acordos.mjs          → semeia (acordos + PDFs + negociação)
//   node scripts/seed-prints-acordos.mjs --limpar → apaga tudo o que semeou
//
// Depois de semear, as cláusulas são extraídas pela tela (botão "Extrair as
// cláusulas do PDF" em cada acordo) — a extração roda no servidor da aplicação.
import { existsSync, readFileSync } from "node:fs"
import { createRequire } from "node:module"

const require = createRequire(process.cwd() + "/package.json")
const { createClient } = require("@supabase/supabase-js")
const env = Object.fromEntries(
  readFileSync(".env.local", "utf8")
    .split(/\r?\n/)
    .filter((l) => l.includes("=") && !l.trim().startsWith("#"))
    .map((l) => {
      const i = l.indexOf("=")
      return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, "")]
    })
)
const db = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
})

const D = "11111111-1111-4111-8111-111111111111"
const DEMO = "22222222-2222-4222-8222-222222222222"
const PETRO = "f0f0f0f0-0000-4000-8000-000000000001" // Petro Fictícia
const CAMPANHA = "aa000000-0000-4000-8000-000000000001" // Pauta de Reivindicações 2026
const PASTA = "C:/Users/nomos/Downloads/"

const A = (n) => `ac100000-0000-4000-8000-0000000000${String(n).padStart(2, "0")}`
const NEG = "ac200000-0000-4000-8000-000000000001"
const EV = (n) => `ac300000-0000-4000-8000-0000000000${String(n).padStart(2, "0")}`

const ok = (rotulo) => ({ error }) => {
  if (error) throw new Error(`${rotulo}: ${error.message}`)
}

// ── Limpeza ─────────────────────────────────────────────────────────────────
const ids = [1, 2, 3, 4, 5, 6, 7].map(A)
const { data: comps } = await db
  .from("acordo_comparacoes")
  .select("id")
  .eq("emp_proprietaria_id", D)
  .or(`acordo_a_id.in.(${ids}),acordo_b_id.in.(${ids})`)
if (comps?.length) {
  await db.from("acordo_comparacao_pares").delete().in("comparacao_id", comps.map((c) => c.id))
  await db.from("acordo_comparacoes").delete().in("id", comps.map((c) => c.id))
}
for (const id of ids) {
  const { data } = await db.storage.from("acordos").list(id)
  if (data?.length) await db.storage.from("acordos").remove(data.map((f) => `${id}/${f.name}`))
}
await db.from("negociacoes").update({ acordo_vigente_id: null, acordo_final_id: null }).eq("id", NEG)
await db.from("acordo_clausulas").delete().in("acordo_id", ids)
await db.from("acordo_fontes").delete().in("acordo_id", ids)
await db.from("acordo_coletivo").delete().in("id", ids)
await db.from("negociacoes").delete().eq("id", NEG) // empresas e eventos em cascata

if (process.argv.includes("--limpar")) {
  console.log("Semente de Acordos e Negociações removida.")
  process.exit(0)
}

// ── Acordos ─────────────────────────────────────────────────────────────────
const acordos = [
  {
    id: A(1),
    titulo: "ACT Petrobras 2020-2022",
    situacao: "arquivado",
    vigencia_inicio: "2020-09-01",
    vigencia_fim: "2022-08-31",
    data_base: "Setembro",
    pdf: "ACT-2020-2022-Petrobras.pdf",
  },
  {
    id: A(2),
    titulo: "ACT Petrobras 2023-2025",
    situacao: "vigente",
    vigencia_inicio: "2023-09-01",
    vigencia_fim: "2025-08-31",
    data_base: "Setembro",
    pdf: "Acordo_Coletivo_de_Trabalho_ACT_2023-2025_F.pdf",
  },
  {
    id: A(3),
    titulo: "ACT Transpetro",
    situacao: "vigente",
    vigencia_inicio: "2023-09-01",
    vigencia_fim: "2025-08-31",
    data_base: "Setembro",
    pdf: "Transpetro_-_Acordo_Coletivo_de_Trabalho_ACT.pdf",
  },
  {
    id: A(4),
    titulo: "ACT Halliburton 2023-2025",
    situacao: "vigente",
    vigencia_inicio: "2023-05-01",
    vigencia_fim: "2025-04-30",
    data_base: "Maio",
    pdf: "Acordo-Coletivo-Halliburton-2023-2025.pdf",
  },
  {
    id: A(5),
    titulo: "ACT dos funcionários 2024-2026",
    situacao: "vigente",
    vigencia_inicio: "2024-03-01",
    vigencia_fim: "2026-02-28",
    data_base: "Março",
    com_funcionarios_entidade: true,
    fontes: [PETRO],
    pdf: "NF - ACT 2024-2026 (Ultima Proposta)_250402_153154.pdf",
  },
]

for (const { pdf, fontes, ...a } of acordos) {
  await db
    .from("acordo_coletivo")
    .insert({ tipo: "act", emp_proprietaria_id: D, ...a })
    .then(ok(a.titulo))
  if (fontes) {
    await db
      .from("acordo_fontes")
      .insert(fontes.map((empresa_id) => ({ acordo_id: a.id, empresa_id, emp_proprietaria_id: D })))
      .then(ok(`fontes ${a.titulo}`))
  }
  await subirPdf(a.id, pdf)
}

// ── Negociação em curso (pauta + 1ª proposta) ───────────────────────────────
const TITULO_NEG = "ACT dos funcionários 2025/2027"
await db
  .from("negociacoes")
  .insert({
    id: NEG,
    emp_proprietaria_id: D,
    titulo: TITULO_NEG,
    tipo: "act",
    data_base: "Março",
    situacao: "em_curso",
    acordo_vigente_id: A(5),
    campanha_id: CAMPANHA,
    inicio: "2025-03-10",
    observacoes: "Renovação do acordo dos funcionários da entidade.",
    criado_por_id: DEMO,
  })
  .then(ok("negociação"))
await db
  .from("negociacao_empresas")
  .insert({ negociacao_id: NEG, empresa_id: PETRO, emp_proprietaria_id: D })
  .then(ok("empresa na mesa"))

const documentos = [
  {
    id: A(6),
    titulo: `Pauta · ${TITULO_NEG}`,
    papel_negociacao: "pauta",
    rodada_negociacao: null,
    data_documento: "2025-03-20",
    pdf: "PROPOSTA NF _MAIO- ACT 2025-2027 .docx.pdf",
  },
  {
    id: A(7),
    titulo: `Proposta da empresa — 1ª rodada · ${TITULO_NEG}`,
    papel_negociacao: "proposta",
    rodada_negociacao: 1,
    data_documento: "2025-04-15",
    pdf: "ACT NF 2025-2027 (assinado).pdf",
  },
]
for (const { pdf, ...d } of documentos) {
  await db
    .from("acordo_coletivo")
    .insert({ tipo: "act", situacao: "em_negociacao", negociacao_id: NEG, emp_proprietaria_id: D, ...d })
    .then(ok(d.titulo))
  await subirPdf(d.id, pdf)
}

await db
  .from("negociacao_eventos")
  .insert([
    {
      id: EV(1),
      negociacao_id: NEG,
      data: "2025-04-02",
      tipo: "reuniao",
      titulo: "1ª reunião de negociação",
      descricao: "Apresentação da pauta à direção.",
      criado_por_id: DEMO,
      emp_proprietaria_id: D,
    },
    {
      id: EV(2),
      negociacao_id: NEG,
      data: "2025-04-22",
      tipo: "comunicado",
      titulo: "Boletim sobre a 1ª proposta",
      criado_por_id: DEMO,
      emp_proprietaria_id: D,
    },
  ])
  .then(ok("eventos"))

console.log("Acordos e negociação semeados. Extraia as cláusulas pela tela.")
console.log(ids.map((id) => `  /painel/representacao/acordos/${id}`).join("\n"))
console.log(`  /painel/representacao/negociacoes/${NEG}`)

async function subirPdf(acordoId, arquivo) {
  const origem = PASTA + arquivo
  if (!existsSync(origem)) throw new Error(`PDF não encontrado: ${origem}`)
  const caminho = `${acordoId}/${Date.now()}.pdf`
  const { error } = await db.storage
    .from("acordos")
    .upload(caminho, readFileSync(origem), { contentType: "application/pdf" })
  if (error) throw new Error(`PDF ${arquivo}: ${error.message}`)
  await db
    .from("acordo_coletivo")
    .update({ documento_url: caminho })
    .eq("id", acordoId)
    .then(ok(`documento ${arquivo}`))
}
