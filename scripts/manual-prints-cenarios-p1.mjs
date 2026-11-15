// Cenários temporários da rodada "p1" do manual-prints.mjs (os 12 primeiros
// prints de docs/manual-auditoria-2026-11.md). Só grava no tenant demo, guarda o
// estado anterior em scripts/.manual-prints-cenarios-p1.json, e "desfazer" devolve
// tudo como estava.
//
//   node scripts/manual-prints-cenarios-p1.mjs montar
//   RODADA=p1 SEGUIR=1 node scripts/manual-prints.mjs
//   node scripts/manual-prints-cenarios-p1.mjs desfazer   ← SEMPRE, mesmo se algo falhar
//
// .env.development.local (criado aqui e apagado no desfazer; o dev server relê):
// EMAIL_SANDBOX=1 faz o Brevo descartar o código da assinatura, sem entregar, e o
// bot de mentira mostra o Telegram no pré-cadastro de /votar. Enquanto o arquivo
// existe, vale para todo o servidor da porta 3222.
import fs from "node:fs"
import { createClient } from "@supabase/supabase-js"

const env = Object.fromEntries(fs.readFileSync(".env.local", "utf8").split(/\r?\n/).filter((l) => l.includes("=") && !l.startsWith("#")).map((l) => [l.slice(0, l.indexOf("=")), l.slice(l.indexOf("=") + 1).trim()]))
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY)
const EMP = "11111111-1111-4111-8111-111111111111"
const ESTADO = "scripts/.manual-prints-cenarios-p1.json"
const ENV_TEMP = ".env.development.local"

const MARIANA = "77777777-7777-4777-8777-000000000002" // filiação do login demo no portal
const ROD_VOTAR = "eb000000-0000-4000-8000-000000000001"
const ASS_NOVA = "e57e0000-0000-4000-8000-000000000001"
const ROD_URNA = "ea000000-0000-4000-8000-000000000003"
const ASS_URNA = "ea000000-0000-4000-8000-000000000014"
const URNA = "7f32e026-7e34-402b-a990-b489bc305599"
const MESARIO = "e57d0000-0000-4000-8000-000000000001"
const CAIXA = "31bdab32-b80e-46ed-89e8-1019a396a87f"
const ANA = "33333333-3333-4333-8333-000000000001"
const PRESTACAO = "e5790000-0000-4000-8000-000000000001"
const CARTAO = "181fa5d4-187a-4dfc-affd-67513eba390a"
const FATURA = "e5780000-0000-4000-8000-000000000001"
const ORDENS_CARTAO = ["e5fe66f3-8c76-49f7-82bb-a4959c0de73a", "42d791a1-4975-45c2-b13c-07907914ef19"]
const TERMO = "e57a0000-0000-4000-8000-000000000001"
const ASSINATURA_BASE = "aeeeb784-4867-4b5f-99d5-9e6bc9c47610"
const ASSINATURA = "e57b0000-0000-4000-8000-000000000001"
const TOKEN = "e57c0000-0000-4000-8000-000000000001"
const OFICIO = "fe800000-0000-4000-8000-000000000012"

const hoje = new Date().toLocaleDateString("sv-SE", { timeZone: "America/Sao_Paulo" })
const dia = (n) => { const d = new Date(hoje + "T12:00:00Z"); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10) }
const ok = (t, { error }) => console.log(error ? `ERRO ${t}: ${error.message}` : `ok ${t}`)
const pega = async (t, sel, id) => {
  const { data, error } = await sb.from(t).select(sel).eq("id", id).eq("emp_proprietaria_id", EMP).single()
  if (error) throw new Error(`${t}: ${error.message}`)
  return data
}
const fase = process.argv[2]

if (fase === "montar") {
  if (fs.existsSync(ESTADO)) throw new Error("Já montado: desfaça antes.")
  if (fs.existsSync(ENV_TEMP)) throw new Error(`${ENV_TEMP} já existe: confira antes de seguir.`)
  const estado = {
    mariana: await pega("filiacoes", "tl_lgpd_id, telefone_1, telefone_2, endereco_numero", MARIANA),
    rodVotar: await pega("voto_rod_assembleias", "nome_assembleia, inicio, termino", ROD_VOTAR),
    assUrna: await pega("voto_assembleias", "nome_assembleia", ASS_URNA),
    urna: await pega("voto_urnas", "nome, abertura, fechamento", URNA),
    oficio: await pega("oficios", "assunto", OFICIO),
  }
  fs.writeFileSync(ESTADO, JSON.stringify(estado, null, 1))
  fs.writeFileSync(ENV_TEMP, "EMAIL_SANDBOX=1\nTELEGRAM_BOT_TOKEN=print-do-manual\nTELEGRAM_BOT_USERNAME=bot_demo\n")

  ok("primeiro acesso", await sb.from("filiacoes").update({ tl_lgpd_id: null, telefone_1: null, telefone_2: null, endereco_numero: null }).eq("id", MARIANA).eq("emp_proprietaria_id", EMP))

  ok("rodada por abrir", await sb.from("voto_rod_assembleias").update({ nome_assembleia: "Acordo Coletivo 2026/2027", inicio: dia(7), termino: dia(9) }).eq("id", ROD_VOTAR).eq("emp_proprietaria_id", EMP))
  // Votação nova: o banco não deixa mudar as datas de uma que já começou.
  ok("votação por abrir", await sb.from("voto_assembleias").insert({ id: ASS_NOVA, emp_proprietaria_id: EMP, rod_assembleia_id: ROD_VOTAR, nome_assembleia: "Aprovação da proposta de Acordo Coletivo", online: true, urnas_de_votacao: false, somente_filiados: false, data_inicio: dia(7), data_termino: dia(9), periodo_inicio: dia(7), periodo_termino: dia(9) }))

  const inicio = new Date(Date.now() - 3600 * 1000).toISOString()
  const fim = new Date(Date.now() + 8 * 3600 * 1000).toISOString()
  ok("urna na janela", await sb.from("voto_urnas").update({ nome: "Urna 1 — Portaria principal", abertura: inicio, fechamento: fim }).eq("id", URNA).eq("emp_proprietaria_id", EMP))
  ok("assembleia da urna", await sb.from("voto_assembleias").update({ nome_assembleia: "Assembleia presencial do Acordo Coletivo" }).eq("id", ASS_URNA).eq("emp_proprietaria_id", EMP))
  ok("mesário", await sb.from("voto_mesarios").insert({ id: MESARIO, emp_proprietaria_id: EMP, rod_assembleia_id: ROD_URNA, nome_completo: "Operador da demonstração", email: "demo@confluir.local", ativo: true }))

  ok("prestação", await sb.from("caixa_prestacoes").insert({ id: PRESTACAO, emp_proprietaria_id: EMP, conta_id: CAIXA, situacao: "aguardando", saldo_declarado: 800, observacao: "Saldo conferido e guardado no cofre da regional.", aberta_por_usuario_id: ANA }))

  ok("fatura", await sb.from("financeiro_cartao_faturas").insert({ id: FATURA, emp_proprietaria_id: EMP, cartao_id: CARTAO, numero: 1 }))
  ok("compras na fatura", await sb.from("ordens_pagamento").update({ cartao_fatura_id: FATURA }).in("id", ORDENS_CARTAO).eq("emp_proprietaria_id", EMP))

  ok("termo anterior", await sb.from("filiacao_tl_lgpd").insert({ id: TERMO, emp_proprietaria_id: EMP, codigo: "LGPD-2025", em_vigor: false, texto: "Versão anterior do termo de privacidade da entidade (texto fictício de demonstração).", created_at: "2025-08-02T12:00:00+00:00" }))

  const base = await pega("documento_assinaturas", "*", ASSINATURA_BASE)
  const nova = { ...base, id: ASSINATURA, token: TOKEN, certificado: null, situacao: "pendente", codigo_hash: null, codigo_expira_em: null, codigo_tentativas: 0, enviado_em: new Date().toISOString(), visualizado_em: null, recusado_em: null, motivo_recusa: null, assinado_em: null, ip: null, user_agent: null }
  ok("assinatura pendente", await sb.from("documento_assinaturas").insert(nova))
  ok("assunto do ofício", await sb.from("oficios").update({ assunto: "Pedido de reunião sobre o Acordo Coletivo de Trabalho" }).eq("id", OFICIO).eq("emp_proprietaria_id", EMP))
}

if (fase === "desfazer") {
  const e = JSON.parse(fs.readFileSync(ESTADO, "utf8"))
  ok("primeiro acesso", await sb.from("filiacoes").update(e.mariana).eq("id", MARIANA).eq("emp_proprietaria_id", EMP))
  ok("rodada", await sb.from("voto_rod_assembleias").update(e.rodVotar).eq("id", ROD_VOTAR).eq("emp_proprietaria_id", EMP))
  ok("votação", await sb.from("voto_assembleias").delete().eq("id", ASS_NOVA).eq("emp_proprietaria_id", EMP))
  ok("urna", await sb.from("voto_urnas").update(e.urna).eq("id", URNA).eq("emp_proprietaria_id", EMP))
  ok("assembleia da urna", await sb.from("voto_assembleias").update(e.assUrna).eq("id", ASS_URNA).eq("emp_proprietaria_id", EMP))
  ok("mesário", await sb.from("voto_mesarios").delete().eq("id", MESARIO).eq("emp_proprietaria_id", EMP))
  ok("prestação", await sb.from("caixa_prestacoes").delete().eq("id", PRESTACAO).eq("emp_proprietaria_id", EMP))
  ok("compras fora da fatura", await sb.from("ordens_pagamento").update({ cartao_fatura_id: null }).in("id", ORDENS_CARTAO).eq("emp_proprietaria_id", EMP))
  ok("fatura", await sb.from("financeiro_cartao_faturas").delete().eq("id", FATURA).eq("emp_proprietaria_id", EMP))
  ok("termo anterior", await sb.from("filiacao_tl_lgpd").delete().eq("id", TERMO).eq("emp_proprietaria_id", EMP))
  ok("assinatura", await sb.from("documento_assinaturas").delete().eq("id", ASSINATURA).eq("emp_proprietaria_id", EMP))
  ok("ofício", await sb.from("oficios").update(e.oficio).eq("id", OFICIO).eq("emp_proprietaria_id", EMP))
  if (fs.existsSync(ENV_TEMP)) fs.rmSync(ENV_TEMP)
  fs.rmSync(ESTADO)
}
