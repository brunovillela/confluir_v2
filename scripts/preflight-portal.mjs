// Preflight do seed do portal: confere se as colunas que vou inserir existem,
// antes de o usuário rodar o SQL. USO: node scripts/preflight-portal.mjs
import { readFileSync } from "node:fs"

const env = Object.fromEntries(
  readFileSync(".env.local", "utf8")
    .split("\n")
    .filter((l) => l.includes("="))
    .map((l) => {
      const i = l.indexOf("=")
      return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, "")]
    })
)
const { createClient } = await import("@supabase/supabase-js")
const admin = createClient(
  env.NEXT_PUBLIC_SUPABASE_URL || env.SUPABASE_URL,
  env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false } }
)

const ALVOS = {
  agenda: "id, emp_proprietaria_id, atividade, local, inicio, termino, dia_todo, tipo, aplicativo",
  hospedagem_cupom: "id, check_in, sexo, cancelado, compareceu, aceita_quarto_coletivo, tarifa_hospede, servico_id, filiado_id, hotel_id, created_at",
  saude_assistidos: "id, emp_proprietaria_id, nome, filiado_id",
  saude_atendimentos: "id, emp_proprietaria_id, assistido_id, tipo_id, profissional_id, atendente_id, data_atendimento, observacao_aberta",
  oposicao_campanha: "id, emp_proprietaria_id, codigo, nome, detalhe_desconto, prazo_inicio, prazo_fim, modo_formalizacao, situacao, created_at",
}

let falhou = false
for (const [tabela, cols] of Object.entries(ALVOS)) {
  const { error } = await admin.from(tabela).select(cols).limit(0)
  if (error) {
    falhou = true
    console.log(`✗ ${tabela}: ${error.message}`)
  } else {
    console.log(`✓ ${tabela}`)
  }
}
// Confirma que o filiado do Roberto existe e está Ativo no tenant.
const { data: rob } = await admin
  .from("filiacoes")
  .select("id, nome_completo, filiacao_condicao")
  .eq("cpf", "11122233301")
  .eq("emp_proprietaria_id", "11111111-1111-4111-8111-111111111111")
console.log("Roberto (11122233301):", JSON.stringify(rob))
process.exit(falhou ? 1 : 0)
