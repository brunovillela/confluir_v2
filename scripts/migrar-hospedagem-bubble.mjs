// Hospedagem do Bubble → Supabase. Traz hotéis, tarifas, serviços (as
// reservas de quarto) e cupons (os hóspedes).
//
// Tipos no Bubble e o que vira aqui:
//   hospedagemhoteis   → hospedagem_hotel
//   hospedagemtarifas  → hospedagem_tarifas
//   hospedagemserviço  → hospedagem_servico   (o quarto reservado)
//   hospedagemcupom    → hospedagem_cupom     (cada hóspede)
// (hospedagemfatura, hospedagemacomodaçõesfixas, hospedagemcoletiva e
//  hospedagem-reembolso estão VAZIOS no Bubble — nada a trazer.)
//
// Repetível: casa pelo bubble_id e só atualiza o que mudou na ORIGEM. Nunca
// mexe no que é do Confluir — a demanda garantida escreve `token`,
// `confirmar_ate`, `presenca_*`, `quarto` e `reserva_garantida` no cupom, e
// esses campos não existem no Bubble.
//
//   node scripts/migrar-hospedagem-bubble.mjs                 (simulação)
//   node scripts/migrar-hospedagem-bubble.mjs --apply [--tenant <uuid>]
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
const args = process.argv.slice(2)
const APLICAR = args.includes("--apply")
const i = args.indexOf("--tenant")
const TENANT = i >= 0 ? args[i + 1] : "c763cb99-edfd-4840-8453-ed3fcb66d4a1"
// Sem "version-test": os dados de PRODUÇÃO (a versão de teste está quase vazia).
const RAIZ = env.BUBBLE_API_ROOT.replace(/\/obj\/?$/, "").replace("/version-test", "") + "/obj/"

const texto = (v) => (String(v ?? "").trim() ? String(v).trim() : null)
const numero = (v) => (typeof v === "number" && Number.isFinite(v) ? v : null)
const data = (v) => (v ? String(v).slice(0, 10) : null)
const sim = (v) => v === true
const url = (v) => {
  const s = texto(v)
  return s ? (s.startsWith("//") ? `https:${s}` : s) : null
}
const mesmoNumero = (a, b) => Number(a ?? 0) === Number(b ?? 0)

async function bubble(tipo) {
  const todos = []
  for (let cursor = 0; ; ) {
    const r = await fetch(`${RAIZ}${encodeURIComponent(tipo)}?limit=100&cursor=${cursor}`, {
      headers: { Authorization: `Bearer ${env.BUBBLE_API_TOKEN}` },
    })
    if (!r.ok) throw new Error(`Bubble ${tipo}: HTTP ${r.status}`)
    const { response } = await r.json()
    todos.push(...response.results)
    cursor += response.results.length
    if (!response.remaining) break
  }
  return todos
}

async function tudo(tabela, colunas, filtro = (q) => q) {
  const linhas = []
  for (let de = 0; ; de += 1000) {
    const { data: d, error } = await filtro(db.from(tabela).select(colunas)).range(de, de + 999)
    if (error) throw new Error(`${tabela}: ${error.message}`)
    linhas.push(...d)
    if (d.length < 1000) break
  }
  return linhas
}

/** Aplica inserts em lote e updates um a um; devolve quantos deram certo. */
async function gravar(tabela, inserir, atualizar) {
  if (!APLICAR) return { inseridos: 0, atualizados: 0 }
  let inseridos = 0
  for (let k = 0; k < inserir.length; k += 200) {
    const lote = inserir.slice(k, k + 200)
    const { error } = await db.from(tabela).insert(lote)
    if (error) throw new Error(`${tabela} (insert): ${error.message}`)
    inseridos += lote.length
  }
  let atualizados = 0
  for (const a of atualizar) {
    const { id, ...campos } = a
    const { error } = await db.from(tabela).update(campos).eq("id", id)
    if (error) console.log(`  ✘ ${tabela} ${id}: ${error.message}`)
    else atualizados++
  }
  return { inseridos, atualizados }
}

console.log(APLICAR ? "APLICANDO" : "SIMULAÇÃO — nada será gravado", `· tenant ${TENANT}\n`)

const [hoteisBubble, tarifasBubble, servicosBubble, cuponsBubble] = await Promise.all([
  bubble("hospedagemhoteis"),
  bubble("hospedagemtarifas"),
  bubble("hospedagemserviço"),
  bubble("hospedagemcupom"),
])

// De-para dos tipos que a hospedagem aponta (já migrados por outros scripts).
const [empresas, contratos, filiacoes] = await Promise.all([
  tudo("empresa", "id, bubble_id", (q) => q.not("bubble_id", "is", null)),
  tudo("contratos", "id, bubble_id", (q) => q.not("bubble_id", "is", null)),
  tudo("filiacoes", "id, bubble_id", (q) =>
    q.eq("emp_proprietaria_id", TENANT).not("bubble_id", "is", null)
  ),
])
const idEmpresa = new Map(empresas.map((e) => [e.bubble_id, e.id]))
const idContrato = new Map(contratos.map((c) => [c.bubble_id, c.id]))
const idFiliacao = new Map(filiacoes.map((f) => [f.bubble_id, f.id]))

// ── 1. Hotéis ────────────────────────────────────────────────────────────────
const hoteisAqui = await tudo(
  "hospedagem_hotel",
  "id, bubble_id, nome, ativo, demanda_garantida, quant_quartos_dedicados, max_hospedes_por_quarto, max_hospedes_por_dia, foto, empresa_id, contrato_id",
  (q) => q.eq("emp_proprietaria_id", TENANT)
)
const hotelPorBubble = new Map(hoteisAqui.filter((h) => h.bubble_id).map((h) => [h.bubble_id, h]))
const hoteisNovos = []
const hoteisMudados = []
for (const h of hoteisBubble) {
  const campos = {
    nome: texto(h.Nome) ?? "(sem nome)",
    ativo: h["Ativo?"] !== false,
    demanda_garantida: sim(h["Demanda garantida?"]),
    quant_quartos_dedicados: numero(h["Quant quartos dedicados"]),
    max_hospedes_por_quarto: numero(h["Máx. hóspedes por quarto"]),
    max_hospedes_por_dia: numero(h["Máx. hóspedes por dia"]),
    // Ligações e arquivo: só PREENCHEM o que falta. O Bubble omite campo
    // vazio, e limpar uma ligação boa daqui seria perda de dado.
    foto: url(h.Foto) ?? null,
    empresa_id: idEmpresa.get(h.EMPRESA) ?? null,
    contrato_id: idContrato.get(h.CONTRATO) ?? null,
  }
  const atual = hotelPorBubble.get(h._id)
  if (atual) {
    campos.foto = campos.foto ?? atual.foto ?? null
    campos.empresa_id = campos.empresa_id ?? atual.empresa_id ?? null
    campos.contrato_id = campos.contrato_id ?? atual.contrato_id ?? null
  }
  if (!atual) {
    hoteisNovos.push({
      ...campos,
      bubble_id: h._id,
      emp_proprietaria_id: TENANT,
      created_at: h["Created Date"],
    })
    continue
  }
  const mudou =
    atual.nome !== campos.nome ||
    atual.ativo !== campos.ativo ||
    atual.demanda_garantida !== campos.demanda_garantida ||
    !mesmoNumero(atual.quant_quartos_dedicados, campos.quant_quartos_dedicados) ||
    !mesmoNumero(atual.max_hospedes_por_quarto, campos.max_hospedes_por_quarto) ||
    !mesmoNumero(atual.max_hospedes_por_dia, campos.max_hospedes_por_dia) ||
    (atual.empresa_id ?? null) !== campos.empresa_id ||
    (atual.contrato_id ?? null) !== campos.contrato_id
  if (mudou) hoteisMudados.push({ id: atual.id, ...campos })
}
console.log(`hotéis · Bubble ${hoteisBubble.length} · aqui ${hoteisAqui.length}`)
console.log(`  a inserir: ${hoteisNovos.length} · a atualizar: ${hoteisMudados.length}`)
for (const h of hoteisNovos) console.log(`    + ${h.nome}`)
for (const h of hoteisMudados) console.log(`    ~ ${h.nome}`)
const resHoteis = await gravar("hospedagem_hotel", hoteisNovos, hoteisMudados)

// Recarrega o de-para dos hotéis (os novos só existem depois do insert).
const hoteisFinal = APLICAR
  ? await tudo("hospedagem_hotel", "id, bubble_id", (q) => q.eq("emp_proprietaria_id", TENANT))
  : hoteisAqui
const idHotel = new Map(hoteisFinal.filter((h) => h.bubble_id).map((h) => [h.bubble_id, h.id]))

// ── 2. Tarifas ───────────────────────────────────────────────────────────────
const tarifasAqui = await tudo(
  "hospedagem_tarifas",
  "id, bubble_id, custo_por_filiado, custo_entidade, pessoas_por_quarto, hotel_id"
)
const tarifaPorBubble = new Map(tarifasAqui.filter((t) => t.bubble_id).map((t) => [t.bubble_id, t]))
const tarifasNovas = []
const tarifasMudadas = []
const semHotel = { tarifas: 0, servicos: 0, cupons: 0 }
for (const t of tarifasBubble) {
  const hotelId = idHotel.get(t.HOTEL) ?? null
  if (!hotelId) {
    semHotel.tarifas++
    continue
  }
  const campos = {
    custo_por_filiado: numero(t["Custo por filiado"]),
    custo_entidade: numero(t["Custo entidade"]),
    pessoas_por_quarto: numero(t["Pessoas por quarto"]),
    hotel_id: hotelId,
  }
  const atual = tarifaPorBubble.get(t._id)
  if (!atual) {
    tarifasNovas.push({ ...campos, bubble_id: t._id, created_at: t["Created Date"] })
    continue
  }
  if (
    !mesmoNumero(atual.custo_por_filiado, campos.custo_por_filiado) ||
    !mesmoNumero(atual.custo_entidade, campos.custo_entidade) ||
    !mesmoNumero(atual.pessoas_por_quarto, campos.pessoas_por_quarto) ||
    atual.hotel_id !== campos.hotel_id
  ) {
    tarifasMudadas.push({ id: atual.id, ...campos })
  }
}
console.log(`\ntarifas · Bubble ${tarifasBubble.length} · aqui ${tarifasAqui.length}`)
console.log(`  a inserir: ${tarifasNovas.length} · a atualizar: ${tarifasMudadas.length}`)
const resTarifas = await gravar("hospedagem_tarifas", tarifasNovas, tarifasMudadas)

// ── 3. Serviços (o quarto reservado) ─────────────────────────────────────────
const servicosAqui = await tudo(
  "hospedagem_servico",
  "id, bubble_id, codigo, checkin_date, checkout_date, sexo, coletivo, finalizado, custo_entidade, quant_ocupantes, relatorio, hotel_id",
  (q) => q.eq("emp_proprietaria_id", TENANT)
)
const servicoPorBubble = new Map(
  servicosAqui.filter((s) => s.bubble_id).map((s) => [s.bubble_id, s])
)
const servicosNovos = []
const servicosMudados = []
for (const s of servicosBubble) {
  const hotelId = idHotel.get(s.HOTEL) ?? null
  if (!hotelId) {
    semHotel.servicos++
    continue
  }
  const campos = {
    codigo: texto(s["Código"]),
    checkin_date: data(s.Checkin),
    checkout_date: data(s.Checkout),
    sexo: texto(s.SEXO),
    coletivo: sim(s["Coletivo?"]),
    finalizado: sim(s["Finalizado?"]),
    custo_entidade: numero(s["Tarifa entidade"]),
    quant_ocupantes: numero(s["Quant ocupantes"]),
    relatorio: url(s["Relatório da hospedagem"]),
    hotel_id: hotelId,
  }
  const atual = servicoPorBubble.get(s._id)
  // O relatório pode já ter sido baixado para o bucket — não apaga o caminho.
  if (atual) campos.relatorio = campos.relatorio ?? atual.relatorio ?? null
  if (!atual) {
    servicosNovos.push({
      ...campos,
      bubble_id: s._id,
      emp_proprietaria_id: TENANT,
      created_at: s["Created Date"],
    })
    continue
  }
  const mudou =
    (atual.codigo ?? null) !== campos.codigo ||
    (atual.checkin_date ?? null) !== campos.checkin_date ||
    (atual.checkout_date ?? null) !== campos.checkout_date ||
    (atual.sexo ?? null) !== campos.sexo ||
    atual.coletivo !== campos.coletivo ||
    atual.finalizado !== campos.finalizado ||
    !mesmoNumero(atual.custo_entidade, campos.custo_entidade) ||
    !mesmoNumero(atual.quant_ocupantes, campos.quant_ocupantes) ||
    (atual.relatorio ?? null) !== campos.relatorio ||
    atual.hotel_id !== campos.hotel_id
  if (mudou) servicosMudados.push({ id: atual.id, ...campos })
}
console.log(`\nserviços · Bubble ${servicosBubble.length} · aqui ${servicosAqui.length}`)
console.log(`  a inserir: ${servicosNovos.length} · a atualizar: ${servicosMudados.length}`)
const porAno = {}
for (const s of servicosNovos) {
  const ano = (s.checkin_date ?? "sem data").slice(0, 4)
  porAno[ano] = (porAno[ano] ?? 0) + 1
}
if (servicosNovos.length) console.log("  novos por ano de check-in:", porAno)
const resServicos = await gravar("hospedagem_servico", servicosNovos, servicosMudados)

const servicosFinal = APLICAR
  ? await tudo("hospedagem_servico", "id, bubble_id", (q) => q.eq("emp_proprietaria_id", TENANT))
  : servicosAqui
const idServico = new Map(servicosFinal.filter((s) => s.bubble_id).map((s) => [s.bubble_id, s.id]))

// No Bubble quem guarda a ligação é o SERVIÇO (lista HÓSPEDES) — o cupom não
// tem campo de volta. Daí o de-para cupom → serviço sair daqui.
const servicoDoCupom = new Map()
for (const s of servicosBubble) {
  for (const cupomId of s["HÓSPEDES"] ?? []) servicoDoCupom.set(cupomId, s._id)
}

// ── 4. Cupons (cada hóspede) ─────────────────────────────────────────────────
const cuponsAqui = await tudo(
  "hospedagem_cupom",
  "id, bubble_id, check_in, sexo, cancelado, compareceu, tarifa_hospede, aceita_quarto_coletivo, servico_id, filiado_id, hotel_id"
)
const cupomPorBubble = new Map(cuponsAqui.filter((c) => c.bubble_id).map((c) => [c.bubble_id, c]))
const cuponsNovos = []
const cuponsMudados = []
const semFiliado = []
for (const c of cuponsBubble) {
  const hotelId = idHotel.get(c.HOTEL) ?? null
  if (!hotelId) {
    semHotel.cupons++
    continue
  }
  const filiadoId = idFiliacao.get(c.FILIADO) ?? null
  if (!filiadoId) semFiliado.push(c._id)
  const campos = {
    check_in: data(c["Check in"]),
    sexo: texto(c.SEXO),
    cancelado: sim(c["Cancelado?"]),
    compareceu: sim(c["Compareceu?"]),
    tarifa_hospede: numero(c["Tarifa hóspede"]),
    aceita_quarto_coletivo: sim(c["Aceita quarto coletivo?"]),
    servico_id: idServico.get(servicoDoCupom.get(c._id)) ?? null,
    filiado_id: filiadoId,
    hotel_id: hotelId,
  }
  const atual = cupomPorBubble.get(c._id)
  if (!atual) {
    cuponsNovos.push({ ...campos, bubble_id: c._id, created_at: c["Created Date"] })
    continue
  }
  const mudou =
    (atual.check_in ?? null) !== campos.check_in ||
    (atual.sexo ?? null) !== campos.sexo ||
    atual.cancelado !== campos.cancelado ||
    atual.compareceu !== campos.compareceu ||
    !mesmoNumero(atual.tarifa_hospede, campos.tarifa_hospede) ||
    atual.aceita_quarto_coletivo !== campos.aceita_quarto_coletivo ||
    // Só liga o serviço/filiado que ainda falta — não desfaz ligação daqui.
    (campos.servico_id && atual.servico_id !== campos.servico_id) ||
    (campos.filiado_id && atual.filiado_id !== campos.filiado_id) ||
    atual.hotel_id !== campos.hotel_id
  if (mudou) {
    cuponsMudados.push({
      id: atual.id,
      ...campos,
      servico_id: campos.servico_id ?? atual.servico_id,
      filiado_id: campos.filiado_id ?? atual.filiado_id,
    })
  }
}
console.log(`\ncupons · Bubble ${cuponsBubble.length} · aqui ${cuponsAqui.length}`)
console.log(`  a inserir: ${cuponsNovos.length} · a atualizar: ${cuponsMudados.length}`)
console.log(
  `  sem serviço ligado: ${cuponsNovos.filter((c) => !c.servico_id).length} · sem filiado no cadastro: ${semFiliado.length}`
)
const resCupons = await gravar("hospedagem_cupom", cuponsNovos, cuponsMudados)

if (semHotel.tarifas + semHotel.servicos + semHotel.cupons > 0) {
  console.log("\nfora por hotel desconhecido:", semHotel)
}

if (APLICAR) {
  console.log(
    `\nGRAVADO · hotéis +${resHoteis.inseridos}/~${resHoteis.atualizados}` +
      ` · tarifas +${resTarifas.inseridos}/~${resTarifas.atualizados}` +
      ` · serviços +${resServicos.inseridos}/~${resServicos.atualizados}` +
      ` · cupons +${resCupons.inseridos}/~${resCupons.atualizados}`
  )
} else {
  console.log("\nPara gravar: node scripts/migrar-hospedagem-bubble.mjs --apply")
}
