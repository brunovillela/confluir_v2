// Semeia o tenant DEMO para os prints da página do condutor (manual de
// Veículos): um ano de uso do Eduardo — saídas, abastecimentos, reservas,
// infrações — e uma CNH anterior no histórico. Ids fixos (cd…), então
// --limpar apaga exatamente o que foi semeado. Rodar --limpar depois dos
// prints: a demo não guarda esses dados.
//
//   node scripts/seed-prints-condutor.mjs          → semeia
//   node scripts/seed-prints-condutor.mjs --limpar → apaga
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
const EDUARDO = "4d000000-0000-4000-8000-000000000001"
const RECEPCAO = "22222222-2222-4222-8222-222222222222"
const id = (grupo, n) => `cd${grupo}00000-0000-4000-8000-${String(n).padStart(12, "0")}`
const MOVS = 40
const ABAST = 30
const RESERVAS = 12

const ok = (rotulo) => ({ error }) => {
  if (error) throw new Error(`${rotulo}: ${error.message}`)
}

const faixa = (grupo, n) => Array.from({ length: n }, (_, i) => id(grupo, i + 1))
const { data: cad, error: erroCad } = await db
  .from("veiculos_condutores")
  .select("id")
  .eq("usuario_id", EDUARDO)
  .single()
if (erroCad) throw new Error(`cadastro do Eduardo: ${erroCad.message}`)

await db.from("veiculos_disponibilidade").delete().in("id", faixa(1, MOVS))
await db.from("veiculos_abastecimentos").delete().in("id", faixa(2, ABAST))
await db.from("veiculos_agendamentos").delete().in("id", faixa(3, RESERVAS))
await db.from("veiculos_infracoes").delete().in("id", faixa(4, 2))
await db.from("veiculos_condutores_cnh").delete().eq("id", id(5, 1))

if (process.argv.includes("--limpar")) {
  console.log("Semente do condutor removida.")
  process.exit(0)
}

const { data: vs } = await db
  .from("veiculos")
  .select("id, placa")
  .eq("emp_proprietaria_id", D)
  .order("placa")
  .limit(3)
const dia = (n) => new Date(Date.UTC(2026, 8, 25) - n * 86_400_000).toISOString().slice(0, 10)
const DESTINOS = [
  ["Macaé", "Assembleia na base de Imbetiba"],
  ["Campos dos Goytacazes", "Reunião na regional"],
  ["Rio das Ostras", "Entrega de material de campanha"],
  ["Quissamã", "Visita aos aposentados"],
]

const movs = Array.from({ length: MOVS }, (_, i) => {
  const [destino, motivo] = DESTINOS[i % DESTINOS.length]
  const saida = dia(i * 8 + 2)
  const volta = dia(i * 8 + (i % 5 === 0 ? 0 : 1))
  const foraDoNormal = i === 6
  return {
    id: id(1, i + 1),
    emp_proprietaria_id: D,
    veiculo_id: vs[i % 3 === 2 ? 1 : 0].id,
    condutor_id: EDUARDO,
    motivo,
    destino,
    data_retirada: saida,
    data_devolucao: volta,
    retirada_em: `${saida}T11:00:00Z`,
    devolucao_em: `${volta}T20:00:00Z`,
    previsao_retorno: i % 9 === 0 ? dia(i * 8 + 1) : null,
    km_rodado: foraDoNormal ? 1850 : 60 + ((i * 37) % 320),
    observacao_retorno: foraDoNormal
      ? "Km fora do normal confirmado na devolução: 1.850 km em 9 h — o hodômetro pode estar errado."
      : null,
    registrado_por_id: RECEPCAO,
    devolucao_registrada_por_id: RECEPCAO,
    sede_retirada_os: "Sede Central",
  }
})

const abast = Array.from({ length: ABAST }, (_, i) => {
  const litros = 22 + (i % 7) * 3.5
  const etanol = i % 4 === 0
  return {
    id: id(2, i + 1),
    emp_proprietaria_id: D,
    veiculo_id: vs[i % 3 === 2 ? 1 : 0].id,
    usuario_id: EDUARDO,
    posto: ["Posto Shell Imbetiba", "Posto Ipiranga Centro", "Posto BR Lagomar"][i % 3],
    cidade: ["Macaé", "Campos dos Goytacazes"][i % 2],
    combustivel: etanol ? "Etanol" : "Gasolina",
    volume_abastecido: litros,
    valor_abastecimento: Math.round(litros * (etanol ? 4.39 : 6.19) * 100) / 100,
    hodometro: 52000 + i * 410,
    data_hora_abastecimento: `${dia(i * 11)}T14:30:00Z`,
  }
})

const SITUACOES = ["concluida", "concluida", "concluida", "negada", "cancelada", "concluida"]
const reservas = Array.from({ length: RESERVAS }, (_, i) => {
  const situacao = SITUACOES[i % SITUACOES.length]
  const [destino, motivo] = DESTINOS[i % DESTINOS.length]
  return {
    id: id(3, i + 1),
    emp_proprietaria_id: D,
    condutor_id: EDUARDO,
    veiculo_id: vs[0].id,
    motivo,
    destino,
    data_retirada: `${dia(i * 25 + 3)}T11:00:00Z`,
    situacao,
    negado_motivo: situacao === "negada" ? "Sem veículo disponível na data" : null,
    solicitado_por_id: EDUARDO,
  }
})

const infracoes = [
  {
    id: id(4, 1),
    veiculo_id: vs[0].id,
    condutor_infrator_id: EDUARDO,
    infracao_data: dia(95),
    infracao_tipo: "Grave",
    infracao_descricao: "Excesso de velocidade até 20%",
    infracao_local: "BR-101, Casimiro de Abreu",
    infracao_custo: 195.23,
    cobranca_situacao: "baixada",
    cobranca_valor: 195.23,
  },
  {
    id: id(4, 2),
    veiculo_id: vs[1].id,
    condutor_infrator_id: EDUARDO,
    infracao_data: dia(210),
    infracao_tipo: "Leve",
    infracao_descricao: "Estacionar em local proibido durante ato sindical",
    infracao_local: "Macaé",
    infracao_custo: 88.38,
    justificativa_sindical: true,
    cobranca_situacao: "isenta",
  },
]

for (const [tabela, linhas] of [
  ["veiculos_disponibilidade", movs],
  ["veiculos_abastecimentos", abast],
  ["veiculos_agendamentos", reservas],
  ["veiculos_infracoes", infracoes],
]) {
  await db.from(tabela).insert(linhas).then(ok(tabela))
}
await db
  .from("veiculos_condutores_cnh")
  .insert({
    id: id(5, 1),
    emp_proprietaria_id: D,
    condutor_id: cad.id,
    cnh_numero: "01234567890",
    cnh_categoria: "C",
    cnh_validade: "2024-06-30",
    origem: "renovacao",
    registrado_por_id: RECEPCAO,
  })
  .then(ok("CNH anterior"))

console.log(`Condutor semeado: /painel/veiculos/condutores/${EDUARDO} (veículos ${vs.map((v) => v.placa).join(", ")})`)
