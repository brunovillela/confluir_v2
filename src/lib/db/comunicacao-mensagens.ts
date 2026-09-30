import "server-only"

import type { SupabaseClient } from "@supabase/supabase-js"

import {
  aplicarVariaveis,
  EMAIL_VALIDO,
  PADRAO_ANIVERSARIO,
  pareceCelular,
  type SituacaoEmail,
} from "@/lib/comunicacao-mensagens-constantes"
import { cpfConfiavel } from "@/lib/cpf"
import { esquemaAusente, hojeSP, nomesDosUsuarios, texto } from "@/lib/db/comum"
import { enviarEmail, type ContextoEmail } from "@/lib/email"
import { escaparHtml, paragrafo } from "@/lib/email-layout"
import { createAdminClient, createServiceClient } from "@/lib/supabase/admin"
import { tenantAtual } from "@/lib/tenant"
import { origemAtual, origemDoTenant } from "@/lib/tenant-url"

/**
 * Comunicação › Mensagens aos filiados. Cada mensagem (o parabéns de um dia ou
 * uma mala direta) tem os seus destinatários em comunicacao_envios, um por CPF,
 * com a situação do e-mail e a marca de quando alguém abriu o WhatsApp.
 *
 * O envio é em lotes (como o aviso aos aptos das votações): pega os pendentes,
 * manda alguns em paralelo e grava a situação de cada um — dá para retomar de
 * onde parou. As funções recebem o tenant e o client explícitos quando rodam
 * no agendador (sem requisição). SQL: supabase/comunicacao-mensagens.sql.
 */

export const AVISO_SQL_MENSAGENS =
  "Rode supabase/comunicacao-mensagens.sql no Supabase para ativar as mensagens aos filiados."

/** Envios simultâneos ao provedor de e-mail (ele limita a taxa). */
const PARALELO = 6
const LOTE_PADRAO = 60

type Db = SupabaseClient

export type Destinatario = {
  filiacaoId: string
  cpf: string
  nome: string
  email: string | null
  telefone: string | null
}

// ── Contatos ───────────────────────────────────────────────────────────────

type LinhaFiliacao = Record<string, unknown>

const CAMPOS_CONTATO =
  "id, cpf, nome_completo, email_pessoal, email_corporativo, telefone_1, telefone_1_whatsapp, telefone_2, telefone_2_whatsapp, updated_at"

/**
 * E-mail e WhatsApp de cada filiado. Primeiro o que está na ficha; depois as
 * tabelas `emails` e `telefones` (muitos cadastros antigos só têm contato lá).
 */
async function contatos(db: Db, emp: string, linhas: LinhaFiliacao[]): Promise<Map<string, { email: string | null; telefone: string | null }>> {
  const ids = linhas.map((l) => String(l.id))
  const extrasEmail = new Map<string, { email: string; favorito: boolean }>()
  const extrasFone = new Map<string, { numero: string; favorito: boolean; whatsapp: boolean }>()
  for (let i = 0; i < ids.length; i += 200) {
    const fatia = ids.slice(i, i + 200)
    const [{ data: es }, { data: fs }] = await Promise.all([
      db.from("emails").select("filiado_id, email, favorito").eq("emp_proprietaria_id", emp).in("filiado_id", fatia),
      db.from("telefones").select("filiado_id, numero, favorito, whatsapp").eq("emp_proprietaria_id", emp).in("filiado_id", fatia),
    ])
    for (const e of es ?? []) {
      const email = texto(e.email)?.trim().toLowerCase()
      if (!email || !EMAIL_VALIDO.test(email)) continue
      const atual = extrasEmail.get(String(e.filiado_id))
      if (!atual || (e.favorito && !atual.favorito)) extrasEmail.set(String(e.filiado_id), { email, favorito: !!e.favorito })
    }
    for (const t of fs ?? []) {
      const numero = texto(t.numero)
      if (!numero || !pareceCelular(numero)) continue
      const atual = extrasFone.get(String(t.filiado_id))
      const melhor = !atual || (t.whatsapp && !atual.whatsapp) || (t.whatsapp === atual.whatsapp && t.favorito && !atual.favorito)
      if (melhor) extrasFone.set(String(t.filiado_id), { numero, favorito: !!t.favorito, whatsapp: !!t.whatsapp })
    }
  }
  const resultado = new Map<string, { email: string | null; telefone: string | null }>()
  for (const l of linhas) {
    const id = String(l.id)
    const email =
      [texto(l.email_pessoal), texto(l.email_corporativo)]
        .map((e) => e?.trim().toLowerCase() ?? null)
        .find((e) => e && EMAIL_VALIDO.test(e)) ?? extrasEmail.get(id)?.email ?? null
    // WhatsApp: número marcado como WhatsApp; senão, o primeiro celular.
    const fones = [
      { n: texto(l.telefone_1), w: l.telefone_1_whatsapp === true },
      { n: texto(l.telefone_2), w: l.telefone_2_whatsapp === true },
    ]
    const telefone =
      fones.find((f) => f.w && pareceCelular(f.n))?.n ??
      (extrasFone.get(id)?.whatsapp ? extrasFone.get(id)!.numero : null) ??
      fones.find((f) => pareceCelular(f.n))?.n ??
      extrasFone.get(id)?.numero ??
      null
    resultado.set(id, { email, telefone })
  }
  return resultado
}

/** Um destinatário por pessoa (CPF); fica a ficha atualizada mais recentemente. */
function porPessoa(linhas: LinhaFiliacao[]): LinhaFiliacao[] {
  const mapa = new Map<string, LinhaFiliacao>()
  for (const l of linhas) {
    const chave = cpfConfiavel(texto(l.cpf)) ?? `id:${l.id}`
    const atual = mapa.get(chave)
    if (!atual || String(l.updated_at ?? "") > String(atual.updated_at ?? "")) mapa.set(chave, l)
  }
  return [...mapa.values()]
}

// ── Aniversariantes ────────────────────────────────────────────────────────

function ehBissexto(ano: number): boolean {
  return (ano % 4 === 0 && ano % 100 !== 0) || ano % 400 === 0
}

/**
 * Filiados ATIVOS que fazem aniversário na data (AAAA-MM-DD). Em ano que não
 * é bissexto, quem nasceu em 29/02 entra no dia 28/02.
 */
export async function aniversariantesDoDia(dataISO: string, opcoes: { tenantId?: string; db?: Db } = {}): Promise<Destinatario[]> {
  const db = opcoes.db ?? (await createAdminClient())
  const emp = opcoes.tenantId ?? (await tenantAtual())
  const [ano, mes, dia] = dataISO.split("-").map(Number)
  const dias = mes === 2 && dia === 28 && !ehBissexto(ano) ? [28, 29] : [dia]
  const { data, error } = await db
    .from("filiacoes")
    .select(CAMPOS_CONTATO)
    .eq("emp_proprietaria_id", emp)
    .eq("filiacao_condicao", "Ativo")
    .not("filiacao_excluida", "is", true)
    .eq("nascimento_mes", mes)
    .in("nascimento_dia", dias)
    .limit(2000)
  if (error) throw new Error(`Falha ao ler os aniversariantes: ${error.message}`)
  const linhas = porPessoa(data ?? [])
  const mapa = await contatos(db, emp, linhas)
  return linhas
    .map((l) => ({
      filiacaoId: String(l.id),
      cpf: cpfConfiavel(texto(l.cpf)) ?? `id:${l.id}`,
      nome: texto(l.nome_completo) ?? "(sem nome)",
      email: mapa.get(String(l.id))?.email ?? null,
      telefone: mapa.get(String(l.id))?.telefone ?? null,
    }))
    .sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"))
}

// ── Configuração do parabéns ───────────────────────────────────────────────

export type ConfigAniversario = {
  disponivel: boolean
  ativo: boolean
  assunto: string
  mensagem: string
  textoWhatsapp: string
  atualizadoPorNome: string | null
  atualizadoEm: string | null
}

export async function obterConfigAniversario(opcoes: { tenantId?: string; db?: Db } = {}): Promise<ConfigAniversario> {
  const db = opcoes.db ?? (await createAdminClient())
  const { data, error } = await db
    .from("comunicacao_aniversario_config")
    .select("ativo, assunto, mensagem, texto_whatsapp, atualizado_por, updated_at")
    .eq("emp_proprietaria_id", opcoes.tenantId ?? (await tenantAtual()))
    .maybeSingle()
  if (error && !esquemaAusente(error)) throw new Error(`Falha ao ler a configuração: ${error.message}`)
  const nomes = data?.atualizado_por ? await nomesDosUsuarios([String(data.atualizado_por)]) : new Map<string, string>()
  return {
    disponivel: !error,
    ativo: data?.ativo === true,
    assunto: texto(data?.assunto) ?? PADRAO_ANIVERSARIO.assunto,
    mensagem: texto(data?.mensagem) ?? PADRAO_ANIVERSARIO.mensagem,
    textoWhatsapp: texto(data?.texto_whatsapp) ?? PADRAO_ANIVERSARIO.textoWhatsapp,
    atualizadoPorNome: data?.atualizado_por ? (nomes.get(String(data.atualizado_por)) ?? null) : null,
    atualizadoEm: texto(data?.updated_at),
  }
}

export async function salvarConfigAniversario(
  c: { ativo: boolean; assunto: string; mensagem: string; textoWhatsapp: string },
  usuarioId: string
): Promise<{ erro?: string }> {
  if (!c.assunto.trim()) return { erro: "Escreva o assunto do e-mail." }
  if (!c.mensagem.trim()) return { erro: "Escreva a mensagem do e-mail." }
  if (!c.textoWhatsapp.trim()) return { erro: "Escreva o texto do WhatsApp." }
  const admin = await createAdminClient()
  const { error } = await admin.from("comunicacao_aniversario_config").upsert(
    {
      emp_proprietaria_id: await tenantAtual(),
      ativo: c.ativo,
      assunto: c.assunto.trim(),
      mensagem: c.mensagem.trim(),
      texto_whatsapp: c.textoWhatsapp.trim(),
      atualizado_por: usuarioId,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "emp_proprietaria_id" }
  )
  if (error) return { erro: esquemaAusente(error) ? AVISO_SQL_MENSAGENS : `Não foi possível salvar: ${error.message}` }
  return {}
}

// ── Identidade da entidade no e-mail ───────────────────────────────────────

/** Nome, e-mail de contato e endereço do tenant — para envios sem requisição. */
export async function contextoDoTenant(tenantId: string, db: Db): Promise<ContextoEmail> {
  const [{ data: emp }, { data: t }] = await Promise.all([
    db.from("empresa").select("nome_fantasia, nome_razao, email_contato").eq("id", tenantId).maybeSingle(),
    db.from("tenants").select("slug").eq("empresa_id", tenantId).maybeSingle(),
  ])
  const slug = texto(t?.slug)
  return {
    entidade: texto(emp?.nome_fantasia) ?? texto(emp?.nome_razao) ?? "Confluir",
    emailContato: texto(emp?.email_contato),
    origem: slug ? origemDoTenant(slug) : await origemAtual(),
  }
}

// ── Mensagens e envios ─────────────────────────────────────────────────────

/** Texto simples → parágrafos do e-mail (linha em branco separa parágrafos). */
export function textoParaHtml(texto: string): string {
  return texto
    .trim()
    .split(/\n\s*\n/)
    .map((p) => paragrafo(escaparHtml(p.trim()).replace(/\n/g, "<br>")))
    .join("\n")
}

function dataBR(iso: string): string {
  const [a, m, d] = iso.split("-")
  return `${d}/${m}/${a}`
}

/**
 * Cria (ou completa) o parabéns do dia: a mensagem, com o texto da
 * configuração, e um destinatário por aniversariante. Idempotente — rodar de
 * novo só acrescenta quem faltava.
 */
export async function prepararAniversario(dataISO: string, opcoes: { tenantId?: string; db?: Db } = {}): Promise<{ mensagemId?: string; erro?: string }> {
  const db = opcoes.db ?? (await createAdminClient())
  const emp = opcoes.tenantId ?? (await tenantAtual())
  const cfg = await obterConfigAniversario({ tenantId: emp, db })
  if (!cfg.disponivel) return { erro: AVISO_SQL_MENSAGENS }

  const { data: existente, error: erroBusca } = await db
    .from("comunicacao_mensagens")
    .select("id")
    .eq("emp_proprietaria_id", emp)
    .eq("tipo", "aniversario")
    .eq("referencia", dataISO)
    .maybeSingle()
  if (erroBusca) return { erro: esquemaAusente(erroBusca) ? AVISO_SQL_MENSAGENS : erroBusca.message }
  let mensagemId = texto(existente?.id)
  const pessoas = await aniversariantesDoDia(dataISO, { tenantId: emp, db })
  // Dia sem aniversariante não vira mensagem.
  if (!mensagemId && pessoas.length === 0) return {}
  if (mensagemId) {
    // Enquanto nenhum e-mail do dia saiu, a mensagem segue o texto configurado
    // (a tela prepara o dia ao abrir; uma edição feita depois ainda vale).
    const { count } = await db
      .from("comunicacao_envios")
      .select("id", { count: "exact", head: true })
      .eq("mensagem_id", mensagemId)
      .in("email_situacao", ["enviado", "falha", "duplicado"])
    if (!count) {
      await db
        .from("comunicacao_mensagens")
        .update({ assunto: cfg.assunto, corpo: cfg.mensagem, texto_whatsapp: cfg.textoWhatsapp })
        .eq("id", mensagemId)
    }
  }
  if (!mensagemId) {
    const { data: nova, error } = await db
      .from("comunicacao_mensagens")
      .insert({
        emp_proprietaria_id: emp,
        tipo: "aniversario",
        referencia: dataISO,
        titulo: `Aniversariantes de ${dataBR(dataISO)}`,
        assunto: cfg.assunto,
        corpo: cfg.mensagem,
        texto_whatsapp: cfg.textoWhatsapp,
        situacao: "enviando",
      })
      .select("id")
      .single()
    if (error || !nova) {
      // Corrida com outra execução: a mensagem do dia é única.
      const { data: outra } = await db
        .from("comunicacao_mensagens")
        .select("id")
        .eq("emp_proprietaria_id", emp)
        .eq("tipo", "aniversario")
        .eq("referencia", dataISO)
        .maybeSingle()
      mensagemId = texto(outra?.id)
      if (!mensagemId) return { erro: `Não foi possível preparar o parabéns: ${error?.message ?? "?"}` }
    } else {
      mensagemId = String(nova.id)
    }
  }

  if (pessoas.length) {
    const { error } = await db.from("comunicacao_envios").upsert(
      pessoas.map((p) => ({
        emp_proprietaria_id: emp,
        mensagem_id: mensagemId,
        filiacao_id: p.filiacaoId,
        cpf: p.cpf,
        nome: p.nome,
        email: p.email,
        telefone: p.telefone,
        email_situacao: p.email ? "pendente" : "sem_email",
      })),
      { onConflict: "mensagem_id,cpf", ignoreDuplicates: true }
    )
    if (error) return { erro: `Não foi possível registrar os aniversariantes: ${error.message}` }
  }
  return { mensagemId }
}

export type Envio = {
  id: string
  filiacaoId: string | null
  cpf: string
  nome: string
  email: string | null
  telefone: string | null
  situacao: SituacaoEmail
  emailEm: string | null
  erro: string | null
  whatsappEm: string | null
  whatsappPorNome: string | null
}

export type MensagemResumo = {
  id: string
  tipo: "aniversario" | "mala_direta"
  referencia: string | null
  titulo: string | null
  assunto: string | null
  corpo: string | null
  textoWhatsapp: string | null
  situacao: string
  enviadaEm: string | null
}

export async function mensagemDoAniversario(dataISO: string): Promise<{ mensagem: MensagemResumo | null; envios: Envio[] }> {
  const admin = await createAdminClient()
  const emp = await tenantAtual()
  const { data, error } = await admin
    .from("comunicacao_mensagens")
    .select("id, tipo, referencia, titulo, assunto, corpo, texto_whatsapp, situacao, enviada_em")
    .eq("emp_proprietaria_id", emp)
    .eq("tipo", "aniversario")
    .eq("referencia", dataISO)
    .maybeSingle()
  if (error) {
    if (esquemaAusente(error)) return { mensagem: null, envios: [] }
    throw new Error(`Falha ao ler o parabéns: ${error.message}`)
  }
  if (!data) return { mensagem: null, envios: [] }
  return { mensagem: mapearMensagem(data), envios: await enviosDaMensagem(String(data.id)) }
}

function mapearMensagem(d: Record<string, unknown>): MensagemResumo {
  return {
    id: String(d.id),
    tipo: d.tipo === "aniversario" ? "aniversario" : "mala_direta",
    referencia: texto(d.referencia),
    titulo: texto(d.titulo),
    assunto: texto(d.assunto),
    corpo: texto(d.corpo),
    textoWhatsapp: texto(d.texto_whatsapp),
    situacao: String(d.situacao ?? "rascunho"),
    enviadaEm: texto(d.enviada_em),
  }
}

export async function enviosDaMensagem(mensagemId: string): Promise<Envio[]> {
  const admin = await createAdminClient()
  const emp = await tenantAtual()
  const linhas: Record<string, unknown>[] = []
  for (let de = 0; ; de += 1000) {
    const { data, error } = await admin
      .from("comunicacao_envios")
      .select("id, filiacao_id, cpf, nome, email, telefone, email_situacao, email_em, email_erro, whatsapp_em, whatsapp_por")
      .eq("emp_proprietaria_id", emp)
      .eq("mensagem_id", mensagemId)
      .order("nome")
      .order("id")
      .range(de, de + 999)
    if (error) throw new Error(`Falha ao ler os destinatários: ${error.message}`)
    linhas.push(...(data ?? []))
    if ((data ?? []).length < 1000) break
  }
  const nomes = await nomesDosUsuarios(linhas.map((l) => texto(l.whatsapp_por)).filter((v): v is string => !!v))
  return linhas.map((l) => ({
    id: String(l.id),
    filiacaoId: texto(l.filiacao_id),
    cpf: String(l.cpf ?? ""),
    nome: texto(l.nome) ?? "(sem nome)",
    email: texto(l.email),
    telefone: texto(l.telefone),
    situacao: (l.email_situacao as SituacaoEmail) ?? "pendente",
    emailEm: texto(l.email_em),
    erro: texto(l.email_erro),
    whatsappEm: texto(l.whatsapp_em),
    whatsappPorNome: l.whatsapp_por ? (nomes.get(String(l.whatsapp_por)) ?? null) : null,
  }))
}

/** Marca que alguém abriu o WhatsApp para este destinatário. */
export async function marcarWhatsapp(envioId: string, usuarioId: string): Promise<{ erro?: string }> {
  const admin = await createAdminClient()
  const { error } = await admin
    .from("comunicacao_envios")
    .update({ whatsapp_em: new Date().toISOString(), whatsapp_por: usuarioId })
    .eq("id", envioId)
    .eq("emp_proprietaria_id", await tenantAtual())
  return error ? { erro: error.message } : {}
}

/** HTML do e-mail de um destinatário (o miolo; a moldura vem do enviarEmail). */
function htmlDoEnvio(msg: MensagemResumo, nome: string, entidade: string): string {
  return textoParaHtml(aplicarVariaveis(msg.corpo ?? "", { nome, entidade }))
}

/**
 * Envia um lote dos e-mails pendentes da mensagem. Devolve quantos ainda
 * faltam — quem chama repete até zerar. Sem `contexto`, a identidade da
 * entidade sai da requisição atual.
 */
export async function enviarLote(
  mensagemId: string,
  opcoes: { tenantId?: string; db?: Db; contexto?: ContextoEmail; limite?: number } = {}
): Promise<{ enviados: number; falhas: number; restantes: number; erro?: string }> {
  const db = opcoes.db ?? (await createAdminClient())
  const emp = opcoes.tenantId ?? (await tenantAtual())
  const contexto = opcoes.contexto ?? (await contextoDoTenant(emp, db))

  const { data: m, error: erroMsg } = await db
    .from("comunicacao_mensagens")
    .select("id, tipo, referencia, titulo, assunto, corpo, texto_whatsapp, situacao, enviada_em")
    .eq("id", mensagemId)
    .eq("emp_proprietaria_id", emp)
    .maybeSingle()
  if (erroMsg || !m) return { enviados: 0, falhas: 0, restantes: 0, erro: erroMsg?.message ?? "Mensagem não encontrada." }
  const msg = mapearMensagem(m)
  if (msg.situacao === "cancelada") return { enviados: 0, falhas: 0, restantes: 0, erro: "A mensagem foi cancelada." }

  const { data: pendentes, error } = await db
    .from("comunicacao_envios")
    .select("id, nome, email")
    .eq("mensagem_id", mensagemId)
    .eq("email_situacao", "pendente")
    .order("id")
    .limit(opcoes.limite ?? LOTE_PADRAO)
  if (error) return { enviados: 0, falhas: 0, restantes: 0, erro: error.message }

  // O mesmo e-mail em duas pessoas (casal, e-mail da família) recebe uma vez.
  const { data: jaEnviados } = await db
    .from("comunicacao_envios")
    .select("email")
    .eq("mensagem_id", mensagemId)
    .eq("email_situacao", "enviado")
  const vistos = new Set((jaEnviados ?? []).map((e) => String(e.email ?? "").toLowerCase()))

  const enviados: string[] = []
  const duplicados: string[] = []
  const falhas: { id: string; erro: string }[] = []
  const fila: { id: string; nome: string; email: string }[] = []
  for (const p of pendentes ?? []) {
    const email = String(p.email ?? "").toLowerCase()
    if (vistos.has(email)) duplicados.push(String(p.id))
    else {
      vistos.add(email)
      fila.push({ id: String(p.id), nome: texto(p.nome) ?? "", email })
    }
  }

  for (let i = 0; i < fila.length; i += PARALELO) {
    const bloco = fila.slice(i, i + PARALELO)
    const oks = await Promise.all(
      bloco.map((d) =>
        enviarEmail({
          email: d.email,
          nome: d.nome,
          assunto: aplicarVariaveis(msg.assunto ?? "", { nome: d.nome, entidade: contexto.entidade }),
          html: htmlDoEnvio(msg, d.nome, contexto.entidade),
          contexto,
        }).catch(() => false)
      )
    )
    bloco.forEach((d, j) => (oks[j] ? enviados.push(d.id) : falhas.push({ id: d.id, erro: "O provedor de e-mail recusou ou não respondeu." })))
  }

  const agora = new Date().toISOString()
  if (enviados.length) await db.from("comunicacao_envios").update({ email_situacao: "enviado", email_em: agora, email_erro: null }).in("id", enviados)
  if (duplicados.length) await db.from("comunicacao_envios").update({ email_situacao: "duplicado", email_em: agora }).in("id", duplicados)
  if (falhas.length) await db.from("comunicacao_envios").update({ email_situacao: "falha", email_em: agora, email_erro: falhas[0].erro }).in("id", falhas.map((f) => f.id))

  const { count } = await db
    .from("comunicacao_envios")
    .select("id", { count: "exact", head: true })
    .eq("mensagem_id", mensagemId)
    .eq("email_situacao", "pendente")
  const restantes = count ?? 0
  if (restantes === 0) {
    await db
      .from("comunicacao_mensagens")
      .update({ situacao: "enviada", enviada_em: msg.enviadaEm ?? agora, updated_at: agora })
      .eq("id", mensagemId)
  }
  return { enviados: enviados.length, falhas: falhas.length, restantes }
}

/** Devolve à fila os e-mails que falharam. */
export async function reenviarFalhas(mensagemId: string): Promise<{ erro?: string; quantos?: number }> {
  const admin = await createAdminClient()
  const { data, error } = await admin
    .from("comunicacao_envios")
    .update({ email_situacao: "pendente", email_erro: null })
    .eq("mensagem_id", mensagemId)
    .eq("emp_proprietaria_id", await tenantAtual())
    .eq("email_situacao", "falha")
    .select("id")
  if (error) return { erro: error.message }
  await admin.from("comunicacao_mensagens").update({ situacao: "enviando" }).eq("id", mensagemId)
  return { quantos: (data ?? []).length }
}

// ── Agendador ──────────────────────────────────────────────────────────────

/**
 * O parabéns automático de hoje, em todos os tenants com ele ligado: prepara a
 * mensagem do dia e manda os e-mails. Chamado pelo tick diário da Comunicação.
 * `somente` roda um tenant só (disparo manual e testes).
 */
export async function executarAniversarios(somente?: string | null): Promise<{ tenant: string; enviados: number; falhas: number; erro?: string }[]> {
  const svc = createServiceClient()
  const { data, error } = await svc.from("comunicacao_aniversario_config").select("emp_proprietaria_id").eq("ativo", true)
  if (error) return esquemaAusente(error) ? [] : [{ tenant: "-", enviados: 0, falhas: 0, erro: error.message }]
  const hoje = hojeSP()
  const resultados: { tenant: string; enviados: number; falhas: number; erro?: string }[] = []
  for (const linha of data ?? []) {
    const tenantId = String(linha.emp_proprietaria_id)
    if (somente && tenantId !== somente) continue
    try {
      const prep = await prepararAniversario(hoje, { tenantId, db: svc })
      if (!prep.mensagemId) {
        // Sem erro = ninguém faz aniversário hoje.
        if (prep.erro) resultados.push({ tenant: tenantId, enviados: 0, falhas: 0, erro: prep.erro })
        continue
      }
      const contexto = await contextoDoTenant(tenantId, svc)
      let enviados = 0
      let falhas = 0
      for (let volta = 0; volta < 40; volta++) {
        const r = await enviarLote(prep.mensagemId, { tenantId, db: svc, contexto })
        enviados += r.enviados
        falhas += r.falhas
        if (r.erro || r.restantes === 0 || r.enviados + r.falhas === 0) break
      }
      resultados.push({ tenant: tenantId, enviados, falhas })
    } catch (e) {
      resultados.push({ tenant: tenantId, enviados: 0, falhas: 0, erro: e instanceof Error ? e.message : String(e) })
    }
  }
  return resultados
}
