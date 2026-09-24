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

// Limpeza, na ordem das FKs. O pedido sai PRIMEIRO: ele aponta para o espaço,
// e apagar o espaço antes falharia calado, fazendo o insert bater em chave
// duplicada logo adiante.
const PEDIDO_DEMO = "9e000000-0000-4000-8000-0000000000a1"
await db
  .from("documento_assinaturas")
  .delete()
  .eq("documento_tipo", "cessao")
  .eq("documento_id", PEDIDO_DEMO)
for (const t of [
  "cessao_solicitacao_eventos",
  "cessao_custeio_itens",
  "cessao_solicitacao_exigencias",
]) {
  await db.from(t).delete().eq("solicitacao_id", PEDIDO_DEMO)
}
await db.from("cessao_solicitacoes").delete().eq("id", PEDIDO_DEMO)

for (const t of [
  "cessao_espaco_janelas",
  "cessao_espaco_bloqueios",
  "cessao_espaco_recintos",
  "cessao_espaco_exigencias",
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

// ── Regras de segurança, um pedido completo e o termo assinado ───────────────
//
// Existe para os PRINTS do manual: sem dado, a tela do pedido é uma sequência
// de cartões vazios e o leitor não entende o que está vendo.

const PEDIDO = "9e000000-0000-4000-8000-0000000000a1"
const { createHash } = await import("node:crypto")

await db.from("documento_assinaturas").delete().eq("documento_tipo", "cessao").eq("documento_id", PEDIDO)
for (const t of ["cessao_solicitacao_eventos", "cessao_custeio_itens", "cessao_solicitacao_exigencias"]) {
  await db.from(t).delete().eq("solicitacao_id", PEDIDO)
}
await db.from("cessao_solicitacoes").delete().eq("id", PEDIDO)
await db.from("cessao_espaco_exigencias").delete().eq("espaco_id", ESPACO)

erro(
  await db.from("cessao_espaco_exigencias").insert([
    { espaco_id: ESPACO, gatilho: "publico", de: 1, ate: 50, bombeiros: 1, segurancas: 1, emp_proprietaria_id: D },
    { espaco_id: ESPACO, gatilho: "publico", de: 51, ate: null, bombeiros: 2, segurancas: 3, emp_proprietaria_id: D },
    { espaco_id: ESPACO, gatilho: "bebida", bombeiros: 0, segurancas: 1, emp_proprietaria_id: D },
    { espaco_id: ESPACO, gatilho: "infantil", bombeiros: 1, segurancas: 0, observacao: "Área infantil sinalizada", emp_proprietaria_id: D },
  ]),
  "regras de segurança"
)

const daqui = (n) =>
  new Date(Date.now() + n * 86400000).toLocaleDateString("sv-SE", {
    timeZone: "America/Sao_Paulo",
  })
const { data: termoVigente } = await db
  .from("cessao_termos")
  .select("texto, codigo")
  .eq("emp_proprietaria_id", D)
  .eq("em_vigor", true)
  .maybeSingle()

const TEXTO_TERMO = (termoVigente?.texto ?? "")
  .replace("{{entidade}}", "Confluir Demo")
  .replace("{{concessionario}}", "Marina Duarte (Associação de Moradores)")
  .replace("{{espaco}}", "Auditório — plateia")
  .replace("{{sede}}", sede.nome)
  .replace("{{finalidade}}", "Assembleia da categoria para votar a pauta de reivindicações.")
  .replace("{{publico}}", "100")
  .replace("{{inicio}}", `${daqui(12).split("-").reverse().join("/")}, 09:00`)
  .replace("{{termino}}", `${daqui(12).split("-").reverse().join("/")}, 17:00`)
  .replace("{{montagem}}", `Montagem liberada a partir de ${daqui(12).split("-").reverse().join("/")}, 07:00.`)
  .replace("{{desmontagem}}", "")
  .replace("{{representante}}", "Marina Duarte — (22) 99888-1234")
  .replace("{{responsavel_visita}}", "Ana Beatriz Nogueira")
  .replace(
    "{{exigencias}}",
    "- Público a partir de 51 pessoas: 2 bombeiros civis, 3 seguranças\n- Bebida alcoólica: 1 segurança\nTotal: 2 bombeiros civis e 4 seguranças."
  )
  .replace("{{custeio}}", "- Limpeza pós-evento: R$ 450,00\n- Operador de som: R$ 300,00\nTotal: R$ 750,00.")
  .replace("{{local_data}}", `${sede.nome}, ${new Date().toLocaleDateString("pt-BR", { day: "numeric", month: "long", year: "numeric" })}.`)

erro(
  await db.from("cessao_solicitacoes").insert({
    id: PEDIDO,
    espaco_id: ESPACO,
    emp_proprietaria_id: D,
    numero: 1,
    solicitante_nome: "Marina Duarte",
    solicitante_email: "marina.duarte@exemplo-demo.com.br",
    solicitante_telefone: "(22) 99888-1234",
    entidade: "Associação de Moradores",
    representante_nome: "Marina Duarte",
    representante_telefone: "(22) 99888-1234",
    inicio: `${daqui(12)}T09:00:00-03:00`,
    termino: `${daqui(12)}T17:00:00-03:00`,
    montagem_inicio: `${daqui(12)}T07:00:00-03:00`,
    finalidade: "Assembleia da categoria para votar a pauta de reivindicações.",
    publico_estimado: 100,
    tem_bebida: true,
    situacao: "em_analise",
    identificacao: "email",
    email_confirmado_em: new Date().toISOString(),
    enviada_em: new Date().toISOString(),
    analista_id: resp?.id ?? null,
    visita_agendada_em: new Date(Date.now() - 2 * 86400000).toISOString(),
    visita_responsavel_id: resp?.id ?? null,
    visita_realizada_em: new Date(Date.now() - 2 * 86400000).toISOString(),
    visita_parecer: "Palco e som conferidos. A associação providencia extintor extra e sinalização.",
    autorizacao_situacao: "autorizada",
    autorizacao_por_id: resp?.id ?? null,
    autorizacao_em: new Date(Date.now() - 86400000).toISOString(),
    autorizacao_parecer: "Pauta compatível com a finalidade da entidade.",
    custeio_valor: 750,
    custeio_pago_em: new Date().toISOString(),
    termo_texto: TEXTO_TERMO,
    termo_codigo: termoVigente?.codigo ?? null,
    termo_gerado_em: new Date().toISOString(),
    termo_hash: createHash("sha256").update(TEXTO_TERMO).digest("hex"),
    termo_assinado_em: new Date().toISOString(),
  }),
  "pedido"
)

erro(
  await db.from("cessao_solicitacao_exigencias").insert([
    { solicitacao_id: PEDIDO, gatilho: "publico", motivo: "Público a partir de 51 pessoas", bombeiros: 2, segurancas: 3, emp_proprietaria_id: D },
    { solicitacao_id: PEDIDO, gatilho: "bebida", motivo: "Bebida alcoólica", bombeiros: 0, segurancas: 1, emp_proprietaria_id: D },
  ]),
  "exigências do pedido"
)
erro(
  await db.from("cessao_custeio_itens").insert([
    { solicitacao_id: PEDIDO, descricao: "Limpeza pós-evento", valor: 450, emp_proprietaria_id: D },
    { solicitacao_id: PEDIDO, descricao: "Operador de som", valor: 300, emp_proprietaria_id: D },
  ]),
  "itens do custeio"
)
erro(
  await db.from("cessao_solicitacao_eventos").insert(
    [
      ["analise", null],
      ["visita_agendada", "22/09/2026, 14:00"],
      ["visita_realizada", "Palco e som conferidos."],
      ["autorizacao_autorizada", "Pauta compatível com a finalidade da entidade."],
      ["custeio", "2 item(ns), total 750.00"],
      ["custeio_pago", null],
      ["termo_gerado", `Versão ${termoVigente?.codigo ?? "—"}`],
      ["termo_enviado", "Enviado para assinatura"],
      ["termo_assinado", null],
    ].map(([tipo, detalhe]) => ({
      solicitacao_id: PEDIDO,
      tipo,
      detalhe,
      usuario_id: resp?.id ?? null,
      emp_proprietaria_id: D,
    }))
  ),
  "trilha"
)

const certificado = () => {
  const a = "23456789ABCDEFGHJKMNPQRSTUVWXYZ"
  const c = Array.from({ length: 12 }, () => a[Math.floor(Math.random() * a.length)]).join("")
  return `${c.slice(0, 4)}-${c.slice(4, 8)}-${c.slice(8, 12)}`
}
erro(
  await db.from("documento_assinaturas").insert([
    {
      documento_tipo: "cessao", documento_id: PEDIDO, ordem: 1, papel: "cedente",
      nome: "Ricardo Menezes", email: "diretoria@confluir-demo.local", situacao: "assinado",
      hash_documento: createHash("sha256").update(TEXTO_TERMO).digest("hex"),
      certificado: certificado(), enviado_em: new Date(Date.now() - 3600000).toISOString(),
      assinado_em: new Date(Date.now() - 1800000).toISOString(), emp_proprietaria_id: D,
    },
    {
      documento_tipo: "cessao", documento_id: PEDIDO, ordem: 2, papel: "concessionario",
      nome: "Marina Duarte", email: "marina.duarte@exemplo-demo.com.br", situacao: "assinado",
      hash_documento: createHash("sha256").update(TEXTO_TERMO).digest("hex"),
      certificado: certificado(), enviado_em: new Date(Date.now() - 1800000).toISOString(),
      assinado_em: new Date().toISOString(), emp_proprietaria_id: D,
    },
  ]),
  "assinaturas"
)

console.log("pedido nº 1 completo: visita, autorização, custeio pago, termo assinado pelas duas partes")
