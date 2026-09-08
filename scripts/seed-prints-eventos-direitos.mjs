// ===========================================================================
// seed-prints-eventos-direitos.mjs — dados FICTÍCIOS no tenant de DEMONSTRAÇÃO
// para os prints do módulo Eventos e das telas novas de Filiados.
// ---------------------------------------------------------------------------
// Preso ao tenant demo (11111111-…). O tenant real NUNCA é tocado — há uma
// trava explícita no começo.
//
// Idempotente: apaga o que ele mesmo criou (por faixa de id) e reinsere.
//
// USO:  node scripts/seed-prints-eventos-direitos.mjs
// ===========================================================================

import { createClient } from "@supabase/supabase-js"
import { readFileSync } from "node:fs"

const DEMO = "11111111-1111-4111-8111-111111111111"
const TENANT_REAL = "c763cb99-edfd-4840-8453-ed3fcb66d4a1"

const env = Object.fromEntries(
  readFileSync(".env.local", "utf8")
    .split(/\r?\n/)
    .filter((l) => l.includes("=") && !l.trim().startsWith("#"))
    .map((l) => {
      const i = l.indexOf("=")
      return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^"|"$/g, "")]
    })
)
const c = createClient(
  env.NEXT_PUBLIC_SUPABASE_URL,
  env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false } }
)

if (DEMO === TENANT_REAL) {
  console.log("Trava: o tenant demo não pode ser o real.")
  process.exit(1)
}

// IDs fixos — a faixa e0e0… é deste seed, e só dele.
const EV = "e0e0e0e0-0000-4000-8000-000000000001"
const DIA1 = "e0e0e0e0-0000-4000-8000-000000000011"
const DIA2 = "e0e0e0e0-0000-4000-8000-000000000012"
const CAMPO1 = "e0e0e0e0-0000-4000-8000-000000000021"
const CAMPO2 = "e0e0e0e0-0000-4000-8000-000000000022"
const insc = (n) => `e0e0e0e0-0000-4000-8000-0000000001${String(n).padStart(2, "0")}`

const ok = (r, oque) => {
  if (r.error) console.log(`  ! ${oque}: ${r.error.message}`)
  return !r.error
}

// ── limpeza ────────────────────────────────────────────────────────────────
// A ORDEM importa: lgpd_solicitacoes aponta para eventos_inscricoes, que
// aponta para eventos. Apagar de fora para dentro — e conferindo o erro, senão
// a falha some e o insert seguinte estoura com "duplicate key".
console.log("Limpando o que este seed criou…")
for (const tabela of [
  "lgpd_solicitacoes",
  "eventos_presencas",
  "eventos_inscricao_respostas",
  "eventos_inscricoes",
  "eventos_campos",
  "eventos_dias",
  "eventos",
  "filiacao_suspensoes",
]) {
  const { error } = await c
    .from(tabela)
    .delete()
    .eq("emp_proprietaria_id", DEMO)
  if (error) {
    console.log(`  ! nao consegui limpar ${tabela}: ${error.message}`)
    process.exit(1)
  }
}

// ── datas ──────────────────────────────────────────────────────────────────
const dia = (n) => {
  const d = new Date()
  d.setDate(d.getDate() + n)
  return d
}
// Horário de Brasília. `setHours` já é local (a máquina roda em BRT); somar 3
// dava um evento que começa às 12h quando se pediu 9h.
const iso = (d, h = 19, m = 0) => {
  const x = new Date(d)
  x.setHours(h, m, 0, 0)
  return x.toISOString()
}
// Data pura (YYYY-MM-DD) no fuso local. Fatiar o ISO em UTC empurrava o dia
// para a frente à noite — os dias do evento saíam um dia depois do início.
const dataIso = (d) => {
  const x = new Date(d)
  return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, "0")}-${String(x.getDate()).padStart(2, "0")}`
}

// ── 1. Configuração e termos do módulo ─────────────────────────────────────
console.log("Configuração de eventos…")
ok(
  await c.from("eventos_config").upsert(
    {
      emp_proprietaria_id: DEMO,
      modo_foto: "visual",
      retencao_foto_dias: 30,
      controle_acesso_nome: "Portaria Central",
      controle_acesso_exclusao_manual: true,
    },
    { onConflict: "emp_proprietaria_id" }
  ),
  "eventos_config"
)

const { data: termos } = await c
  .from("eventos_termos")
  .select("id, tipo")
  .eq("emp_proprietaria_id", DEMO)
  .eq("em_vigor", true)
if ((termos ?? []).length === 0) {
  ok(
    await c.from("eventos_termos").insert([
      {
        emp_proprietaria_id: DEMO,
        tipo: "inscricao",
        versao: 1,
        em_vigor: true,
        texto:
          "Ao se inscrever, você autoriza a entidade a tratar os dados informados (nome, CPF, e-mail e telefone) com a finalidade de organizar sua participação neste evento.",
      },
      {
        emp_proprietaria_id: DEMO,
        tipo: "foto_visual",
        versao: 1,
        em_vigor: true,
        texto:
          "Sua foto será usada apenas para conferência na recepção, por uma pessoa da equipe, e apagada no prazo informado após o fim do evento.",
      },
    ]),
    "eventos_termos"
  )
}

// ── 2. O evento ────────────────────────────────────────────────────────────
console.log("Evento de demonstração…")
ok(
  await c.from("eventos").insert({
    id: EV,
    emp_proprietaria_id: DEMO,
    slug: "encontro-de-formacao-sindical",
    titulo: "Encontro de Formação Sindical",
    descricao:
      "Dois dias de formação sobre negociação coletiva, saúde do trabalhador e organização por local de trabalho. Café da manhã e almoço incluídos.",
    local: "Auditório da Sede",
    endereco: "Rua das Palmeiras, 120 — Centro",
    inicio: iso(dia(21), 9, 0),
    termino: iso(dia(22), 17, 0),
    lotacao_maxima: 120,
    overbooking_percentual: 10,
    cota_convidados: 20,
    exige_aprovacao: false,
    confirma_filiado_automatico: true,
    exige_foto: false,
    exige_rsvp: true,
    rsvp_abre_em: iso(dia(-2), 9, 0),
    inscricoes_abrem_em: iso(dia(-20), 9, 0),
    inscricoes_fecham_em: iso(dia(18), 23, 59),
    situacao: "publicado",
  }),
  "evento"
)

ok(
  await c.from("eventos_dias").insert([
    {
      id: DIA1,
      emp_proprietaria_id: DEMO,
      evento_id: EV,
      data: dataIso(dia(21)),
      rotulo: "Primeiro dia",
      ordem: 1,
    },
    {
      id: DIA2,
      emp_proprietaria_id: DEMO,
      evento_id: EV,
      data: dataIso(dia(22)),
      rotulo: "Segundo dia",
      ordem: 2,
    },
  ]),
  "dias"
)

ok(
  await c.from("eventos_campos").insert([
    {
      id: CAMPO1,
      emp_proprietaria_id: DEMO,
      evento_id: EV,
      rotulo: "Restrição alimentar",
      tipo: "selecao",
      opcoes: ["Sem restrição", "Vegetariana", "Vegana", "Sem glúten"],
      ajuda: "Usamos para fechar o cardápio com o buffet.",
      obrigatorio: true,
      ordem: 1,
      ativo: true,
    },
    {
      id: CAMPO2,
      emp_proprietaria_id: DEMO,
      evento_id: EV,
      rotulo: "Precisa de transporte da rodoviária?",
      tipo: "sim_nao",
      ajuda: null,
      obrigatorio: false,
      ordem: 2,
      ativo: true,
    },
  ]),
  "campos"
)

// ── 3. Inscrições: público, portal e convidados ────────────────────────────
console.log("Inscrições…")
const { data: operador } = await c
  .from("usuarios")
  .select("id")
  .eq("emp_proprietaria_id", DEMO)
  .limit(1)
  .maybeSingle()
const { data: filiadosDemo } = await c
  .from("filiacoes")
  .select("id, nome_completo, cpf")
  .eq("emp_proprietaria_id", DEMO)
  .limit(6)
const { data: todosFiliados } = await c
  .from("filiacoes")
  .select("id, nome_completo, cpf")
  .eq("emp_proprietaria_id", DEMO)
  .order("nome_completo")
// A fonte pagadora que o seed base da demo já criou.
const FONTE = "f0f0f0f0-0000-4000-8000-000000000001"

const PESSOAS = [
  ["Marina Álvares Coutinho", "11144477735", "marina@exemplo.com.br", "publica", "confirmada", true],
  ["Rogério Tavares Lima", "12345678909", "rogerio@exemplo.com.br", "portal", "confirmada", true],
  ["Cláudia Bezerra Nunes", "98765432100", "claudia@exemplo.com.br", "publica", "confirmada", false],
  ["Wesley Prado Martins", "22233344405", "wesley@exemplo.com.br", "publica", "pendente", null],
  ["Heloísa Campos Ferraz", "52998224725", "heloisa@exemplo.com.br", "publica", "lista_espera", null],
]

const linhas = PESSOAS.map(([nome, cpf, email, origem, situacao, rsvp], i) => ({
  id: insc(i + 1),
  emp_proprietaria_id: DEMO,
  evento_id: EV,
  nome,
  cpf,
  email,
  telefone: `2299${String(880000 + i).slice(0, 6)}`,
  origem,
  situacao,
  email_confirmado_em: situacao === "pendente" ? null : new Date().toISOString(),
  rsvp_confirmado: rsvp,
  rsvp_enviado_em: rsvp === null ? null : new Date().toISOString(),
  rsvp_respondido_em: rsvp === null ? null : new Date().toISOString(),
  filiacao_id:
    origem === "portal" ? (filiadosDemo?.[0]?.id ?? null) : null,
}))

// Convidados da diretoria, lançados por dentro.
const CONVIDADOS = [
  ["Dr. Anselmo Pires Rebouças", "24413815008", "Diretoria", "painel"],
  ["Vereadora Lúcia Andrade", "16899535009", "Presidência", "planilha"],
  ["Jornalista Tiago Meireles", "87753963070", "Comunicação", "planilha"],
]
linhas.push(
  ...CONVIDADOS.map(([nome, cpf, convidadoPor, origem], i) => ({
    id: insc(20 + i),
    emp_proprietaria_id: DEMO,
    evento_id: EV,
    nome,
    cpf,
    email: null,
    telefone: null,
    origem,
    situacao: "confirmada",
    convidado_por: convidadoPor,
    reservada_por: operador?.id ?? null,
  }))
)

ok(await c.from("eventos_inscricoes").insert(linhas), "inscricoes")

// Respostas dos campos extras, para a ficha não parecer vazia.
ok(
  await c.from("eventos_inscricao_respostas").insert([
    {
      emp_proprietaria_id: DEMO,
      inscricao_id: insc(1),
      campo_id: CAMPO1,
      rotulo: "Restrição alimentar",
      valor: "Vegetariana",
    },
    {
      emp_proprietaria_id: DEMO,
      inscricao_id: insc(2),
      campo_id: CAMPO1,
      rotulo: "Restrição alimentar",
      valor: "Sem restrição",
    },
  ]),
  "respostas"
)

// Presenças no primeiro dia — alimenta o indicador de comparecimento.
ok(
  await c.from("eventos_presencas").insert(
    [insc(1), insc(2), insc(20)].map((id) => ({
      emp_proprietaria_id: DEMO,
      inscricao_id: id,
      dia_id: DIA1,
      metodo: "busca",
      confirmada_por: operador?.id ?? null,
    }))
  ),
  "presencas"
)

// ── 4. Pedidos de LGPD ─────────────────────────────────────────────────────
console.log("Pedidos de LGPD…")
ok(
  await c.from("lgpd_solicitacoes").insert([
    {
      emp_proprietaria_id: DEMO,
      tipo: "exclusao",
      email_titular: "participante.antigo@exemplo.com.br",
      inscricao_id: insc(3),
      solicitado_em: dataIso(dia(-3)),
      concluido_em: iso(dia(-3)),
      registros_anonimizados: "1",
      base_legal_retencao:
        "Registro de presença mantido de forma anonimizada para indicadores do evento (art. 16, II e IV).",
      acesso_remocao_pendente: true,
    },
    {
      emp_proprietaria_id: DEMO,
      tipo: "correcao",
      email_titular: "marina@exemplo.com.br",
      inscricao_id: insc(1),
      solicitado_em: dataIso(dia(-10)),
      concluido_em: iso(dia(-10)),
      observacao: "Correção feita pelo próprio titular no canal de eventos.",
      acesso_remocao_pendente: false,
    },
  ]),
  "lgpd_solicitacoes"
)

// ── 5. Carência, inadimplência e efeito suspensivo ─────────────────────────
console.log("Carência e inadimplência…")
for (const [beneficio, dias, ativo, obs] of [
  ["votacao", 180, true, "art. 12 do estatuto"],
  ["hospedagem", 90, true, null],
  ["juridico", 365, true, "art. 14, §2º"],
  ["saude", 0, false, null],
  ["eventos", 0, false, null],
]) {
  ok(
    await c.from("filiacao_carencias").upsert(
      {
        emp_proprietaria_id: DEMO,
        beneficio,
        dias,
        ativo,
        observacao: obs,
        atualizada_por: operador?.id ?? null,
      },
      { onConflict: "emp_proprietaria_id,beneficio" }
    ),
    `carencia ${beneficio}`
  )
}

for (const [tipo, quantidade, consecutivas, janela, ativo] of [
  ["Associativa", 3, true, 12, true],
  ["Assistencial", 2, false, 6, false],
]) {
  ok(
    await c.from("filiacao_inadimplencia_regras").upsert(
      {
        emp_proprietaria_id: DEMO,
        tipo,
        quantidade,
        exigir_consecutivas: consecutivas,
        janela_remessas: janela,
        ativo,
        atualizada_por: operador?.id ?? null,
      },
      { onConflict: "emp_proprietaria_id,tipo" }
    ),
    `regra ${tipo}`
  )
}

const suspensaoCarencia = todosFiliados?.find((f) =>
  f.nome_completo?.startsWith("Mariana")
)
if (suspensaoCarencia?.cpf) {
  ok(
    await c.from("filiacao_suspensoes").insert({
      emp_proprietaria_id: DEMO,
      cpf: suspensaoCarencia.cpf,
      escopo: "carencia",
      alvo: null,
      motivo:
        "Trocou de empregador em março, sem interrupção da filiação — a contagem não deve recomeçar.",
      concedida_por: operador?.id ?? null,
    }),
    "suspensao carencia"
  )
}
const suspensaoInadimplencia = todosFiliados?.find((f) =>
  f.nome_completo?.startsWith("Camila")
)
if (suspensaoInadimplencia?.cpf) {
  ok(
    await c.from("filiacao_suspensoes").insert({
      emp_proprietaria_id: DEMO,
      cpf: suspensaoInadimplencia.cpf,
      escopo: "inadimplencia",
      alvo: "Associativa",
      motivo:
        "Afastada pelo INSS desde janeiro; sem desconto em folha por motivo alheio à vontade dela.",
      vigencia_ate: dataIso(dia(180)),
      concedida_por: operador?.id ?? null,
    }),
    "suspensao inadimplencia"
  )
}


// ── 5.5 Histórico de filiação e remessas de receita ────────────────────────
// As telas de fichas pendentes e de inadimplentes só ensinam alguma coisa com
// gente dentro. O tenant demo tinha UM vínculo e nenhuma remessa recente: a
// primeira mostrava "1 ativo" e a segunda, "ninguém".
console.log("Histórico de filiação e remessas…")

const vinc = (n) => `e0e0e0e0-0000-4000-8000-0002000000${String(n).padStart(2, "0")}`
const remessa = (n) => `e0e0e0e0-0000-4000-8000-0003000000${String(n).padStart(2, "0")}`
const recebe = (n) => `e0e0e0e0-0000-4000-8000-00040000${String(n).padStart(4, "0")}`

const porNome = (n) => todosFiliados?.find((f) => f.nome_completo?.startsWith(n))

// [nome, situação, ficha]
//   ativo        — condição "Ativo" no cadastro, com vínculo em aberto
//   sem-historico — condição "Ativo" e NENHUM vínculo (metade da base real
//                   está assim: o histórico veio do sistema antigo pela
//                   metade). Contribuem e não têm onde anexar a ficha.
//   desfiliado   — condição "Inativo", vínculo encerrado
//   ficha: "sim" no vínculo corrente | "antiga" num vínculo já encerrado | null
const HISTORICO = [
  ["Antônio", "ativo", null],
  ["Camila", "ativo", null],
  ["Carlos", "ativo", "sim"],
  ["Fernando", "ativo", null],
  ["José", "ativo", "antiga"],
  ["Mariana", "ativo", null],
  ["Patrícia", "desfiliado", "sim"],
  ["Ricardo", "sem-historico", null],
  ["Sônia", "sem-historico", null],
  ["Vanessa", "desfiliado", null],
]

const vinculos = []
let nv = 0
for (const [nome, situacao, ficha] of HISTORICO) {
  const f = porNome(nome)
  if (!f) continue
  if (situacao === "sem-historico") continue
  // Ficha "antiga": um vínculo ENCERRADO com ficha e um novo em aberto sem —
  // é o caso que a etiqueta da tela de pendências existe para marcar.
  if (ficha === "antiga") {
    vinculos.push({
      id: vinc(++nv),
      emp_proprietaria_id: DEMO,
      filiado_id: f.id,
      cargo: "Técnico de Operação",
      matricula: `30${String(nv).padStart(2, "0")}`,
      fonte_pagadora_id: FONTE,
      data_filiacao: "2014-03-10",
      data_desfiliacao: "2021-08-31",
      ficha_filiacao: "demo/ficha-antiga.pdf",
      ficha_filiacao_aceita: true,
      carta_desfiliacao: "demo/carta.pdf",
    })
  }
  const aberto = situacao === "ativo"
  vinculos.push({
    id: vinc(++nv),
    emp_proprietaria_id: DEMO,
    filiado_id: f.id,
    cargo: "Operador de Produção",
    lotacao: "Refinaria",
    matricula: `30${String(nv).padStart(2, "0")}`,
    fonte_pagadora_id: FONTE,
    data_filiacao: nome === "Mariana" ? dataIso(dia(-45)) : "2019-06-03",
    data_desfiliacao: aberto ? null : "2025-11-20",
    ficha_filiacao: ficha === "sim" ? "demo/ficha.pdf" : null,
    ficha_filiacao_aceita: ficha === "sim",
    carta_desfiliacao: aberto ? null : "demo/carta.pdf",
  })
}

// Sete competências de Associativa, da mais antiga para a mais recente.
const COMPETENCIAS = [
  [2026, 3, "Março"],
  [2026, 4, "Abril"],
  [2026, 6, "Junho"],
  [2026, 7, "Julho"],
  [2026, 8, "Agosto"],
  [2026, 9, "Setembro"],
]
const remessas = COMPETENCIAS.map(([ano, mes, rotulo], i) => ({
  id: remessa(i + 1),
  emp_proprietaria_id: DEMO,
  tipo: "Associativa",
  ano: String(ano),
  mes: rotulo,
  ordem: ano * 100 + mes,
  aberto: i === COMPETENCIAS.length - 1,
}))

// Quem NÃO pagou o quê. Camila e Fernando param de pagar e não voltam — são
// os inadimplentes. Sônia tem um buraco antigo mas voltou: a regra de faltas
// SEGUIDAS conta da remessa mais recente para trás, então ela fica de fora.
const NAO_PAGOU = {
  Camila: [202607, 202608, 202609],
  Fernando: [202606, 202607, 202608, 202609],
  Sônia: [202603, 202604],
}
// Quem contribui: todos os ativos, com ou sem histórico de vínculo.
const ativos = HISTORICO.filter(([, sit]) => sit !== "desfiliado").map(([n]) => n)

const linhasRecebe = []
let nr = 0
for (const r of remessas) {
  for (const nome of ativos) {
    const f = porNome(nome)
    if (!f?.cpf) continue
    if ((NAO_PAGOU[nome] ?? []).includes(r.ordem)) continue
    linhasRecebe.push({
      id: recebe(++nr),
      emp_proprietaria_id: DEMO,
      remessa_id: r.id,
      filiado_id: f.id,
      cpf: f.cpf,
      valor: 45,
      fonte_pg_id: FONTE,
    })
  }
}

// Limpeza própria: estas tabelas guardam também linhas de outros seeds da
// demo (a remessa do print de receitas, por exemplo) — apagar por tenant
// levaria junto o que não é meu.
//
// A limpeza varre uma FAIXA FIXA de ids, não a lista que este seed vai
// inserir agora: mudar a composição do elenco encolhe a lista, e o que sobrou
// da rodada anterior ficaria para trás (foi o que aconteceu — uma pessoa que
// deixou de ter vínculo continuou com o vínculo antigo pendurado).
const faixa = (fn, ate) => Array.from({ length: ate }, (_, i) => fn(i + 1))
ok(
  await c.from("filiacao_recebe").delete().in("remessa_id", faixa(remessa, 20)),
  "limpar recebe"
)
ok(
  await c.from("filiacao_recebe_remessa").delete().in("id", faixa(remessa, 20)),
  "limpar remessas"
)
ok(
  await c.from("filiacao_vinculos").delete().in("id", faixa(vinc, 40)),
  "limpar vinculos"
)

// A condição sindical mora no CADASTRO — é ela que responde "está filiado?".
// O histórico de vínculos guarda os empregos; ele pode faltar (e falta, para
// metade da base real) sem que a pessoa deixe de ser filiada.
for (const [nome, situacao] of HISTORICO) {
  const f = porNome(nome)
  if (!f) continue
  ok(
    await c
      .from("filiacoes")
      .update({ filiacao_condicao: situacao === "desfiliado" ? "Inativo" : "Ativo" })
      .eq("id", f.id),
    `condicao ${nome}`
  )
}

// Um vínculo derivado do cadastro antigo, para a etiqueta "reconstruído"
// aparecer no manual. Na base real são 8.537; aqui basta um para ensinar o que
// a etiqueta quer dizer.
if (vinculos.length > 0) {
  vinculos[0].reconstruido_de = "1694090000000x000000000000000001"
  vinculos[0].cargo = null
  vinculos[0].lotacao = null
}

ok(await c.from("filiacao_vinculos").insert(vinculos), "vinculos")
ok(await c.from("filiacao_recebe_remessa").insert(remessas), "remessas")
ok(await c.from("filiacao_recebe").insert(linhasRecebe), "recebe")

// ── 6. Um pleito interno, para o marcador aparecer ─────────────────────────
const { data: assembleia } = await c
  .from("voto_assembleias")
  .select("id")
  .eq("emp_proprietaria_id", DEMO)
  .limit(1)
  .maybeSingle()
if (assembleia) {
  ok(
    await c
      .from("voto_assembleias")
      .update({ somente_filiados: true })
      .eq("id", assembleia.id),
    "assembleia somente_filiados"
  )
}

// ── 7. Convênios, reembolsos e outros contatos ─────────────────────────────
// As três telas que passaram a ler as tabelas novas da virada (08/09). Tudo
// em faixas fixas de id, como acima; a limpeza vai de fora para dentro.
const cat = (n) => `e0e0e0e0-0000-4000-8000-0005000000${String(n).padStart(2, "0")}`
const conv = (n) => `e0e0e0e0-0000-4000-8000-0006000000${String(n).padStart(2, "0")}`
const unid = (n) => `e0e0e0e0-0000-4000-8000-0007000000${String(n).padStart(2, "0")}`
const empr = (n) => `e0e0e0e0-0000-4000-8000-0008000000${String(n).padStart(2, "0")}`
const ende = (n) => `e0e0e0e0-0000-4000-8000-0009000000${String(n).padStart(2, "0")}`
const mail = (n) => `e0e0e0e0-0000-4000-8000-0010000000${String(n).padStart(2, "0")}`
const fone = (n) => `e0e0e0e0-0000-4000-8000-0011000000${String(n).padStart(2, "0")}`
const proj = (n) => `e0e0e0e0-0000-4000-8000-0012000000${String(n).padStart(2, "0")}`
const ordem = (n) => `e0e0e0e0-0000-4000-8000-0013000000${String(n).padStart(2, "0")}`
const reemb = (n) => `e0e0e0e0-0000-4000-8000-0014000000${String(n).padStart(2, "0")}`

for (const [tabela, fn] of [
  ["filiacao_reembolsos", reemb],
  ["filiacao_convenios_unidades", unid],
  ["filiacao_convenios", conv],
  ["filiacao_convenios_categorias", cat],
  ["emails", mail],
  ["telefones", fone],
  ["enderecos", ende],
  ["ordens_pagamento", ordem],
  ["projeto", proj],
  ["empresa", empr],
]) {
  ok(await c.from(tabela).delete().in("id", faixa(fn, 20)), `limpar ${tabela}`)
}
ok(
  await c.from("filiacao_reembolsos_config").delete().eq("emp_proprietaria_id", DEMO),
  "limpar reembolsos_config"
)

// Conveniadores: duas empresas próprias; a pousada já existe no seed base.
const POUSADA = "f0f0f0f0-0000-4000-8000-000000000005"
const GRAFICA = "f0f0f0f0-0000-4000-8000-000000000002"
ok(
  await c.from("empresa").insert([
    { id: empr(1), emp_proprietaria_id: DEMO, nome_fantasia: "Ótica Visão Clara", nome_razao: "Visão Clara Comércio de Óculos Ltda.", empresa: true, conveniador: true, pessoa_juridica: true },
    { id: empr(2), emp_proprietaria_id: DEMO, nome_fantasia: "Instituto Saber", nome_razao: "Instituto Saber Cursos Livres Ltda.", empresa: true, conveniador: true, pessoa_juridica: true },
  ]),
  "empresas conveniadoras"
)
ok(await c.from("empresa").update({ conveniador: true }).in("id", [POUSADA, GRAFICA]), "marcar conveniadores")

ok(
  await c.from("filiacao_convenios_categorias").insert([
    { id: cat(1), emp_proprietaria_id: DEMO, categoria: "Ótica" },
    { id: cat(2), emp_proprietaria_id: DEMO, categoria: "Hospedagem" },
    { id: cat(3), emp_proprietaria_id: DEMO, categoria: "Educação" },
    { id: cat(4), emp_proprietaria_id: DEMO, categoria: "Serviços" },
  ]),
  "categorias de convênio"
)

// Endereços das unidades (balcões, não pessoas — sem filiado_id).
ok(
  await c.from("enderecos").insert([
    { id: ende(1), emp_proprietaria_id: DEMO, empresa_id: empr(1), nome_endereco: "Loja Centro", tipo_endereco: "Comercial", logradouro: "Rua da Conceição", numero: "120", complemento: "loja B", bairro: "Centro", cidade: "Niterói", estado: "RJ", cep: "24020-080" },
    { id: ende(2), emp_proprietaria_id: DEMO, empresa_id: empr(1), nome_endereco: "Loja Icaraí", tipo_endereco: "Comercial", logradouro: "Rua Gavião Peixoto", numero: "88", bairro: "Icaraí", cidade: "Niterói", estado: "RJ", cep: "24230-090" },
    { id: ende(3), emp_proprietaria_id: DEMO, empresa_id: POUSADA, nome_endereco: "Pousada", tipo_endereco: "Comercial", logradouro: "Av. Beira-Mar", numero: "1500", bairro: "Praia do Forte", cidade: "Cabo Frio", estado: "RJ", cep: "28908-000" },
    { id: ende(4), emp_proprietaria_id: DEMO, empresa_id: empr(2), nome_endereco: "Sede", tipo_endereco: "Comercial", logradouro: "Rua Visconde do Rio Branco", numero: "633", complemento: "3º andar", bairro: "Centro", cidade: "Niterói", estado: "RJ", cep: "24020-005" },
  ]),
  "endereços das unidades"
)

ok(
  await c.from("filiacao_convenios").insert([
    {
      id: conv(1), emp_proprietaria_id: DEMO, categoria_id: cat(1), conveniador_id: empr(1), ativo: true, data_termino: null,
      info_sumarias: "Desconto em armações, lentes e exames de vista para associados e dependentes.",
      info_vantagens: "30% em armações, 20% em lentes com antirreflexo e exame de vista gratuito na compra. Parcelamento em até 6 vezes sem juros.",
    },
    {
      id: conv(2), emp_proprietaria_id: DEMO, categoria_id: cat(2), conveniador_id: POUSADA, ativo: true, data_termino: dataIso(dia(400)),
      info_sumarias: "Diárias com desconto na Pousada Mar Azul, em Cabo Frio, o ano inteiro.",
      info_vantagens: "25% na diária de segunda a quinta e 15% em fins de semana e feriados, com café da manhã. Crianças até 6 anos não pagam.",
    },
    {
      id: conv(3), emp_proprietaria_id: DEMO, categoria_id: cat(3), conveniador_id: empr(2), ativo: true, data_termino: dataIso(dia(-45)),
      info_sumarias: "Cursos livres de informática, idiomas e preparação para concursos.",
      info_vantagens: "40% na mensalidade de qualquer curso presencial ou online e matrícula gratuita.",
    },
    {
      id: conv(4), emp_proprietaria_id: DEMO, categoria_id: cat(4), conveniador_id: GRAFICA, ativo: false, data_termino: null,
      info_sumarias: "Impressão de cartões, convites e material gráfico com preço de tabela sindical.",
      info_vantagens: "15% em qualquer serviço gráfico.",
    },
  ]),
  "convênios"
)

ok(
  await c.from("filiacao_convenios_unidades").insert([
    { id: unid(1), emp_proprietaria_id: DEMO, convenio_id: conv(1), nome: "Loja Centro", site: "https://oticavisaoclara.exemplo.com.br", atendimento_presencial: true, atendimento_online: false, endereco_id: ende(1), telefones: ["(21) 2620-1010"], emails: ["centro@oticavisaoclara.exemplo.com.br"] },
    { id: unid(2), emp_proprietaria_id: DEMO, convenio_id: conv(1), nome: "Loja Icaraí", site: null, atendimento_presencial: true, atendimento_online: false, endereco_id: ende(2), telefones: ["(21) 2710-2020", "(21) 99777-2020"], emails: [] },
    { id: unid(3), emp_proprietaria_id: DEMO, convenio_id: conv(2), nome: "Pousada Mar Azul", site: "https://pousadamarazul.exemplo.com.br", atendimento_presencial: true, atendimento_online: true, endereco_id: ende(3), telefones: ["(22) 2647-3030"], emails: ["reservas@pousadamarazul.exemplo.com.br"] },
    { id: unid(4), emp_proprietaria_id: DEMO, convenio_id: conv(3), nome: "Sede Niterói", site: "https://institutosaber.exemplo.com.br", atendimento_presencial: true, atendimento_online: true, endereco_id: ende(4), telefones: ["(21) 2717-4040"], emails: [] },
  ]),
  "unidades de convênio"
)

// Reembolsos do Antônio (o perfil que o manual mostra): três participações,
// duas pagas e uma aguardando. Cada uma tem a ordem de pagamento por trás.
const antonio = porNome("Antônio")
if (antonio) {
  ok(
    await c.from("projeto").insert([
      { id: proj(1), emp_proprietaria_id: DEMO, descricao_sumaria: "Campanha salarial 2026", tipo: "Campanha" },
    ]),
    "projeto"
  )
  ok(
    await c.from("ordens_pagamento").insert([
      { id: ordem(1), emp_proprietaria_id: DEMO, codigo: "OP-R-001", descricao: "Reembolso de participação — assembleia de 12/06", valor: 35, situacao: "Paga", pago: true, valor_pago: 35, data_pagamento: dataIso(dia(-80)), data_emissao: dataIso(dia(-84)), tipo: "Despesa", forma_pagamento: "Pix", projeto_id: proj(1) },
      { id: ordem(2), emp_proprietaria_id: DEMO, codigo: "OP-R-002", descricao: "Reembolso de participação — ato na refinaria", valor: 35, situacao: "Paga", pago: true, valor_pago: 35, data_pagamento: dataIso(dia(-30)), data_emissao: dataIso(dia(-33)), tipo: "Despesa", forma_pagamento: "Pix", projeto_id: proj(1) },
      { id: ordem(3), emp_proprietaria_id: DEMO, codigo: "OP-R-003", descricao: "Reembolso de participação — reunião do conselho", valor: 35, situacao: "A pagar", pago: false, data_emissao: dataIso(dia(-3)), tipo: "Despesa", forma_pagamento: "Pix", projeto_id: proj(1) },
    ]),
    "ordens de reembolso"
  )
  ok(
    await c.from("filiacao_reembolsos").insert([
      { id: reemb(1), emp_proprietaria_id: DEMO, filiado_id: antonio.id, data: dataIso(dia(-84)), justificativa: "Participação na assembleia geral de 12/06", valor: 35, ordem_pagamento_id: ordem(1), projeto_id: proj(1) },
      { id: reemb(2), emp_proprietaria_id: DEMO, filiado_id: antonio.id, data: dataIso(dia(-33)), justificativa: "Ato unificado na portaria da refinaria", valor: 35, ordem_pagamento_id: ordem(2), projeto_id: proj(1) },
      { id: reemb(3), emp_proprietaria_id: DEMO, filiado_id: antonio.id, data: dataIso(dia(-3)), justificativa: "Reunião do conselho de representantes", valor: 35, ordem_pagamento_id: ordem(3), projeto_id: proj(1) },
    ]),
    "reembolsos"
  )
  ok(
    await c.from("filiacao_reembolsos_config").insert({ emp_proprietaria_id: DEMO, valor_reembolso: 35, orcamento_limite: true, orcamento_mensal: 3500 }),
    "config de reembolso"
  )

  // Outros contatos: o que o cadastro já tem (marcado "no cadastro") e o
  // que só existia nas tabelas de contato do sistema antigo.
  ok(
    await c.from("emails").insert([
      { id: mail(1), emp_proprietaria_id: DEMO, filiado_id: antonio.id, email: "antonio.demo@exemplo.com", tipo_email: "Pessoal", favorito: true },
      { id: mail(2), emp_proprietaria_id: DEMO, filiado_id: antonio.id, email: "antonio.nunes@petroficticia.exemplo.com.br", tipo_email: "Corporativo", favorito: false },
    ]),
    "e-mails"
  )
  ok(
    await c.from("telefones").insert([
      { id: fone(1), emp_proprietaria_id: DEMO, filiado_id: antonio.id, numero: "(21) 99900-0005", tipo: "Celular", whatsapp: true, favorito: true },
      { id: fone(2), emp_proprietaria_id: DEMO, filiado_id: antonio.id, numero: "(21) 2610-0005", tipo: "Residencial", whatsapp: false, favorito: false },
      { id: fone(3), emp_proprietaria_id: DEMO, filiado_id: antonio.id, numero: "(21) 98888-1234", tipo: "Recado (esposa)", whatsapp: true, favorito: false },
    ]),
    "telefones"
  )
  ok(
    await c.from("enderecos").insert([
      { id: ende(5), emp_proprietaria_id: DEMO, filiado_id: antonio.id, nome_endereco: "Residência", tipo_endereco: "Residencial", favorito: true, logradouro: "Av. das Amendoeiras", numero: "410", complemento: "apto 302", bairro: "Fonseca", cidade: "Niterói", estado: "RJ", cep: "24000-000" },
      { id: ende(6), emp_proprietaria_id: DEMO, filiado_id: antonio.id, nome_endereco: "Casa de praia", tipo_endereco: "Residencial", favorito: false, logradouro: "Rua das Gaivotas", numero: "27", bairro: "Peró", cidade: "Cabo Frio", estado: "RJ", cep: "28921-000" },
    ]),
    "endereços"
  )
}

console.log("\nPronto. Tenant demo com Eventos, carência, inadimplência e LGPD.")
console.log("Evento:", EV, "— slug encontro-de-formacao-sindical")
console.log("Dia 1:", DIA1)
