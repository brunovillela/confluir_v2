// Semeia o tenant DEMO para os prints das diárias da diretoria (manual).
// Idempotente: apaga o que semeou antes (ids fixos d1a...) e recria.
//
//   node scripts/seed-prints-diarias-diretoria.mjs
import { readFileSync } from "node:fs"
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
const DEPTO_ADM = "de100000-0000-4000-8000-000000000001" // Administrativo
const DEPTO_OPE = "de100000-0000-4000-8000-000000000002" // Operacional
const CC_ADM = "cc000000-0000-4000-8000-000000000001" // Despesas Administrativas
const CC_TERCEIROS = "cc000000-0000-4000-8000-000000000002" // Serviços de Terceiros
const CC_PESSOAL = "cc000000-0000-4000-8000-000000000004" // Despesas com Pessoal

// Pessoas: a diretoria demo só tinha a Mariana ligada a um usuário.
const MARIANA = "ab000000-0000-4000-8000-000000000021"
const CARLOS = "ab000000-0000-4000-8000-000000000022"
const JOSE = "ab000000-0000-4000-8000-000000000023"
const INTEGRANTE_CARLOS = "fe700000-0000-4000-8000-000000000001"
const INTEGRANTE_JOSE = "fe700000-0000-4000-8000-000000000003"

const TIPO_PERNOITE = "d1a50000-0000-4000-8000-000000000001"
const TIPO_SEM_PERNOITE = "d1a50000-0000-4000-8000-000000000002"
const SOL_APROVADA = "d1a51000-0000-4000-8000-000000000001"
const SOL_AGUARDANDO = "d1a51000-0000-4000-8000-000000000002"
const SOL_REPROVADA = "d1a51000-0000-4000-8000-000000000003"
const ORDEM = "d1a52000-0000-4000-8000-000000000001"

const erro = (rotulo) => ({ error }) => {
  if (error) throw new Error(`${rotulo}: ${error.message}`)
}

// ── Limpeza do que este script cria ─────────────────────────────────────────
const solicitacoes = [SOL_APROVADA, SOL_AGUARDANDO, SOL_REPROVADA]
await db.from("pessoal_diarias_solicitacao_despesas").delete().in("solicitacao_id", solicitacoes)
await db.from("pessoal_diarias_solicitacoes").delete().in("id", solicitacoes)
await db.from("ordens_pagamento_rateio").delete().eq("ordem_id", ORDEM)
await db.from("ordens_pagamento").delete().eq("id", ORDEM)
await db.from("pessoal_diarias_centros_custo").delete().eq("emp_proprietaria_id", D)
await db.from("financeiro_diarias").delete().in("id", [TIPO_PERNOITE, TIPO_SEM_PERNOITE])

// ── Pessoas da diretoria com cadastro de usuário ────────────────────────────
await db
  .from("usuarios")
  .upsert(
    [
      { id: CARLOS, nome_completo: "Carlos Andrade da Silva", emp_proprietaria_id: D },
      { id: JOSE, nome_completo: "José Pereira Lima", emp_proprietaria_id: D },
    ],
    { onConflict: "id" }
  )
  .then(erro("usuários da diretoria"))
await db
  .from("diretoria_integrantes")
  .update({ usuario_id: CARLOS })
  .eq("id", INTEGRANTE_CARLOS)
  .then(erro("integrante Carlos"))
await db
  .from("diretoria_integrantes")
  .update({ usuario_id: JOSE })
  .eq("id", INTEGRANTE_JOSE)
  .then(erro("integrante José"))

// Departamento de cada um — é de onde sai a conta contábil.
await db.from("empresa_departamentos_integrantes").delete().in("usuario_id", [MARIANA, CARLOS, JOSE])
await db
  .from("empresa_departamentos_integrantes")
  .insert([
    { departamento_id: DEPTO_ADM, usuario_id: MARIANA },
    { departamento_id: DEPTO_OPE, usuario_id: CARLOS },
    { departamento_id: DEPTO_ADM, usuario_id: JOSE },
  ])
  .then(erro("departamentos da diretoria"))

// ── Tipos de diária do quadro diretoria ─────────────────────────────────────
await db
  .from("financeiro_diarias")
  .insert([
    {
      id: TIPO_PERNOITE,
      emp_proprietaria_id: D,
      nome: "Atividade sindical com pernoite",
      diaria: "Nacional",
      valor_reembolso: 200,
      quadro: "diretor",
      ativa: true,
      descricao: "Representação da entidade fora da base, com dormida.",
    },
    {
      id: TIPO_SEM_PERNOITE,
      emp_proprietaria_id: D,
      nome: "Atividade sindical sem pernoite",
      diaria: "Local",
      valor_reembolso: 120,
      quadro: "diretor",
      ativa: true,
      descricao: "Reunião ou assembleia com retorno no mesmo dia.",
    },
  ])
  .then(erro("tipos de diária"))

// ── De-para das contas ──────────────────────────────────────────────────────
const { data: tiposDespesa } = await db
  .from("pessoal_diarias_despesa_tipos")
  .select("id, nome")
  .eq("emp_proprietaria_id", D)
const idDespesa = (nome) => tiposDespesa.find((t) => t.nome === nome)?.id ?? null

await db
  .from("pessoal_diarias_centros_custo")
  .insert([
    // Funcionário: uma conta só, sem departamento.
    { emp_proprietaria_id: D, quadro: "funcionario", centro_custo_id: CC_PESSOAL },
    // Diretoria: padrão + o departamento Operacional com conta própria.
    { emp_proprietaria_id: D, quadro: "diretor", centro_custo_id: CC_ADM },
    {
      emp_proprietaria_id: D,
      quadro: "diretor",
      departamento_id: DEPTO_OPE,
      centro_custo_id: CC_PESSOAL,
    },
    {
      emp_proprietaria_id: D,
      quadro: "diretor",
      despesa_tipo_id: idDespesa("Hospedagem"),
      centro_custo_id: CC_TERCEIROS,
    },
    {
      emp_proprietaria_id: D,
      quadro: "diretor",
      despesa_tipo_id: idDespesa("Alimentação"),
      centro_custo_id: CC_ADM,
    },
  ])
  .then(erro("centros de custo"))

// ── Uma diária aprovada, com despesas e ordem rateada ───────────────────────
await db
  .from("ordens_pagamento")
  .insert({
    id: ORDEM,
    emp_proprietaria_id: D,
    codigo: "2026.0908.1015.2207",
    tipo: "Diária",
    situacao: "Em autorização",
    descricao:
      "Diária — Atividade sindical com pernoite × 2 (R$ 200,00 cada) para Mariana Souza Ribeiro (diretoria — Administrativo). " +
      "Motivo: reunião da federação no Rio de Janeiro. período 08/09/2026 a 09/09/2026. " +
      "Com 2 despesa(s) extra(s) (R$ 198,50): Hospedagem, Alimentação.",
    valor_inicial_cobranca: 598.5,
    beneficiario_usuario_id: MARIANA,
    centro_custo_despesa_id: CC_ADM,
    departamento_id: DEPTO_ADM,
  })
  .then(erro("ordem de pagamento"))
await db
  .from("ordens_pagamento_rateio")
  .insert([
    {
      emp_proprietaria_id: D,
      ordem_id: ORDEM,
      centro_custo_despesa_id: CC_ADM,
      departamento_id: DEPTO_ADM,
      descricao: "Diária — Atividade sindical com pernoite",
      valor: 400,
      ordem: 0,
    },
    {
      emp_proprietaria_id: D,
      ordem_id: ORDEM,
      centro_custo_despesa_id: CC_TERCEIROS,
      departamento_id: DEPTO_ADM,
      descricao: "Hospedagem — Hotel em Macaé, 2 diárias",
      valor: 150,
      ordem: 1,
    },
    {
      emp_proprietaria_id: D,
      ordem_id: ORDEM,
      centro_custo_despesa_id: CC_ADM,
      departamento_id: DEPTO_ADM,
      descricao: "Alimentação",
      valor: 48.5,
      ordem: 2,
    },
  ])
  .then(erro("rateio"))

await db
  .from("pessoal_diarias_solicitacoes")
  .insert([
    {
      id: SOL_APROVADA,
      emp_proprietaria_id: D,
      funcionario_id: MARIANA,
      diaria_id: TIPO_PERNOITE,
      beneficiario_tipo: "diretor",
      departamento_id: DEPTO_ADM,
      quantidade: 2,
      motivo: "Reunião da federação no Rio de Janeiro.",
      data_inicio: "2026-09-08",
      data_termino: "2026-09-09",
      situacao: "aprovada",
      valor_unitario: 200,
      valor_total: 400,
      valor_despesas: 198.5,
      avaliador_id: "22222222-2222-4222-8222-222222222222",
      avaliacao_data: "2026-09-08T13:15:00Z",
      ordem_pagamento_id: ORDEM,
    },
    {
      id: SOL_AGUARDANDO,
      emp_proprietaria_id: D,
      funcionario_id: CARLOS,
      diaria_id: TIPO_PERNOITE,
      beneficiario_tipo: "diretor",
      departamento_id: DEPTO_OPE,
      solicitante_id: "22222222-2222-4222-8222-222222222222",
      quantidade: 3,
      motivo: "Assembleia na refinaria e visita às bases de Macaé e Campos.",
      data_inicio: "2026-10-05",
      data_termino: "2026-10-07",
      situacao: "aguardando",
      valor_unitario: 200,
      valor_total: 600,
    },
    {
      id: SOL_REPROVADA,
      emp_proprietaria_id: D,
      funcionario_id: JOSE,
      diaria_id: TIPO_SEM_PERNOITE,
      beneficiario_tipo: "diretor",
      departamento_id: DEPTO_ADM,
      quantidade: 1,
      motivo: "Curso de formação em Niterói.",
      data_inicio: "2026-08-20",
      data_termino: "2026-08-20",
      situacao: "reprovada",
      valor_unitario: 120,
      valor_total: 120,
      avaliador_id: "22222222-2222-4222-8222-222222222222",
      avaliacao_data: "2026-08-19T18:40:00Z",
      avaliacao_observacao: "O curso foi custeado pela federação; sem diária nesta data.",
    },
  ])
  .then(erro("solicitações"))

await db
  .from("pessoal_diarias_solicitacao_despesas")
  .insert([
    {
      emp_proprietaria_id: D,
      solicitacao_id: SOL_APROVADA,
      tipo_id: idDespesa("Hospedagem"),
      descricao: "Hotel em Macaé, 2 diárias",
      valor: 150,
    },
    {
      emp_proprietaria_id: D,
      solicitacao_id: SOL_APROVADA,
      tipo_id: idDespesa("Alimentação"),
      valor: 48.5,
    },
    {
      emp_proprietaria_id: D,
      solicitacao_id: SOL_AGUARDANDO,
      tipo_id: idDespesa("Passagem"),
      descricao: "Ônibus Campos → Macaé, ida e volta",
      valor: 96,
    },
  ])
  .then(erro("despesas extras"))

console.log("demo semeada: 2 tipos da diretoria, 5 contas, 3 diárias (1 aprovada com ordem rateada).")
