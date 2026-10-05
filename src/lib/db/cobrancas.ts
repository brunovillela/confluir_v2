import "server-only"

import { createHash } from "node:crypto"

import type { SupabaseClient } from "@supabase/supabase-js"

import { cpfConfiavel } from "@/lib/cpf"
import { esquemaAusente, hojeSP, texto } from "@/lib/db/comum"
import { invalidarCacheInadimplencia } from "@/lib/db/filiacao-inadimplencia"
import { avisarFiliado } from "@/lib/db/portal-avisos"
import { emitirEvento } from "@/lib/db/webhooks"
import { type ContextoEmail } from "@/lib/email"
import { formatarMoeda } from "@/lib/formato"
import { gerarBrCodePix, txidValido } from "@/lib/pix-brcode"
import { createAdminClient } from "@/lib/supabase/admin"
import { tenantAtual } from "@/lib/tenant"

/**
 * COBRANÇA DA CONTRIBUIÇÃO (onda 5, A3). Para quem paga por Pix
 * (`filiacoes.forma_recebimento = 'pix'`), uma cobrança por competência com
 * BR Code estático (chave da conta bancária da entidade + txid próprio). O
 * filiado vê o QR e o copia e cola no portal; a baixa vem da conciliação
 * (txid ou valor no extrato) ou da mão da equipe, e gera a linha em
 * `filiacao_recebe` numa remessa "Associativa" da competência — a mesma
 * tabela que a arrecadação e a inadimplência leem.
 *
 * Adaptador: `provedor` = 'pix-estatico' hoje; API do banco ou PSP entram
 * gravando `provedor_ref` e o QR dinâmico no mesmo registro.
 * Tabelas em supabase/filiacao-cobrancas.sql; sem elas, `disponivel: false`.
 */

const MESES = ["Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho", "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"]

export type ConfigCobranca = {
  disponivel: boolean
  valorMensal: number | null
  diaVencimento: number
  gerarAutomatico: boolean
  mensagem: string | null
}

export type Cobranca = {
  id: string
  filiacaoId: string
  cpf: string | null
  nome?: string | null
  competencia: string
  ordem: number
  valor: number
  forma: "pix" | "boleto"
  vencimento: string
  txid: string
  brcode: string | null
  situacao: "aberta" | "paga" | "cancelada"
  pagoEm: string | null
  valorPago: number | null
  lancamentoId: string | null
  avisadaEm: string | null
  criadaEm: string
  /** Aberta e vencida. */
  vencida: boolean
}

type Ambiente = { client?: SupabaseClient; tenantId?: string; contexto?: ContextoEmail }

async function ambiente(a: Ambiente) {
  return { client: a.client ?? (await createAdminClient()), tenantId: a.tenantId ?? (await tenantAtual()), contexto: a.contexto }
}

function montar(c: Record<string, unknown>, hoje: string): Cobranca {
  const situacao = (c.situacao as Cobranca["situacao"]) ?? "aberta"
  const vencimento = String(c.vencimento).slice(0, 10)
  return {
    id: String(c.id),
    filiacaoId: String(c.filiacao_id),
    cpf: texto(c.cpf),
    competencia: String(c.competencia),
    ordem: Number(c.ordem),
    valor: Number(c.valor),
    forma: (c.forma as Cobranca["forma"]) ?? "pix",
    vencimento,
    txid: String(c.txid),
    brcode: texto(c.brcode),
    situacao,
    pagoEm: texto(c.pago_em)?.slice(0, 10) ?? null,
    valorPago: c.valor_pago === null || c.valor_pago === undefined ? null : Number(c.valor_pago),
    lancamentoId: texto(c.lancamento_id),
    avisadaEm: texto(c.avisada_em),
    criadaEm: String(c.created_at),
    vencida: situacao === "aberta" && vencimento < hoje,
  }
}

export function competenciaAtual(): string {
  return hojeSP().slice(0, 7)
}

export function rotuloCompetencia(c: string): string {
  return `${c.slice(5, 7)}/${c.slice(0, 4)}`
}

// ── Configuração ─────────────────────────────────────────────────────────────

export async function obterConfigCobranca(amb: Ambiente = {}): Promise<ConfigCobranca> {
  const { client, tenantId } = await ambiente(amb)
  const { data, error } = await client.from("filiacao_cobranca_config").select("*").eq("emp_proprietaria_id", tenantId).maybeSingle()
  if (error) return { disponivel: !esquemaAusente(error), valorMensal: null, diaVencimento: 10, gerarAutomatico: true, mensagem: null }
  return {
    disponivel: true,
    valorMensal: data?.valor_mensal === null || data?.valor_mensal === undefined ? null : Number(data.valor_mensal),
    diaVencimento: Number(data?.dia_vencimento ?? 10),
    gerarAutomatico: data?.gerar_automatico !== false,
    mensagem: texto(data?.mensagem),
  }
}

export async function salvarConfigCobranca(c: { valorMensal: number | null; diaVencimento: number; gerarAutomatico: boolean; mensagem: string | null }): Promise<{ erro?: string }> {
  if (c.valorMensal !== null && c.valorMensal <= 0) return { erro: "O valor mensal precisa ser maior que zero." }
  if (c.diaVencimento < 1 || c.diaVencimento > 28) return { erro: "O dia de vencimento vai de 1 a 28." }
  const admin = await createAdminClient()
  const { error } = await admin.from("filiacao_cobranca_config").upsert(
    { emp_proprietaria_id: await tenantAtual(), valor_mensal: c.valorMensal, dia_vencimento: c.diaVencimento, gerar_automatico: c.gerarAutomatico, mensagem: c.mensagem, updated_at: new Date().toISOString() },
    { onConflict: "emp_proprietaria_id" }
  )
  if (error) return { erro: esquemaAusente(error) ? "Falta rodar o SQL supabase/filiacao-cobrancas.sql." : error.message }
  return {}
}

/** Chave Pix, nome e cidade do recebedor: da conta bancária ativa com chave e do cadastro da entidade. */
export async function recebedorPix(amb: Ambiente = {}): Promise<{ chave: string; nome: string; cidade: string } | { erro: string }> {
  const { client, tenantId } = await ambiente(amb)
  const { data: contas } = await client.from("financeiro_contas_bancarias").select("pix_chave, titular_nome").eq("emp_proprietaria_id", tenantId).eq("ativa", true).not("pix_chave", "is", null).order("created_at").limit(1)
  const chave = texto(contas?.[0]?.pix_chave)
  if (!chave) return { erro: "Nenhuma conta bancária ativa tem chave Pix cadastrada (Financeiro → Remessas → Contas bancárias)." }
  const { data: emp } = await client.from("empresa").select("nome_fantasia, nome_razao").eq("id", tenantId).maybeSingle()
  const nome = texto(contas?.[0]?.titular_nome) ?? texto(emp?.nome_fantasia) ?? texto(emp?.nome_razao) ?? "Entidade"
  let cidade = "BRASIL"
  try {
    const { data: sede } = await client.from("empresa_sede").select("cidade").eq("emp_proprietaria_id", tenantId).order("nome").limit(1)
    cidade = texto(sede?.[0]?.cidade) ?? cidade
  } catch {
    // sem coluna/sem sede: fica "BRASIL"
  }
  return { chave, nome, cidade }
}

// ── Geração ──────────────────────────────────────────────────────────────────

function txidDe(tenantId: string, filiacaoId: string, competencia: string): string {
  const h = createHash("sha256").update(`${tenantId}|${filiacaoId}|${competencia}`).digest("hex").slice(0, 10).toUpperCase()
  return txidValido(`CF${competencia.replace("-", "")}${h}`)
}

/**
 * Gera as cobranças da competência para todo filiado ATIVO com
 * forma_recebimento = pix que ainda não tem a dela. Idempotente.
 */
export async function gerarCobrancas(competencia: string, amb: Ambiente = {}): Promise<{ geradas: number; semValor: number; jaExistiam: number; avisadas: number; erro?: string }> {
  const { client, tenantId, contexto } = await ambiente(amb)
  const vazio = { geradas: 0, semValor: 0, jaExistiam: 0, avisadas: 0 }
  if (!/^\d{4}-\d{2}$/.test(competencia)) return { ...vazio, erro: "Competência inválida (AAAA-MM)." }
  const config = await obterConfigCobranca({ client, tenantId })
  if (!config.disponivel) return { ...vazio, erro: "Falta rodar o SQL supabase/filiacao-cobrancas.sql." }
  const recebedor = await recebedorPix({ client, tenantId })
  if ("erro" in recebedor) return { ...vazio, erro: recebedor.erro }

  const { data: pessoas, error } = await client
    .from("filiacoes")
    .select("id, cpf, nome_completo, contribuicao_valor")
    .eq("emp_proprietaria_id", tenantId)
    .eq("filiacao_condicao", "Ativo")
    .eq("forma_recebimento", "pix")
    .not("filiacao_excluida", "is", true)
    .is("mesclado_em", null)
    .limit(5000)
  if (error) return { ...vazio, erro: error.code === "42703" ? "Falta rodar o SQL supabase/filiacao-cobrancas.sql (coluna contribuicao_valor)." : error.message }
  const lista = pessoas ?? []
  if (lista.length === 0) return vazio

  const { data: existentes } = await client.from("filiacao_cobrancas").select("filiacao_id").eq("emp_proprietaria_id", tenantId).eq("competencia", competencia)
  const jaTem = new Set((existentes ?? []).map((e) => String(e.filiacao_id)))
  const [ano, mes] = competencia.split("-").map(Number)
  const vencimento = `${competencia}-${String(config.diaVencimento).padStart(2, "0")}`
  const ordem = ano * 100 + mes
  let geradas = 0
  let semValor = 0
  let avisadas = 0
  for (const p of lista) {
    const id = String(p.id)
    if (jaTem.has(id)) continue
    const valor = p.contribuicao_valor === null || p.contribuicao_valor === undefined ? config.valorMensal : Number(p.contribuicao_valor)
    if (!valor || valor <= 0) {
      semValor++
      continue
    }
    const txid = txidDe(tenantId, id, competencia)
    const brcode = gerarBrCodePix({ chave: recebedor.chave, nome: recebedor.nome, cidade: recebedor.cidade, valor, txid, descricao: `Contribuicao ${rotuloCompetencia(competencia)}` })
    const { error: e } = await client.from("filiacao_cobrancas").insert({
      emp_proprietaria_id: tenantId,
      filiacao_id: id,
      cpf: cpfConfiavel(texto(p.cpf)),
      competencia,
      ordem,
      valor,
      forma: "pix",
      vencimento,
      txid,
      brcode,
      situacao: "aberta",
    })
    if (e) {
      console.error("cobrança:", e.message)
      continue
    }
    geradas++
    const cpf = cpfConfiavel(texto(p.cpf))
    if (cpf) {
      const ok = await avisarFiliado(
        {
          cpf,
          nome: texto(p.nome_completo),
          evento: "contribuicao",
          assunto: `Contribuição de ${rotuloCompetencia(competencia)}: Pix de ${formatarMoeda(valor)}`,
          texto: `Sua contribuição de ${rotuloCompetencia(competencia)} (${formatarMoeda(valor)}) está disponível para pagamento por Pix até ${vencimento.split("-").reverse().join("/")}. Abra Contribuição no portal para ver o QR Code.`,
          link: "/portal/contribuicao",
        },
        { client, tenantId, contexto }
      )
      if (ok) {
        avisadas++
        await client.from("filiacao_cobrancas").update({ avisada_em: new Date().toISOString() }).eq("filiacao_id", id).eq("competencia", competencia)
      }
    }
  }
  return { geradas, semValor, jaExistiam: jaTem.size, avisadas }
}

// ── Leitura ──────────────────────────────────────────────────────────────────

export async function listarCobrancas(filtro: { competencia?: string; situacao?: string } = {}): Promise<{ disponivel: boolean; cobrancas: Cobranca[]; competencias: string[] }> {
  const admin = await createAdminClient()
  const emp = await tenantAtual()
  let q = admin.from("filiacao_cobrancas").select("*, filiacao:filiacao_id (nome_completo)").eq("emp_proprietaria_id", emp)
  if (filtro.competencia) q = q.eq("competencia", filtro.competencia)
  if (filtro.situacao === "vencidas") q = q.eq("situacao", "aberta").lt("vencimento", hojeSP())
  else if (filtro.situacao && filtro.situacao !== "todas") q = q.eq("situacao", filtro.situacao)
  const [{ data, error }, comps] = await Promise.all([
    q.order("competencia", { ascending: false }).order("vencimento").limit(1000),
    admin.from("filiacao_cobrancas").select("competencia").eq("emp_proprietaria_id", emp).order("competencia", { ascending: false }).limit(2000),
  ])
  if (error) return { disponivel: !esquemaAusente(error), cobrancas: [], competencias: [] }
  const hoje = hojeSP()
  return {
    disponivel: true,
    cobrancas: (data ?? []).map((c) => {
      const f = (Array.isArray(c.filiacao) ? c.filiacao[0] : c.filiacao) as { nome_completo?: string | null } | null
      return { ...montar(c as Record<string, unknown>, hoje), nome: f?.nome_completo ?? null }
    }),
    competencias: [...new Set((comps.data ?? []).map((c) => String(c.competencia)))],
  }
}

export async function cobrancasDoFiliado(filiacaoIds: string[]): Promise<{ disponivel: boolean; cobrancas: Cobranca[] }> {
  if (filiacaoIds.length === 0) return { disponivel: true, cobrancas: [] }
  const admin = await createAdminClient()
  const { data, error } = await admin.from("filiacao_cobrancas").select("*").eq("emp_proprietaria_id", await tenantAtual()).in("filiacao_id", filiacaoIds).order("competencia", { ascending: false }).limit(36)
  if (error) return { disponivel: !esquemaAusente(error), cobrancas: [] }
  const hoje = hojeSP()
  return { disponivel: true, cobrancas: (data ?? []).map((c) => montar(c as Record<string, unknown>, hoje)) }
}

export type IndicadoresCobranca = { abertas: number; vencidas: number; valorAberto: number; pagas30d: number; valorPago30d: number }

export async function indicadoresCobranca(): Promise<IndicadoresCobranca> {
  const admin = await createAdminClient()
  const emp = await tenantAtual()
  const hoje = hojeSP()
  const d = new Date(`${hoje}T12:00:00Z`)
  d.setUTCDate(d.getUTCDate() - 30)
  const ha30 = d.toISOString().slice(0, 10)
  const [{ data: abertas }, { data: pagas }] = await Promise.all([
    admin.from("filiacao_cobrancas").select("valor, vencimento").eq("emp_proprietaria_id", emp).eq("situacao", "aberta").limit(5000),
    admin.from("filiacao_cobrancas").select("valor_pago, valor").eq("emp_proprietaria_id", emp).eq("situacao", "paga").gte("pago_em", ha30).limit(5000),
  ])
  const a = abertas ?? []
  const p = pagas ?? []
  return {
    abertas: a.length,
    vencidas: a.filter((x) => String(x.vencimento) < hoje).length,
    valorAberto: a.reduce((s, x) => s + Number(x.valor ?? 0), 0),
    pagas30d: p.length,
    valorPago30d: p.reduce((s, x) => s + Number(x.valor_pago ?? x.valor ?? 0), 0),
  }
}

// ── Baixa ────────────────────────────────────────────────────────────────────

async function remessaDaCompetencia(client: SupabaseClient, tenantId: string, competencia: string): Promise<string | null> {
  const [ano, mes] = competencia.split("-").map(Number)
  const ordem = ano * 100 + mes
  const { data } = await client.from("filiacao_recebe_remessa").select("id").eq("emp_proprietaria_id", tenantId).eq("tipo", "Associativa").eq("ordem", ordem).is("emp_contratante_id", null).limit(1)
  if (data?.length) return String(data[0].id)
  const { data: criada, error } = await client
    .from("filiacao_recebe_remessa")
    .insert({ emp_proprietaria_id: tenantId, ano: String(ano), mes: MESES[mes - 1], tipo: "Associativa", aberto: true, ordem })
    .select("id")
    .single()
  if (error || !criada) return null
  return String(criada.id)
}

/**
 * Dá baixa: cobrança paga + linha em `filiacao_recebe` (forma pix) na
 * remessa Associativa da competência. Idempotente para a mesma cobrança.
 */
export async function baixarCobranca(p: {
  cobrancaId: string
  dataPagamento: string
  valorPago: number
  bancoLancamentoId?: string | null
  usuarioId?: string | null
}, amb: Ambiente = {}): Promise<{ erro?: string; lancamentoId?: string }> {
  const { client, tenantId, contexto } = await ambiente(amb)
  const { data: c } = await client.from("filiacao_cobrancas").select("*").eq("id", p.cobrancaId).eq("emp_proprietaria_id", tenantId).maybeSingle()
  if (!c) return { erro: "Cobrança não encontrada." }
  if (c.situacao === "paga") return { lancamentoId: texto(c.lancamento_id) ?? undefined }
  if (c.situacao === "cancelada") return { erro: "Cobrança cancelada." }
  const remessaId = await remessaDaCompetencia(client, tenantId, String(c.competencia))
  if (!remessaId) return { erro: "Não foi possível localizar ou criar a remessa da competência." }
  const { data: filiado } = await client.from("filiacoes").select("cpf, matricula_sindical, nome_completo").eq("id", String(c.filiacao_id)).maybeSingle()
  const { data: lanc, error } = await client
    .from("filiacao_recebe")
    .insert({
      emp_proprietaria_id: tenantId,
      remessa_id: remessaId,
      filiado_id: String(c.filiacao_id),
      cpf: cpfConfiavel(texto(filiado?.cpf)) ?? texto(c.cpf),
      matricula_sindical: texto(filiado?.matricula_sindical),
      fonte_pg_id: null,
      valor: p.valorPago,
      forma_recebimento: "pix",
    })
    .select("id")
    .single()
  if (error || !lanc) return { erro: `Não foi possível lançar o recebimento: ${error?.message ?? "?"}` }
  const { error: e2 } = await client
    .from("filiacao_cobrancas")
    .update({ situacao: "paga", pago_em: p.dataPagamento, valor_pago: p.valorPago, lancamento_id: lanc.id, banco_lancamento_id: p.bancoLancamentoId ?? null, updated_at: new Date().toISOString() })
    .eq("id", p.cobrancaId)
  if (e2) return { erro: e2.message }
  invalidarCacheInadimplencia()
  const cpf = cpfConfiavel(texto(filiado?.cpf)) ?? cpfConfiavel(texto(c.cpf))
  if (cpf) {
    await avisarFiliado(
      {
        cpf,
        nome: texto(filiado?.nome_completo),
        evento: "contribuicao",
        assunto: `Contribuição de ${rotuloCompetencia(String(c.competencia))} recebida`,
        texto: `Recebemos sua contribuição de ${rotuloCompetencia(String(c.competencia))} (${formatarMoeda(p.valorPago)}). Obrigado!`,
        link: "/portal/contribuicao",
      },
      { client, tenantId, contexto }
    )
  }
  void emitirEvento("cobranca.paga", { cobrancaId: p.cobrancaId, filiacaoId: String(c.filiacao_id), cpf, competencia: String(c.competencia), valor: p.valorPago, pagoEm: p.dataPagamento, lancamentoId: String(lanc.id) }, { client, tenantId })
  return { lancamentoId: String(lanc.id) }
}

export async function cancelarCobranca(id: string): Promise<{ erro?: string }> {
  const admin = await createAdminClient()
  const { error } = await admin.from("filiacao_cobrancas").update({ situacao: "cancelada", updated_at: new Date().toISOString() }).eq("id", id).eq("emp_proprietaria_id", await tenantAtual()).eq("situacao", "aberta")
  return error ? { erro: error.message } : {}
}

/** Cobranças abertas que casam com um crédito do extrato: pelo txid no histórico/documento, ou pelo valor perto do vencimento. */
export async function cobrancasCandidatas(creditos: { id: string; valor: number; data: string; descricao: string | null; documento: string | null }[]): Promise<Map<string, { porTxid: boolean; cobrancas: Cobranca[] }>> {
  const saida = new Map<string, { porTxid: boolean; cobrancas: Cobranca[] }>()
  if (creditos.length === 0) return saida
  const admin = await createAdminClient()
  const { data, error } = await admin.from("filiacao_cobrancas").select("*, filiacao:filiacao_id (nome_completo)").eq("emp_proprietaria_id", await tenantAtual()).eq("situacao", "aberta").limit(5000)
  if (error || !data?.length) return saida
  const hoje = hojeSP()
  const abertas = data.map((c) => {
    const f = (Array.isArray(c.filiacao) ? c.filiacao[0] : c.filiacao) as { nome_completo?: string | null } | null
    return { ...montar(c as Record<string, unknown>, hoje), nome: f?.nome_completo ?? null }
  })
  for (const l of creditos) {
    const textoL = `${l.descricao ?? ""} ${l.documento ?? ""}`.toUpperCase()
    const porTxid = abertas.filter((c) => textoL.includes(c.txid.toUpperCase()))
    if (porTxid.length) {
      saida.set(l.id, { porTxid: true, cobrancas: porTxid.slice(0, 3) })
      continue
    }
    const d = new Date(`${l.data}T12:00:00Z`)
    const janela = (dias: number) => {
      const x = new Date(d)
      x.setUTCDate(x.getUTCDate() + dias)
      return x.toISOString().slice(0, 10)
    }
    const porValor = abertas.filter((c) => Math.abs(c.valor - l.valor) < 0.005 && c.vencimento >= janela(-40) && c.vencimento <= janela(10))
    if (porValor.length) saida.set(l.id, { porTxid: false, cobrancas: porValor.slice(0, 6) })
  }
  return saida
}
