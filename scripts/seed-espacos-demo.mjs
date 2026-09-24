// Seed da CESSÃO DE ESPAÇOS no tenant de DEMONSTRAÇÃO — para os prints do
// manual e o click-test. Idempotente: ids fixos (prefixo 9e…), apaga e
// reinsere. NÃO toca no tenant real.
//
// USO: node scripts/seed-espacos-demo.mjs
import { readFileSync } from "node:fs"
import { createRequire } from "node:module"

const require = createRequire(process.cwd() + "/package.json")
const env = Object.fromEntries(
  readFileSync(".env.local", "utf8")
    .split(/\r?\n/)
    .filter((l) => l.includes("="))
    .map((l) => {
      const i = l.indexOf("=")
      return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, "")]
    })
)
const db = require("@supabase/supabase-js").createClient(
  env.NEXT_PUBLIC_SUPABASE_URL,
  env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false } }
)

const D = "11111111-1111-4111-8111-111111111111"
const ESPACO = "9e000000-0000-4000-8000-000000000001"

const { data: sede } = await db
  .from("empresa_sede")
  .select("id, nome")
  .eq("emp_proprietaria_id", D)
  .order("nome")
  .limit(1)
  .single()
const { data: recintos } = await db
  .from("patrimonio_recinto")
  .select("id, nome_recinto")
  .eq("emp_proprietaria_id", D)
const { data: resp } = await db
  .from("usuarios")
  .select("id")
  .eq("emp_proprietaria_id", D)
  .eq("vinculo_instituicao", "Funcionário(a)")
  .limit(1)
  .maybeSingle()

// Limpeza (ordem das FKs)
for (const t of [
  "cessao_espaco_janelas",
  "cessao_espaco_bloqueios",
  "cessao_espaco_recintos",
]) {
  await db.from(t).delete().eq("espaco_id", ESPACO)
}
await db.from("cessao_espacos").delete().eq("id", ESPACO)

const erro = (r, o) => {
  if (r.error) {
    console.error(`falha em ${o}: ${r.error.message}`)
    process.exit(1)
  }
}

erro(
  await db.from("cessao_espacos").insert({
    id: ESPACO,
    emp_proprietaria_id: D,
    nome: "Auditório — plateia",
    slug: "auditorio-plateia",
    descricao:
      "Palco, som, projeção e ar-condicionado. Acesso pela recepção, com rampa. Estacionamento para 20 carros.",
    sede_id: sede.id,
    capacidade_pessoas: 120,
    visita_tecnica: "obrigatoria",
    exige_termo: true,
    exige_autorizacao: true,
    publico_alvo: "qualquer",
    agenda_publica: true,
    responsavel_visita_id: resp?.id ?? null,
    ativo: true,
  }),
  "espaço"
)

erro(
  await db.from("cessao_espaco_recintos").insert(
    (recintos ?? []).map((r, i) => ({
      espaco_id: ESPACO,
      recinto_id: r.id,
      principal: i === 0,
      emp_proprietaria_id: D,
    }))
  ),
  "ambientes"
)

erro(
  await db.from("cessao_espaco_janelas").insert([
    ...[2, 4].map((dia) => ({
      espaco_id: ESPACO,
      dia_semana: dia,
      hora_inicio: "08:00:00",
      hora_termino: "12:00:00",
      modo: "slots",
      slot_minutos: 120,
      rotulo: "Manhã",
      emp_proprietaria_id: D,
    })),
    {
      espaco_id: ESPACO,
      dia_semana: 6,
      hora_inicio: "09:00:00",
      hora_termino: "22:00:00",
      modo: "livre",
      rotulo: "Sábado inteiro",
      emp_proprietaria_id: D,
    },
  ]),
  "janelas"
)

erro(
  await db.from("cessao_espaco_bloqueios").insert({
    espaco_id: ESPACO,
    inicio: new Date(Date.now() + 7 * 86400000).toISOString(),
    termino: null,
    motivo: "manutencao",
    descricao: "Troca do piso do palco — sem previsão de término",
    emp_proprietaria_id: D,
  }),
  "bloqueio"
)

console.log(
  `seed pronto: Auditório — plateia (${sede.nome}), ${(recintos ?? []).length} ambientes, 3 faixas, 1 bloqueio indefinido`
)
