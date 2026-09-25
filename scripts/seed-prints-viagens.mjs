// Semeia o tenant DEMO para os prints de Viagens (manual). Idempotente: apaga
// o que semeou antes (ids fixos 7a…) e recria.
//
//   node scripts/seed-prints-viagens.mjs               → semeia
//   node scripts/seed-prints-viagens.mjs --sem-diretor → tira o demo da diretoria
//   node scripts/seed-prints-viagens.mjs --limpar      → apaga tudo
//
// Para os prints de "Minhas viagens" e do botão do painel, o usuário demo
// vira diretor. Depois dos prints, rode --sem-diretor: as viagens ficam (para
// reprints), mas o demo não aparece como diretor nas outras telas.
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
const DEMO = "22222222-2222-4222-8222-222222222222"
const MARIANA = "ab000000-0000-4000-8000-000000000021"
const CARLOS = "ab000000-0000-4000-8000-000000000022"
const DEPTO_ADM = "de100000-0000-4000-8000-000000000001"
const DEPTO_OPE = "de100000-0000-4000-8000-000000000002"
const CC_ADM = "cc000000-0000-4000-8000-000000000001" // Despesas Administrativas
const CC_TERCEIROS = "cc000000-0000-4000-8000-000000000002" // Serviços de Terceiros
const CC_CUSTEIO = "cc000000-0000-4000-8000-000000000010" // Custeio Institucional
const EVENTO = "e0e0e0e0-0000-4000-8000-000000000001"
const TECH = "f0f0f0f0-0000-4000-8000-000000000004" // "agência" da demo
const POUSADA = "f0f0f0f0-0000-4000-8000-000000000005"
const MANDATO = "fe600000-0000-4000-8000-000000000001"
const INTEGRANTE_DEMO = "fe700000-0000-4000-8000-0000000000e2"

const V = (n) => `7a100000-0000-4000-8000-0000000000${String(n).padStart(2, "0")}`
const I = (n) => `7a200000-0000-4000-8000-0000000000${String(n).padStart(2, "0")}`
const FATURA = "7a300000-0000-4000-8000-000000000001"
const PROCESSO = "7a400000-0000-4000-8000-000000000001"
const ORDEM = "7a500000-0000-4000-8000-000000000001"
const FORNECIMENTO = "7a600000-0000-4000-8000-000000000001"
const PDF = "viagens/faturas/print-demo-f1.pdf"

const ok = (rotulo) => ({ error }) => {
  if (error) throw new Error(`${rotulo}: ${error.message}`)
}

if (process.argv.includes("--sem-diretor")) {
  await db.from("diretoria_integrantes").delete().eq("id", INTEGRANTE_DEMO).then(ok("integrante demo"))
  console.log("Usuário demo fora da diretoria; as viagens semeadas ficam.")
  process.exit(0)
}

// ── Limpeza ─────────────────────────────────────────────────────────────────
const viagens = [1, 2, 3, 4, 5, 6].map(V)
await db.from("viagens_itens").update({ fatura_id: null }).in("solicitacao_id", viagens)
await db.from("viagens_faturas").delete().eq("id", FATURA)
await db.from("compras_fornecimentos").delete().eq("id", FORNECIMENTO)
await db.from("ordens_pagamento").delete().eq("id", ORDEM) // rateio cai em cascata
await db.from("compras_solicitacoes").delete().eq("id", PROCESSO)
await db.from("viagens_solicitacoes").delete().in("id", viagens) // itens em cascata
await db
  .from("pessoal_diarias_centros_custo")
  .delete()
  .eq("emp_proprietaria_id", D)
  .eq("quadro", "convidado")
await db.from("diretoria_integrantes").delete().eq("id", INTEGRANTE_DEMO)
await db.storage.from("compras").remove([PDF])
await db
  .from("notificacoes")
  .delete()
  .eq("usuario_id", DEMO)
  .ilike("notificacao", "%viagem%nº%")

if (process.argv.includes("--limpar")) {
  console.log("Semente de Viagens removida.")
  process.exit(0)
}

// ── Usuário demo como diretor (Minhas viagens, botão do painel) ─────────────
await db
  .from("diretoria_integrantes")
  .insert({
    id: INTEGRANTE_DEMO,
    mandato_id: MANDATO,
    usuario_id: DEMO,
    nome: "Operador de Demonstração",
    cargo: "Diretor do Departamento Administrativo",
    ordem: 99,
    situacao: "exercicio",
    emp_proprietaria_id: D,
  })
  .then(ok("integrante demo"))

// ── Contas dos convidados no de-para ────────────────────────────────────────
const { data: tipos } = await db
  .from("pessoal_diarias_despesa_tipos")
  .select("id, nome")
  .eq("emp_proprietaria_id", D)
const tipo = (nome) => tipos.find((t) => t.nome === nome)?.id
await db
  .from("pessoal_diarias_centros_custo")
  .insert([
    { quadro: "convidado", despesa_tipo_id: tipo("Passagem"), centro_custo_id: CC_CUSTEIO, emp_proprietaria_id: D },
    { quadro: "convidado", despesa_tipo_id: tipo("Hospedagem"), centro_custo_id: CC_ADM, emp_proprietaria_id: D },
  ])
  .then(ok("contas convidado"))

// ── Viagens ─────────────────────────────────────────────────────────────────
const agora = new Date()
const diasAtras = (n) => new Date(agora.getTime() - n * 86400000).toISOString()
// Lote: o PostgREST põe NULL (não o default) nas colunas ausentes de uma linha.
const base = { emp_proprietaria_id: D, solicitante_id: DEMO }
await db
  .from("viagens_solicitacoes")
  .insert([
    // 1. Pedido do próprio diretor (demo), aguardando a equipe.
    { ...base, id: V(1), beneficiario_tipo: "diretor", beneficiario_usuario_id: DEMO, departamento_id: DEPTO_ADM, evento_id: EVENTO, motivo: "Encontro de Formação Sindical em Brasília", situacao: "solicitada", created_at: diasAtras(1) },
    // 2. Diretor sem conta, lançado pela equipe, em atendimento (hotel falta).
    { ...base, id: V(2), beneficiario_tipo: "diretor", beneficiario_usuario_id: CARLOS, departamento_id: DEPTO_OPE, motivo: "Reunião da federação no Rio de Janeiro", situacao: "em_atendimento", atendido_por: DEMO, created_at: diasAtras(3) },
    // 3. Convidada do evento, atendida e faturada.
    { ...base, id: V(3), beneficiario_tipo: "convidado", convidado_nome: "Ana Paula Mendes", convidado_cpf: "52998224725", convidado_nascimento: "1979-04-12", convidado_email: "ana.mendes@exemplo.com", convidado_telefone: "(21) 99876-5432", departamento_id: DEPTO_ADM, evento_id: EVENTO, motivo: "Palestra de abertura do Encontro de Formação", situacao: "atendida", atendido_por: DEMO, atendido_em: diasAtras(4), created_at: diasAtras(9) },
    // 4. Diretora, atendida e faturada.
    { ...base, id: V(4), beneficiario_tipo: "diretor", beneficiario_usuario_id: MARIANA, departamento_id: DEPTO_ADM, evento_id: EVENTO, motivo: "Coordenação do Encontro de Formação", situacao: "atendida", atendido_por: DEMO, atendido_em: diasAtras(4), created_at: diasAtras(8) },
    // 5. Viagem anterior do demo, atendida (histórico e visão de quem viaja).
    { ...base, id: V(5), beneficiario_tipo: "diretor", beneficiario_usuario_id: DEMO, departamento_id: DEPTO_ADM, motivo: "Plenária estadual em Macaé", situacao: "atendida", atendido_por: DEMO, atendido_em: diasAtras(20), created_at: diasAtras(25) },
    // 6. Convidado recusado.
    { ...base, id: V(6), beneficiario_tipo: "convidado", convidado_nome: "Roberto Siqueira", convidado_email: "roberto.siqueira@exemplo.com", departamento_id: DEPTO_OPE, motivo: "Debate sobre a campanha salarial", situacao: "recusada", motivo_situacao: "O debate passou a ser on-line; não há deslocamento.", atendido_por: DEMO, encerrado_em: diasAtras(6), created_at: diasAtras(7) },
  ])
  .then(ok("viagens"))

const item = (n, v, ordem, campos) => ({
  id: I(n),
  emp_proprietaria_id: D,
  solicitacao_id: V(v),
  ordem,
  bagagem_extra: false,
  ...campos,
})
const ida = (origem, destino, data) => ({ tipo: "passagem", modal: "aerea", origem, destino, data_viagem: data })
const hotel = (cidade, checkin, checkout) => ({ tipo: "hospedagem", cidade, checkin, checkout })
await db
  .from("viagens_itens")
  .insert([
    item(1, 1, 0, { ...ida("Rio de Janeiro (GIG)", "Brasília (BSB)", "2026-10-28"), saida_criterio: "depois", saida_hora: "07:00", chegada_criterio: "ate", chegada_hora: "12:00", bagagem_extra: true, bagagem_descricao: "1 mala de 23 kg com o material do encontro" }),
    item(2, 1, 1, { ...ida("Brasília (BSB)", "Rio de Janeiro (GIG)", "2026-10-30"), saida_criterio: "depois", saida_hora: "17:00" }),
    item(3, 1, 2, { ...hotel("Brasília", "2026-10-28", "2026-10-30"), observacoes: "Perto do Centro de Convenções, se possível." }),
    item(4, 2, 0, { ...ida("Macaé", "Rio de Janeiro", "2026-10-15"), modal: "rodoviaria", saida_criterio: "depois", saida_hora: "06:00", chegada_criterio: "ate", chegada_hora: "10:00", fornecedor_id: TECH, localizador: "1001-44871", reserva_descricao: "Viação 1001 — sai 06:30 da rodoviária de Macaé, chega 09:40 na Novo Rio. Poltrona 12.", valor: 118.5 }),
    item(5, 2, 1, { ...hotel("Rio de Janeiro", "2026-10-15", "2026-10-16"), necessidades_especiais: "Quarto acessível (cadeira de rodas)." }),
    item(6, 3, 0, { ...ida("São Paulo (CGH)", "Brasília (BSB)", "2026-10-28"), chegada_criterio: "ate", chegada_hora: "11:00", fornecedor_id: TECH, localizador: "KLM7QZ", reserva_descricao: "LATAM LA 3540 — sai 08:10 de Congonhas, chega 09:55 em Brasília.", valor: 540 }),
    item(7, 3, 1, { ...hotel("Brasília", "2026-10-28", "2026-10-29"), fornecedor_id: TECH, localizador: "H-20931", reserva_descricao: "Hotel Nacional, Setor Hoteleiro Sul Q. 1 — café incluso, check-in a partir das 14h.", valor: 380 }),
    item(8, 4, 0, { ...ida("Rio de Janeiro (SDU)", "Brasília (BSB)", "2026-10-27"), fornecedor_id: TECH, localizador: "XPTO12", reserva_descricao: "Gol G3 1234 — sai 16:15 do Santos Dumont, chega 18:05 em Brasília.", valor: 720 }),
    item(9, 5, 0, { ...ida("Rio de Janeiro", "Macaé", "2026-09-05"), modal: "rodoviaria", fornecedor_id: TECH, localizador: "1001-39920", reserva_descricao: "Viação 1001 — sai 07:00 da Novo Rio, chega 10:10 em Macaé.", valor: 112 }),
    item(10, 5, 1, { ...hotel("Macaé", "2026-09-05", "2026-09-06"), fornecedor_id: POUSADA, localizador: "PMA-771", reserva_descricao: "Pousada Mar Azul, Av. Atlântica 200 — café incluso.", valor: 260 }),
    item(11, 6, 0, { ...ida("Campos dos Goytacazes", "Rio de Janeiro", "2026-10-02"), modal: "rodoviaria" }),
  ])
  .then(ok("itens"))

// ── Fatura da Tech com 3 itens de 2 viagens, taxa de R$ 30 ──────────────────
// Mesma conta do registrarFatura: taxa rateada em centavos, sobra no maior.
const linhas = [
  { item: I(6), valor: 540, conta: CC_CUSTEIO, depto: DEPTO_ADM, viagem: 3 },
  { item: I(7), valor: 380, conta: CC_ADM, depto: DEPTO_ADM, viagem: 3 },
  { item: I(8), valor: 720, conta: CC_TERCEIROS, depto: DEPTO_ADM, viagem: 4 },
]
const taxaC = 3000
const baseC = linhas.map((l) => Math.round(l.valor * 100))
const somaC = baseC.reduce((s, v) => s + v, 0)
const partes = baseC.map((v) => Math.floor((v * taxaC) / somaC))
partes[baseC.indexOf(Math.max(...baseC))] += taxaC - partes.reduce((s, v) => s + v, 0)
const totalC = somaC + taxaC

const pdf = Buffer.from(
  "%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj 2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj 3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 200 200]>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF"
)
await db.storage
  .from("compras")
  .upload(PDF, pdf, { contentType: "application/pdf", upsert: true })
  .then(ok("pdf"))

const produto = "Passagens e hospedagens — fatura TS-2026-0915"
const observacao = "Viagens nº 3, 4. Inclui taxa da agência de R$ 30,00."
await db
  .from("compras_solicitacoes")
  .insert({
    id: PROCESSO,
    codigo: "2026.0921.1030.4410",
    aquisicao_direta: true,
    solicitante_id: DEMO,
    solicitacao_produto: produto,
    solicitacao_e_produto: false,
    solicitacao_observacao: observacao,
    solicitacao_departamento_id: DEPTO_ADM,
    solicitacao_centro_custo_id: CC_TERCEIROS,
    cancelado: false,
    em_cotacao: false,
    comprado: true,
    comprado_por_id: DEMO,
    compra_data: "2026-09-21",
    compra_valor: totalC / 100,
    compra_fornecedor_id: TECH,
    comprovante_url: PDF,
    recebido: true,
    recebimento_data: "2026-09-21",
    recebimento_recebido_por_id: DEMO,
    estocavel: false,
    emp_proprietaria_id: D,
  })
  .then(ok("processo"))
await db
  .from("ordens_pagamento")
  .insert({
    id: ORDEM,
    codigo: "2026.0921.1030.4417",
    tipo: "Compras",
    descricao: `Compra direta — ${produto}`,
    situacao: "Em autorização",
    valor_inicial_cobranca: totalC / 100,
    forma_pagamento: "Boleto",
    vencimento: "2026-10-06",
    beneficiario_fornecedor_id: TECH,
    departamento_id: DEPTO_ADM,
    centro_custo_despesa_id: CC_TERCEIROS,
    arquivo_nota_fiscal: PDF,
    processo_compra_id: PROCESSO,
    excluido: false,
    emp_proprietaria_id: D,
  })
  .then(ok("ordem"))
await db
  .from("compras_fornecimentos")
  .insert({
    id: FORNECIMENTO,
    processo_id: PROCESSO,
    fornecedor_id: TECH,
    valor: totalC / 100,
    forma_pagamento: "Boleto",
    comprador_id: DEMO,
    data_compra: "2026-09-21",
    nota_fiscal_url: PDF,
    ordem_pagamento_id: ORDEM,
    recebido: true,
    recebimento_data: "2026-09-21",
    recebimento_recebido_por_id: DEMO,
    recebimento_de_acordo: true,
    recebimento_observacao: "Item avaliado no ato da compra.",
    emp_proprietaria_id: D,
  })
  .then(ok("fornecimento"))

const grupos = new Map()
linhas.forEach((l, i) => {
  const g = grupos.get(l.conta) ?? { valorC: 0, viagens: new Set(), n: 0 }
  g.valorC += baseC[i] + partes[i]
  g.viagens.add(l.viagem)
  g.n++
  grupos.set(l.conta, g)
})
await db
  .from("ordens_pagamento_rateio")
  .insert(
    [...grupos]
      .sort((a, b) => b[1].valorC - a[1].valorC)
      .map(([conta, g], i) => ({
        ordem_id: ORDEM,
        centro_custo_despesa_id: conta,
        departamento_id: DEPTO_ADM,
        descricao: `Viagens nº ${[...g.viagens].join(", ")} — ${g.n} ${g.n === 1 ? "item" : "itens"}`,
        valor: g.valorC / 100,
        ordem: i,
        emp_proprietaria_id: D,
      }))
  )
  .then(ok("rateio"))

await db
  .from("viagens_faturas")
  .insert({
    id: FATURA,
    emp_proprietaria_id: D,
    fornecedor_id: TECH,
    numero: "TS-2026-0915",
    emissao: "2026-09-21",
    vencimento: "2026-10-06",
    forma_pagamento: "Boleto",
    departamento_id: DEPTO_ADM,
    valor_itens: somaC / 100,
    valor_taxas: taxaC / 100,
    valor_total: totalC / 100,
    arquivo: PDF,
    processo_compra_id: PROCESSO,
    ordem_pagamento_id: ORDEM,
    criado_por: DEMO,
  })
  .then(ok("fatura"))
for (const l of linhas) {
  await db
    .from("viagens_itens")
    .update({ fatura_id: FATURA, centro_custo_id: l.conta })
    .eq("id", l.item)
    .then(ok("item faturado"))
}

console.log(`Semente de Viagens pronta: 6 viagens, 11 itens, fatura de R$ ${(totalC / 100).toFixed(2)}.`)
