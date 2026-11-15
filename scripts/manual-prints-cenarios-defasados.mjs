// Cenários temporários da rodada "defasados" do manual-prints.mjs (prints antigos
// de docs/manual-auditoria-2026-11.md). Só grava no tenant demo, só com dados
// fictícios, guarda o estado anterior em scripts/.manual-prints-cenarios-defasados.json
// e "desfazer" devolve tudo como estava. Nenhum e-mail é disparado: os avisos da
// rodada ficam só como números, e o envio automático segue desligado.
//
//   node scripts/manual-prints-cenarios-defasados.mjs montar
//   RODADA=defasados SEGUIR=1 node scripts/manual-prints.mjs
//   node scripts/manual-prints-cenarios-defasados.mjs desfazer   ← SEMPRE, mesmo se algo falhar
import crypto from "node:crypto"
import fs from "node:fs"
import { createClient } from "@supabase/supabase-js"

const env = Object.fromEntries(fs.readFileSync(".env.local", "utf8").split(/\r?\n/).filter((l) => l.includes("=") && !l.startsWith("#")).map((l) => [l.slice(0, l.indexOf("=")), l.slice(l.indexOf("=") + 1).trim()]))
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY)
const EMP = "11111111-1111-4111-8111-111111111111"
const ESTADO = "scripts/.manual-prints-cenarios-defasados.json"

const MARIANA = "77777777-7777-4777-8777-000000000002"
const CPF_MARIANA = "22233344405"
const CAMPANHA = "ea000000-0000-4000-8000-000000000001" // fonte: a mesma do vínculo de Mariana
const ROD_ABERTA = "e5800000-0000-4000-8000-000000000001"
const ASS_ABERTA = "e5800000-0000-4000-8000-000000000002"
const ROD_VOTADA = "e5800000-0000-4000-8000-000000000003"
const ASS_VOTADA = "e5800000-0000-4000-8000-000000000004"
const APTO_VOTOU = "e5810000-0000-4000-8000-000000000001"
const CATS = ["ad700000-0000-4000-8000-000000000001", "ad700000-0000-4000-8000-000000000002"]
const EVENTO_BASE = "e0e0e0e0-0000-4000-8000-000000000001"
const EVENTO = "e5820000-0000-4000-8000-000000000001"
const CUPOM = "e5830000-0000-4000-8000-000000000001"
const ASSISTIDO = "e5840000-0000-4000-8000-000000000001"
const ATENDIMENTO = "e5840000-0000-4000-8000-000000000002"

const FILIADOS = [
  ["Aguarda ficha assinada", "Beatriz Moura Lemos", "3101", 12],
  ["Filiação não informada à fonte", "Rafael Tavares Dias", "3102", 5],
  ["Filiação aguarda fonte", "Helena Prado Castro", "3103", 40],
  ["Desfiliação não informada à fonte", "Otávio Reis Barros", "3104", 3],
  ["Desfiliação aguarda fonte", "Luísa Campos Vidal", "3105", 21],
].map(([condicao, nome, matricula, dias], i) => ({ id: `e5850000-0000-4000-8000-00000000000${i + 1}`, condicao, nome, matricula, dias }))

const APTOS = [
  ["Beatriz Moura Lemos", "beatriz.demo@exemplo.com", true],
  ["Rafael Tavares Dias", "rafael.demo@exemplo.com", true],
  ["Helena Prado Castro", "helena.demo@exemplo.com", true],
  ["Otávio Reis Barros", "otavio.demo@exemplo.com", false],
  ["Luísa Campos Vidal", "luisa.demo@exemplo.com", false],
  ["Caio Nunes Falcão", null, false],
].map(([nome, email, avisado], i) => ({ id: `e5810000-0000-4000-8000-00000000001${i}`, nome, email, avisado }))

const hoje = new Date().toLocaleDateString("sv-SE", { timeZone: "America/Sao_Paulo" })
const dia = (n) => { const d = new Date(hoje + "T12:00:00Z"); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10) }
const ok = (t, { error }) => console.log(error ? `ERRO ${t}: ${error.message}` : `ok ${t}`)
const umDe = async (t, filtro = (q) => q) => {
  const { data, error } = await filtro(sb.from(t).select("*").eq("emp_proprietaria_id", EMP)).limit(1).single()
  if (error) throw new Error(`${t}: ${error.message}`)
  return data
}
const fase = process.argv[2]

if (fase === "montar") {
  if (fs.existsSync(ESTADO)) throw new Error("Já montado: desfaça antes.")
  const { data: cats, error } = await sb.from("saude_cat").select("id, sem_conferencia, conferencia_pendencia").in("id", CATS).eq("emp_proprietaria_id", EMP)
  if (error) throw new Error(error.message)
  fs.writeFileSync(ESTADO, JSON.stringify({ cats }, null, 1))

  for (const [rod, ass, nomeRod, nomeAss] of [
    [ROD_ABERTA, ASS_ABERTA, "Rodada do Acordo Coletivo 2026/2027", "Aprovação da proposta de Acordo Coletivo"],
    [ROD_VOTADA, ASS_VOTADA, "Rodada da pauta de reivindicações", "Aprovação da pauta de reivindicações"],
  ]) {
    ok(`rodada ${nomeRod}`, await sb.from("voto_rod_assembleias").insert({ id: rod, emp_proprietaria_id: EMP, campanha_id: CAMPANHA, nome_assembleia: nomeRod, inicio: dia(-1), termino: dia(2) }))
    ok(`votação ${nomeAss}`, await sb.from("voto_assembleias").insert({ id: ass, emp_proprietaria_id: EMP, rod_assembleia_id: rod, nome_assembleia: nomeAss, online: true, urnas_de_votacao: false, somente_filiados: false, data_inicio: dia(-1), data_termino: dia(2), periodo_inicio: dia(-1), periodo_termino: dia(2) }))
  }
  ok("apto sem voto", await sb.from("voto_assembleias_aptos").insert({ id: "e5810000-0000-4000-8000-000000000002", emp_proprietaria_id: EMP, cpf: CPF_MARIANA, nome_completo: "Mariana Souza Ribeiro", rod_assembleia_id: ROD_ABERTA, assembleia_id: ASS_ABERTA }))
  const quando = new Date(Date.now() - 2 * 3600 * 1000).toISOString()
  const codigo = "VT-7K2P-9QXM"
  ok("apto que votou", await sb.from("voto_assembleias_aptos").insert({ id: APTO_VOTOU, emp_proprietaria_id: EMP, cpf: CPF_MARIANA, nome_completo: "Mariana Souza Ribeiro", rod_assembleia_id: ROD_VOTADA, assembleia_id: ASS_VOTADA, hora_voto: quando, comprovante_codigo: codigo, comprovante_hash: crypto.createHash("sha256").update(`${codigo}|${APTO_VOTOU}|${ASS_VOTADA}|${quando}`).digest("hex"), comprovante_canal: "online", comprovante_em: quando }))
  ok("aptos do aviso", await sb.from("voto_assembleias_aptos").insert(APTOS.map((a) => ({ id: a.id, emp_proprietaria_id: EMP, nome_completo: a.nome, email_corporativo: a.email, rod_assembleia_id: ROD_ABERTA, aviso_email_em: a.avisado ? quando : null, aviso_primeiro_em: a.avisado ? quando : null, aviso_email_para: a.avisado ? a.email : null }))))

  ok("filiações em andamento", await sb.from("filiacoes").insert(FILIADOS.map((f) => ({ id: f.id, emp_proprietaria_id: EMP, nome_completo: f.nome, matricula_sindical: f.matricula, filiacao_condicao: f.condicao, condicao_desde: new Date(Date.now() - f.dias * 86400000).toISOString() }))))

  ok("CATs sem conferência", await sb.from("saude_cat").update({ sem_conferencia: true, conferencia_pendencia: "Data de nascimento não encontrada no documento." }).in("id", CATS).eq("emp_proprietaria_id", EMP))

  const ev = await umDe("eventos", (q) => q.eq("id", EVENTO_BASE))
  ok("evento aberto", await sb.from("eventos").insert({ ...ev, id: EVENTO, slug: "seminario-saude-trabalhador-demo", titulo: "Seminário de Saúde do Trabalhador", descricao: "Um dia de palestras sobre saúde e segurança no trabalho, com almoço incluído.", inicio: `${dia(30)}T12:00:00+00:00`, termino: `${dia(30)}T20:00:00+00:00`, inscricoes_abrem_em: `${dia(-5)}T12:00:00+00:00`, inscricoes_fecham_em: `${dia(25)}T23:00:00+00:00`, exige_rsvp: false, rsvp_abre_em: null, created_at: new Date().toISOString() }))

  // Estas tabelas nem sempre têm a coluna do tenant, e o banco é o mesmo da entidade
  // real: a linha-modelo só pode vir de um filiado do tenant demo.
  const { data: daDemo } = await sb.from("filiacoes").select("id").eq("emp_proprietaria_id", EMP).limit(1000)
  const idsDemo = (daDemo ?? []).map((f) => f.id)
  const linhaDaDemo = async (t, coluna, ids) => {
    const { data, error: erro } = await sb.from(t).select("*").in(coluna, ids).limit(20)
    if (erro) throw new Error(`${t}: ${erro.message}`)
    if (!data?.length) throw new Error(`${t}: nenhuma linha no tenant demo`)
    return data
  }
  const cupons = await linhaDaDemo("hospedagem_cupom", "filiado_id", idsDemo)
  const cupom = cupons.find((c) => c.reserva_garantida !== true) ?? cupons[0]
  ok("cupom", await sb.from("hospedagem_cupom").insert({ ...cupom, id: CUPOM, token: crypto.randomUUID(), filiado_id: MARIANA, created_at: new Date().toISOString() }))

  const [assistido] = await linhaDaDemo("saude_assistidos", "filiado_id", idsDemo)
  ok("assistido", await sb.from("saude_assistidos").insert({ ...assistido, id: ASSISTIDO, filiado_id: MARIANA }))
  const [atend] = await linhaDaDemo("saude_atendimentos", "assistido_id", [assistido.id])
  ok("atendimento", await sb.from("saude_atendimentos").insert({ ...atend, id: ATENDIMENTO, assistido_id: ASSISTIDO, data_atendimento: dia(-20), observacao_aberta: "Consulta de rotina. Retorno em seis meses (demonstração)." }))
}

if (fase === "desfazer") {
  const e = JSON.parse(fs.readFileSync(ESTADO, "utf8"))
  // Por id próprio (e5…): estas linhas foram criadas aqui.
  ok("atendimento", await sb.from("saude_atendimentos").delete().eq("id", ATENDIMENTO))
  ok("assistido", await sb.from("saude_assistidos").delete().eq("id", ASSISTIDO))
  ok("cupom", await sb.from("hospedagem_cupom").delete().eq("id", CUPOM))
  ok("evento", await sb.from("eventos").delete().eq("id", EVENTO).eq("emp_proprietaria_id", EMP))
  for (const c of e.cats) ok("CAT", await sb.from("saude_cat").update({ sem_conferencia: c.sem_conferencia, conferencia_pendencia: c.conferencia_pendencia }).eq("id", c.id).eq("emp_proprietaria_id", EMP))
  ok("filiações", await sb.from("filiacoes").delete().in("id", FILIADOS.map((f) => f.id)).eq("emp_proprietaria_id", EMP))
  ok("aptos", await sb.from("voto_assembleias_aptos").delete().in("rod_assembleia_id", [ROD_ABERTA, ROD_VOTADA]).eq("emp_proprietaria_id", EMP))
  ok("votações", await sb.from("voto_assembleias").delete().in("id", [ASS_ABERTA, ASS_VOTADA]).eq("emp_proprietaria_id", EMP))
  ok("rodadas", await sb.from("voto_rod_assembleias").delete().in("id", [ROD_ABERTA, ROD_VOTADA]).eq("emp_proprietaria_id", EMP))
  fs.rmSync(ESTADO)
}
