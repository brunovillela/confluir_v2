// Cenários temporários para as rodadas "cenarios" e "cenarios-saida" do
// manual-prints.mjs (e o login da diretora para a rodada "diretora"). Grava,
// guarda o estado anterior em scripts/.manual-prints-cenarios.json e
// "desfazer" devolve tudo como estava.
//
//   node scripts/manual-prints-cenarios.mjs montar
//   RODADA=cenarios node scripts/manual-prints.mjs        (+ fiscal, diretora)
//   node scripts/manual-prints-cenarios.mjs saida      ← depois: a saída aberta
//   RODADA=cenarios-saida node scripts/manual-prints.mjs   mudaria o print da preventiva
//   node scripts/manual-prints-cenarios.mjs desfazer   ← SEMPRE, mesmo se algo falhar
//   node scripts/manual-prints-cenarios.mjs conferir   (mostra o estado atual)
//
// O print "estorno-ordem" REGISTRA o estorno de verdade na ordem do cenário
// (e o sistema notifica o operador): o desfazer apaga estorno, trilha,
// notificação e a ordem.
import fs from "node:fs"
import { createHash } from "node:crypto"
import { createClient } from "@supabase/supabase-js"
const env = Object.fromEntries(fs.readFileSync(".env.local", "utf8").split(/\r?\n/).filter((l) => l.includes("=")).map((l) => [l.slice(0, l.indexOf("=")), l.slice(l.indexOf("=") + 1).trim()]))
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY)
const EMP = "11111111-1111-4111-8111-111111111111"
const ASSEMB = "ea000000-0000-4000-8000-000000000004"
const ROD = "ea000000-0000-4000-8000-000000000003"
const ROBERTO_APTO = "ea000000-0000-4000-8000-000000000008"
const APTO_NOVO = "e5750000-0000-4000-8000-000000000001"
const CATS = ["e5760000-0000-4000-8000-000000000001", "e5760000-0000-4000-8000-000000000002"]
const REMESSA = "06de932e-d050-4618-bc39-5c791a375566"
const DIARIA = "5b200000-0000-4000-8000-000000000002"
const MARIANA = "ab000000-0000-4000-8000-000000000021"
const MARIANA_AUTH = "2587e7d3-8b6c-4fc0-89db-b2195b29af6a"
// Cenários de 17/10: estorno, abastecimento sem veículo, CNH anterior, CATs
// duplicadas, preventiva se aproximando e devolução com km fora do normal.
const OPER = "22222222-2222-4222-8222-222222222222"
const V1 = "4e000000-0000-4000-8000-000000000001"
const EDUARDO = "4d000000-0000-4000-8000-000000000001" // usuário condutor
const COND = "4c000000-0000-4000-8000-000000000001" // cadastro de condutor
const PLANO = "4d000000-0000-4000-8000-000000000001"
const ORDEM = "e5700000-0000-4000-8000-000000000001"
const ORDEM_CODIGO = "2026.0928.1015.7710"
const ABAST = "e5710000-0000-4000-8000-000000000001"
const CNH = "e5720000-0000-4000-8000-000000000001"
const CATS_DUP = ["e5730000-0000-4000-8000-000000000001", "e5730000-0000-4000-8000-000000000002"]
const MOV = "e5740000-0000-4000-8000-000000000001"
const ESTADO = "scripts/.manual-prints-cenarios.json"
const CODIGO = "VT-7Q2M-K9XA"
const hoje = new Date().toLocaleDateString("sv-SE", { timeZone: "America/Sao_Paulo" })
const dia = (n) => { const d = new Date(hoje + "T12:00:00Z"); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10) }
const ok = (t, { error }) => console.log(error ? `ERRO ${t}: ${error.message}` : `ok ${t}`)
const fase = process.argv[2]

if (fase === "montar") {
  if (fs.existsSync(ESTADO)) throw new Error("Já montado — desfaça antes.")
  const pega = async (t, sel, id) => (await sb.from(t).select(sel).eq("id", id).single()).data
  const estado = {
    assembleia: await pega("voto_assembleias", "data_inicio, data_termino, periodo_inicio, periodo_termino, apuracao_encerrada, somente_filiados", ASSEMB),
    rodada: await pega("voto_rod_assembleias", "inicio, termino", ROD),
    roberto: await pega("voto_assembleias_aptos", "comprovante_codigo, comprovante_hash, comprovante_canal, comprovante_em", ROBERTO_APTO),
    remessa: await pega("pessoal_diarias_remessas", "situacao", REMESSA),
    diaria: await pega("pessoal_diarias_solicitacoes", "data_inicio, data_termino", DIARIA),
    mariana: await pega("usuarios", "auth_user_id", MARIANA),
    planoBase: (await pega("veiculos_manutencao_planos", "base_data", PLANO)).base_data,
  }
  fs.writeFileSync(ESTADO, JSON.stringify(estado, null, 1))
  // Votação aberta, aberta a não filiados, com um apto sem CPF (primeiro acesso)
  ok("assembleia aberta", await sb.from("voto_assembleias").update({ data_inicio: dia(-1), data_termino: dia(2), periodo_inicio: dia(-1), periodo_termino: dia(2), apuracao_encerrada: false, somente_filiados: false }).eq("id", ASSEMB))
  ok("rodada aberta", await sb.from("voto_rod_assembleias").update({ inicio: dia(-1), termino: dia(2) }).eq("id", ROD))
  ok("apto sem CPF", await sb.from("voto_assembleias_aptos").insert({ id: APTO_NOVO, emp_proprietaria_id: EMP, cpf: null, email_corporativo: "paulo.lima@petroficticia.com.br", nome_completo: "Paulo Henrique Lima", matricula: "0042", assembleia_id: ASSEMB, rod_assembleia_id: ROD }))
  // Comprovante no voto do Roberto (página pública de conferência)
  const quando = "2026-08-29T18:20:26.622+00:00"
  const hash = createHash("sha256").update(`${CODIGO}|${ROBERTO_APTO}|${ASSEMB}|${quando}`).digest("hex")
  ok("comprovante", await sb.from("voto_assembleias_aptos").update({ comprovante_codigo: CODIGO, comprovante_hash: hash, comprovante_canal: "online", comprovante_em: quando }).eq("id", ROBERTO_APTO))
  // CAT de origem e CAT de óbito (para verificar a reabertura /03)
  const { data: base } = await sb.from("saude_cat").select("*").eq("id", "ad700000-0000-4000-8000-000000000001").single()
  const agora = new Date().toISOString()
  ok("cat /01", await sb.from("saude_cat").insert({ ...base, id: CATS[0], numero_cat: "2019.000.111-1/01", tipo_cat: "Inicial", trabalhador_nome: "Sérgio Moura Lopes", data_acidente: "2019-03-14", houve_morte: false, cat_origem_id: null, created_at: agora, updated_at: agora }))
  ok("cat /02", await sb.from("saude_cat").insert({ ...base, id: CATS[1], numero_cat: "2019.000.111-1/02", tipo_cat: "Comunicação de óbito", trabalhador_nome: "Sérgio Moura Lopes", data_acidente: "2019-03-14", houve_morte: true, data_obito: "2019-04-02", cat_origem_id: CATS[0], created_at: agora, updated_at: agora }))
  // Remessa em preparação e diária dentro do prazo de despesas posteriores
  ok("remessa em preparação", await sb.from("pessoal_diarias_remessas").update({ situacao: "preparacao" }).eq("id", REMESSA))
  ok("diária recente", await sb.from("pessoal_diarias_solicitacoes").update({ data_inicio: dia(-4), data_termino: dia(-3) }).eq("id", DIARIA))
  // Login da Mariana (diretora) para o Meu perfil
  ok("login Mariana", await sb.from("usuarios").update({ auth_user_id: MARIANA_AUTH }).eq("id", MARIANA))

  // Ordem paga hoje, lançada pelo operador (registrar estorno, ordem estornada, correção)
  const { data: paga } = await sb.from("ordens_pagamento").select("*").eq("id", "e0e0e0e0-0000-4000-8000-001300000002").single()
  ok("ordem paga", await sb.from("ordens_pagamento").insert({ ...paga, id: ORDEM, codigo: ORDEM_CODIGO, bubble_id: null, data_pagamento: hoje, situacao: "Paga", created_at: agora }))
  ok("ordem: criada pelo operador", await sb.from("ordens_pagamento_eventos").insert({ ordem_id: ORDEM, tipo: "criada", usuario_id: OPER, emp_proprietaria_id: EMP }))
  // Abastecimento do relatório sem veículo nem condutor identificados
  ok("abastecimento sem veículo", await sb.from("veiculos_abastecimentos").insert({
    id: ABAST, emp_proprietaria_id: EMP, veiculo_id: null, usuario_id: null, posto: "Posto Estrela da Serra", cidade: "Macaé",
    combustivel: "Gasolina", volume_abastecido: 38.4, valor_abastecimento: 241.5, hodometro: 10250,
    data_hora_abastecimento: "2026-09-08T11:42:00-03:00", placa_informada: "ABC-1D23", condutor_informado: "E. P. MARTINS",
  }))
  // CNH anterior do Eduardo, substituída na renovação (Histórico de CNH)
  ok("CNH anterior", await sb.from("veiculos_condutores_cnh").insert({
    id: CNH, emp_proprietaria_id: EMP, condutor_id: COND, cnh_numero: "01234567890", cnh_categoria: "C",
    cnh_validade: "2024-06-30", origem: "renovacao", registrado_por_id: OPER, created_at: "2024-06-28T14:00:00-03:00",
  }))
  // Duas CATs duplicadas da 2026.0001 (mesmo número; mesmo acidentado e data)
  ok("CAT mesmo número", await sb.from("saude_cat").insert({ ...base, id: CATS_DUP[0], created_at: agora, updated_at: agora, observacoes_acidente: "Lançada de novo pela empresa." }))
  ok("CAT mesmo acidentado", await sb.from("saude_cat").insert({ ...base, id: CATS_DUP[1], numero_cat: "2026.0007", tipo_cat: "Reabertura", created_at: agora, updated_at: agora }))
  // Preventiva do V-001 vencendo em 10 dias (plano de 180 dias)
  ok("preventiva a 10 dias", await sb.from("veiculos_manutencao_planos").update({ base_data: dia(10 - 180) }).eq("id", PLANO))
}

if (fase === "saida") {
  // Saída do V-001 há 2 h com 10.000 km — a devolução com 10.500 dá km fora do normal
  ok("saída aberta do V-001", await sb.from("veiculos_disponibilidade").insert({
    id: MOV, emp_proprietaria_id: EMP, veiculo_id: V1, condutor_id: EDUARDO, data_retirada: hoje,
    retirada_em: new Date(Date.now() - 2 * 3600 * 1000).toISOString(), hodometro_retirada: 10000,
    sede_retirada: "Sede", sede_retirada_os: "Sede", destino: "Refinaria", disponivel: false,
  }))
}

if (fase === "desfazer") {
  const e = JSON.parse(fs.readFileSync(ESTADO, "utf8"))
  ok("assembleia", await sb.from("voto_assembleias").update(e.assembleia).eq("id", ASSEMB))
  ok("rodada", await sb.from("voto_rod_assembleias").update(e.rodada).eq("id", ROD))
  ok("apto sem CPF", await sb.from("voto_assembleias_aptos").delete().eq("id", APTO_NOVO))
  ok("comprovante", await sb.from("voto_assembleias_aptos").update(e.roberto).eq("id", ROBERTO_APTO))
  ok("cats", await sb.from("saude_cat").delete().in("id", [CATS[1]]))
  ok("cats", await sb.from("saude_cat").delete().in("id", [CATS[0]]))
  ok("remessa", await sb.from("pessoal_diarias_remessas").update(e.remessa).eq("id", REMESSA))
  ok("diária", await sb.from("pessoal_diarias_solicitacoes").update(e.diaria).eq("id", DIARIA))
  ok("Mariana", await sb.from("usuarios").update(e.mariana).eq("id", MARIANA))
  ok("estornos", await sb.from("ordens_pagamento_estornos").delete().eq("ordem_id", ORDEM))
  ok("trilha da ordem", await sb.from("ordens_pagamento_eventos").delete().eq("ordem_id", ORDEM))
  ok("notificação do estorno", await sb.from("notificacoes").delete().ilike("notificacao", `%${ORDEM_CODIGO}%`))
  ok("ordem", await sb.from("ordens_pagamento").delete().eq("id", ORDEM))
  ok("abastecimento", await sb.from("veiculos_abastecimentos").delete().eq("id", ABAST))
  ok("CNH anterior", await sb.from("veiculos_condutores_cnh").delete().eq("id", CNH))
  ok("CATs duplicadas", await sb.from("saude_cat").delete().in("id", CATS_DUP))
  ok("saída", await sb.from("veiculos_disponibilidade").delete().eq("id", MOV))
  ok("preventiva", await sb.from("veiculos_manutencao_planos").update({ base_data: e.planoBase }).eq("id", PLANO))
  fs.rmSync(ESTADO)
}

if (fase === "conferir") {
  const c = async (t, q) => { const { data, error } = await q; console.log(t, error ? error.message : JSON.stringify(data)) }
  await c("assembleia", sb.from("voto_assembleias").select("data_inicio, data_termino, periodo_inicio, periodo_termino, apuracao_encerrada, somente_filiados").eq("id", ASSEMB))
  await c("rodada", sb.from("voto_rod_assembleias").select("inicio, termino").eq("id", ROD))
  await c("apto novo", sb.from("voto_assembleias_aptos").select("id").eq("id", APTO_NOVO))
  await c("roberto", sb.from("voto_assembleias_aptos").select("comprovante_codigo").eq("id", ROBERTO_APTO))
  await c("cats", sb.from("saude_cat").select("id").in("id", CATS))
  await c("remessa", sb.from("pessoal_diarias_remessas").select("situacao").eq("id", REMESSA))
  await c("diária", sb.from("pessoal_diarias_solicitacoes").select("data_inicio, data_termino").eq("id", DIARIA))
  await c("Mariana", sb.from("usuarios").select("auth_user_id").eq("id", MARIANA))
  await c("ordem", sb.from("ordens_pagamento").select("id, situacao").eq("id", ORDEM))
  await c("estornos", sb.from("ordens_pagamento_estornos").select("id").eq("ordem_id", ORDEM))
  await c("notificações", sb.from("notificacoes").select("id").ilike("notificacao", `%${ORDEM_CODIGO}%`))
  await c("abastecimento", sb.from("veiculos_abastecimentos").select("id").eq("id", ABAST))
  await c("CNH anterior", sb.from("veiculos_condutores_cnh").select("id").eq("id", CNH))
  await c("CATs duplicadas", sb.from("saude_cat").select("id").in("id", CATS_DUP))
  await c("saída", sb.from("veiculos_disponibilidade").select("id").eq("id", MOV))
  await c("preventiva (base)", sb.from("veiculos_manutencao_planos").select("base_data").eq("id", PLANO))
  console.log(fs.existsSync(ESTADO) ? "ESTADO: montado (falta desfazer)" : "ESTADO: limpo")
}
