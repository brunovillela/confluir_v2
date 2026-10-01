import "server-only"

import type { SupabaseClient } from "@supabase/supabase-js"

import {
  aplicarVariaveis,
  CONDICAO_SEM_INFORMACAO,
  corpoParaEmailHtml,
  EMAIL_VALIDO,
  escolherModelo,
  HORA_ENVIO_PADRAO,
  normalizarCriterios,
  normalizarFiltros,
  numeroWhatsapp,
  PADRAO_ANIVERSARIO,
  pareceCelular,
  ROTULO_SITUACAO_EMAIL,
  rotuloHora,
  somarDias,
  type Antecedencia,
  semCriterios,
  type CriteriosAniversario,
  type FiltrosMalaDireta,
  type ModeloAniversario,
  type PerfilAniversario,
  type SituacaoEmail,
  type SituacaoMensagem,
} from "@/lib/comunicacao-mensagens-constantes"
import { cpfConfiavel } from "@/lib/cpf"
import { descadastradosDoTenant, tokenDescadastro } from "@/lib/db/comunicacao-descadastro"
import { esquemaAusente, hojeSP, nomesDosUsuarios, texto } from "@/lib/db/comum"
import { baseRelatorios, filtrarRelatorio, type BaseRelatorios, type LinhaRelatorio } from "@/lib/db/filiacao-relatorios"
import { enviarEmail, type ContextoEmail } from "@/lib/email"
import { botaoEmail, COR, escaparHtml, paragrafo, textoSuave, tituloEmail } from "@/lib/email-layout"
import { ROTULOS_FORMA_RECEBIMENTO, type FormaRecebimento } from "@/lib/filiacao"
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
  const fatias: string[][] = []
  for (let i = 0; i < ids.length; i += 200) fatias.push(ids.slice(i, i + 200))
  // Quatro fatias por vez: a mala direta pode ter milhares de pessoas.
  const lidas: { es: Record<string, unknown>[]; fs: Record<string, unknown>[] }[] = []
  for (let i = 0; i < fatias.length; i += 4) {
    lidas.push(
      ...(await Promise.all(
        fatias.slice(i, i + 4).map(async (fatia) => {
          const [{ data: es }, { data: fs }] = await Promise.all([
            db.from("emails").select("filiado_id, email, favorito").eq("emp_proprietaria_id", emp).in("filiado_id", fatia),
            db.from("telefones").select("filiado_id, numero, favorito, whatsapp").eq("emp_proprietaria_id", emp).in("filiado_id", fatia),
          ])
          return { es: es ?? [], fs: fs ?? [] }
        })
      ))
    )
  }
  for (const { es, fs } of lidas) {
    for (const e of es) {
      const email = texto(e.email)?.trim().toLowerCase()
      if (!email || !EMAIL_VALIDO.test(email)) continue
      const atual = extrasEmail.get(String(e.filiado_id))
      if (!atual || (e.favorito && !atual.favorito)) extrasEmail.set(String(e.filiado_id), { email, favorito: !!e.favorito })
    }
    for (const t of fs) {
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

export type Aniversariante = Destinatario & { perfil: PerfilAniversario }

/** Anos completos entre duas datas AAAA-MM-DD. */
function anosEntre(de: string, ate: string): number {
  const [a1, m1, d1] = de.slice(0, 10).split("-").map(Number)
  const [a2, m2, d2] = ate.split("-").map(Number)
  return a2 - a1 - (m2 < m1 || (m2 === m1 && d2 < d1) ? 1 : 0)
}

type VinculoPerfil = {
  filiado_id: string
  fonte_pagadora_id: string | null
  condicao_na_fonte: string | null
  data_filiacao: string | null
  filiacao_data_adesao: string | null
  data_desfiliacao: string | null
  filiacao_data_saida: string | null
}

/**
 * Fonte e condição do vínculo corrente (em aberto mais recente; senão o mais
 * recente) e a primeira filiação — o mesmo critério dos relatórios de filiados.
 */
function perfilDosVinculos(vs: VinculoPerfil[]): { fonteId: string | null; condicaoFonte: string | null; primeira: string | null } {
  const data = (v: VinculoPerfil) => texto(v.data_filiacao) ?? texto(v.filiacao_data_adesao)
  const aberto = (v: VinculoPerfil) => !v.data_desfiliacao && !v.filiacao_data_saida
  let corrente: VinculoPerfil | null = null
  for (const v of vs) {
    if (!corrente || (aberto(v) !== aberto(corrente) ? aberto(v) : (data(v) ?? "") > (data(corrente) ?? ""))) corrente = v
  }
  const datas = vs.map(data).filter((d): d is string => !!d).sort()
  return {
    fonteId: corrente ? texto(corrente.fonte_pagadora_id) : null,
    condicaoFonte: corrente ? texto(corrente.condicao_na_fonte) : null,
    primeira: datas[0] ?? null,
  }
}

/**
 * Filiados ATIVOS que fazem aniversário na data (AAAA-MM-DD), com o perfil que
 * escolhe a mensagem específica (idade que completa, tempo de filiação, fonte,
 * lugar). Em ano que não é bissexto, quem nasceu em 29/02 entra no dia 28/02.
 */
export async function aniversariantesDoDia(dataISO: string, opcoes: { tenantId?: string; db?: Db } = {}): Promise<Aniversariante[]> {
  const db = opcoes.db ?? (await createAdminClient())
  const emp = opcoes.tenantId ?? (await tenantAtual())
  const [ano, mes, dia] = dataISO.split("-").map(Number)
  const dias = mes === 2 && dia === 28 && !ehBissexto(ano) ? [28, 29] : [dia]
  const { data, error } = await db
    .from("filiacoes")
    .select(`${CAMPOS_CONTATO}, nascimento_data, endereco_estado, endereco_cidade`)
    .eq("emp_proprietaria_id", emp)
    .eq("filiacao_condicao", "Ativo")
    .not("filiacao_excluida", "is", true)
    .eq("nascimento_mes", mes)
    .in("nascimento_dia", dias)
    .limit(2000)
  if (error) throw new Error(`Falha ao ler os aniversariantes: ${error.message}`)
  const todas = data ?? []
  const linhas = porPessoa(todas)
  const chave = (l: LinhaFiliacao) => cpfConfiavel(texto(l.cpf)) ?? `id:${l.id}`

  // Vínculos de todos os cadastros da pessoa (o histórico pode estar noutro registro do CPF).
  const cpfDoId = new Map(todas.map((l) => [String(l.id), chave(l)]))
  const vinculosPorPessoa = new Map<string, VinculoPerfil[]>()
  const ids = [...cpfDoId.keys()]
  for (let i = 0; i < ids.length; i += 200) {
    const { data: vs } = await db
      .from("filiacao_vinculos")
      .select("filiado_id, fonte_pagadora_id, condicao_na_fonte, data_filiacao, filiacao_data_adesao, data_desfiliacao, filiacao_data_saida")
      .in("filiado_id", ids.slice(i, i + 200))
    for (const v of (vs ?? []) as VinculoPerfil[]) {
      const k = cpfDoId.get(String(v.filiado_id))
      if (k) vinculosPorPessoa.set(k, [...(vinculosPorPessoa.get(k) ?? []), v])
    }
  }

  const mapa = await contatos(db, emp, linhas)
  return linhas
    .map((l) => {
      const nascimento = texto(l.nascimento_data)
      const vinc = perfilDosVinculos(vinculosPorPessoa.get(chave(l)) ?? [])
      return {
        filiacaoId: String(l.id),
        cpf: chave(l),
        nome: texto(l.nome_completo) ?? "(sem nome)",
        email: mapa.get(String(l.id))?.email ?? null,
        telefone: mapa.get(String(l.id))?.telefone ?? null,
        perfil: {
          // É o dia do aniversário: a idade que completa é a diferença dos anos
          // (vale também para quem nasceu em 29/02 e comemora em 28/02).
          idade: nascimento ? ano - Number(nascimento.slice(0, 4)) : null,
          filiadoHa: vinc.primeira ? Math.max(0, anosEntre(vinc.primeira, dataISO)) : null,
          fonteId: vinc.fonteId,
          condicaoFonte: vinc.condicaoFonte,
          uf: texto(l.endereco_estado)?.trim().toUpperCase() ?? null,
          cidade: texto(l.endereco_cidade),
        },
      }
    })
    .sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"))
}

// ── Configuração do parabéns ───────────────────────────────────────────────

export const AVISO_SQL_MODELOS =
  "Rode supabase/comunicacao-aniversario-modelos.sql no Supabase para ativar as mensagens específicas e o horário do envio."

export const AVISO_SQL_VESPERA =
  "Rode supabase/comunicacao-aniversario-vespera.sql no Supabase para escolher entre o dia e a véspera."

export type ConfigAniversario = {
  disponivel: boolean
  /** O SQL das mensagens específicas e do horário já rodou. */
  completo: boolean
  ativo: boolean
  horaEnvio: number
  /** 0 = o parabéns chega no dia do aniversário; 1 = na véspera. */
  parabensAntecedencia: Antecedencia
  /** 0 = o aviso à equipe chega no dia; 1 = na véspera. */
  avisoAntecedencia: Antecedencia
  /** O SQL do "no dia ou na véspera" já rodou. */
  temAntecedencia: boolean
  /** E-mails da equipe que recebem a lista do dia (separados por vírgula). */
  avisoEquipeEmails: string[]
  assunto: string
  mensagem: string
  textoWhatsapp: string
  atualizadoPorNome: string | null
  atualizadoEm: string | null
}

export async function obterConfigAniversario(opcoes: { tenantId?: string; db?: Db } = {}): Promise<ConfigAniversario> {
  const db = opcoes.db ?? (await createAdminClient())
  const emp = opcoes.tenantId ?? (await tenantAtual())
  const base = "ativo, assunto, mensagem, texto_whatsapp, atualizado_por, updated_at"
  const tabela = () => db.from("comunicacao_aniversario_config")
  let completo = true
  let temAntecedencia = true
  let r = await tabela()
    .select(`${base}, hora_envio, aviso_equipe_emails, parabens_antecedencia, aviso_antecedencia`)
    .eq("emp_proprietaria_id", emp)
    .maybeSingle()
  if (r.error && esquemaAusente(r.error)) {
    // Sem o SQL da véspera: tudo no dia.
    temAntecedencia = false
    r = await tabela().select(`${base}, hora_envio, aviso_equipe_emails`).eq("emp_proprietaria_id", emp).maybeSingle()
  }
  if (r.error && esquemaAusente(r.error)) {
    // Sem o SQL das mensagens específicas: segue com o que já existia (9h, sem aviso).
    completo = false
    r = await tabela().select(base).eq("emp_proprietaria_id", emp).maybeSingle()
  }
  const { data, error } = r as { data: Record<string, unknown> | null; error: typeof r.error }
  if (error && !esquemaAusente(error)) throw new Error(`Falha ao ler a configuração: ${error.message}`)
  const nomes = data?.atualizado_por ? await nomesDosUsuarios([String(data.atualizado_por)]) : new Map<string, string>()
  const hora = Number(data?.hora_envio)
  return {
    disponivel: !error,
    completo: !error && completo,
    ativo: data?.ativo === true,
    horaEnvio: Number.isInteger(hora) && hora >= 0 && hora <= 23 ? hora : HORA_ENVIO_PADRAO,
    parabensAntecedencia: Number(data?.parabens_antecedencia) === 1 ? 1 : 0,
    avisoAntecedencia: Number(data?.aviso_antecedencia) === 1 ? 1 : 0,
    temAntecedencia: !error && temAntecedencia,
    avisoEquipeEmails: listaDeEmails(texto(data?.aviso_equipe_emails)),
    assunto: texto(data?.assunto) ?? PADRAO_ANIVERSARIO.assunto,
    mensagem: texto(data?.mensagem) ?? PADRAO_ANIVERSARIO.mensagem,
    textoWhatsapp: texto(data?.texto_whatsapp) ?? PADRAO_ANIVERSARIO.textoWhatsapp,
    atualizadoPorNome: data?.atualizado_por ? (nomes.get(String(data.atualizado_por)) ?? null) : null,
    atualizadoEm: texto(data?.updated_at),
  }
}

/** "a@x.org, b@x.org; c@x.org" → e-mails válidos, sem repetição. */
export function listaDeEmails(bruto: string | null | undefined): string[] {
  return [...new Set((bruto ?? "").split(/[\s,;]+/).map((e) => e.trim().toLowerCase()).filter((e) => EMAIL_VALIDO.test(e)))]
}

export type TextoParabens = { assunto: string; mensagem: string; textoWhatsapp: string }

function conferirTexto(c: TextoParabens): string | null {
  if (!c.assunto.trim()) return "Escreva o assunto do e-mail."
  if (!c.mensagem.trim()) return "Escreva a mensagem do e-mail."
  if (!c.textoWhatsapp.trim()) return "Escreva o texto do WhatsApp."
  return null
}

/** A mensagem padrão — a de quem não se encaixa em nenhuma específica. */
export async function salvarMensagemPadrao(c: TextoParabens, usuarioId: string): Promise<{ erro?: string }> {
  const falta = conferirTexto(c)
  if (falta) return { erro: falta }
  const admin = await createAdminClient()
  const { error } = await admin.from("comunicacao_aniversario_config").upsert(
    {
      emp_proprietaria_id: await tenantAtual(),
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

/** Envio automático: ligado ou não, a hora de início e o aviso à equipe. */
export async function salvarEnvioAutomatico(
  c: { ativo: boolean; horaEnvio: number; avisoEquipeEmails: string; parabensAntecedencia: Antecedencia; avisoAntecedencia: Antecedencia },
  usuarioId: string
): Promise<{ erro?: string }> {
  if (!Number.isInteger(c.horaEnvio) || c.horaEnvio < 0 || c.horaEnvio > 23) return { erro: "Escolha a hora do envio." }
  const bruto = c.avisoEquipeEmails.trim()
  const emails = listaDeEmails(bruto)
  const invalidos = bruto.split(/[\s,;]+/).filter((e) => e && !EMAIL_VALIDO.test(e.trim()))
  if (invalidos.length) return { erro: `E-mail inválido no aviso à equipe: ${invalidos.join(", ")}` }
  const admin = await createAdminClient()
  const { error } = await admin.from("comunicacao_aniversario_config").upsert(
    {
      emp_proprietaria_id: await tenantAtual(),
      ativo: c.ativo,
      hora_envio: c.horaEnvio,
      aviso_equipe_emails: emails.length ? emails.join(", ") : null,
      parabens_antecedencia: c.parabensAntecedencia,
      aviso_antecedencia: c.avisoAntecedencia,
      atualizado_por: usuarioId,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "emp_proprietaria_id" }
  )
  if (error) return { erro: esquemaAusente(error) ? AVISO_SQL_VESPERA : `Não foi possível salvar: ${error.message}` }
  return {}
}

// ── Mensagens específicas de aniversário ───────────────────────────────────

function mapearModelo(d: Record<string, unknown>): ModeloAniversario {
  return {
    id: String(d.id),
    nome: texto(d.nome) ?? "Sem nome",
    ativo: d.ativo !== false,
    ordem: Number(d.ordem) || 0,
    criterios: normalizarCriterios(d.criterios as Record<string, unknown> | null),
    assunto: texto(d.assunto) ?? "",
    mensagem: texto(d.mensagem) ?? "",
    textoWhatsapp: texto(d.texto_whatsapp) ?? "",
  }
}

const CAMPOS_MODELO = "id, nome, ativo, ordem, criterios, assunto, mensagem, texto_whatsapp"

/** As mensagens específicas, na ordem em que são testadas. [] sem o SQL. */
export async function listarModelos(opcoes: { tenantId?: string; db?: Db } = {}): Promise<ModeloAniversario[]> {
  const db = opcoes.db ?? (await createAdminClient())
  const { data, error } = await db
    .from("comunicacao_aniversario_modelos")
    .select(CAMPOS_MODELO)
    .eq("emp_proprietaria_id", opcoes.tenantId ?? (await tenantAtual()))
    .order("ordem")
    .order("created_at")
  if (error) {
    if (esquemaAusente(error)) return []
    throw new Error(`Falha ao ler as mensagens específicas: ${error.message}`)
  }
  return (data ?? []).map(mapearModelo)
}

export async function obterModelo(id: string): Promise<ModeloAniversario | null> {
  const db = await createAdminClient()
  const { data, error } = await db
    .from("comunicacao_aniversario_modelos")
    .select(CAMPOS_MODELO)
    .eq("id", id)
    .eq("emp_proprietaria_id", await tenantAtual())
    .maybeSingle()
  if (error) return null
  return data ? mapearModelo(data) : null
}

export async function salvarModelo(
  id: string | null,
  d: TextoParabens & { nome: string; ativo: boolean; criterios: CriteriosAniversario },
  usuarioId: string
): Promise<{ id?: string; erro?: string }> {
  if (!d.nome.trim()) return { erro: "Dê um nome à mensagem (ex.: Aposentados, 60 anos)." }
  if (semCriterios(d.criterios)) return { erro: "Escolha pelo menos um critério — sem critério, vale a mensagem padrão." }
  const falta = conferirTexto(d)
  if (falta) return { erro: falta }
  if (d.criterios.idadeDe !== undefined && d.criterios.idadeAte !== undefined && d.criterios.idadeDe > d.criterios.idadeAte) {
    return { erro: "Na idade, o \"de\" não pode ser maior que o \"até\"." }
  }
  if (d.criterios.filiadoHaDe !== undefined && d.criterios.filiadoHaAte !== undefined && d.criterios.filiadoHaDe > d.criterios.filiadoHaAte) {
    return { erro: "No tempo de filiação, o \"de\" não pode ser maior que o \"até\"." }
  }
  const db = await createAdminClient()
  const emp = await tenantAtual()
  const campos = {
    nome: d.nome.trim(),
    ativo: d.ativo,
    criterios: d.criterios,
    assunto: d.assunto.trim(),
    mensagem: d.mensagem.trim(),
    texto_whatsapp: d.textoWhatsapp.trim(),
    atualizado_por: usuarioId,
    updated_at: new Date().toISOString(),
  }
  if (id) {
    const { error } = await db.from("comunicacao_aniversario_modelos").update(campos).eq("id", id).eq("emp_proprietaria_id", emp)
    return error ? { erro: `Não foi possível salvar: ${error.message}` } : { id }
  }
  // Nova entra no fim da lista.
  const { data: ultima } = await db
    .from("comunicacao_aniversario_modelos")
    .select("ordem")
    .eq("emp_proprietaria_id", emp)
    .order("ordem", { ascending: false })
    .limit(1)
    .maybeSingle()
  const { data, error } = await db
    .from("comunicacao_aniversario_modelos")
    .insert({ ...campos, emp_proprietaria_id: emp, ordem: (Number(ultima?.ordem) || 0) + 1 })
    .select("id")
    .single()
  if (error || !data) return { erro: esquemaAusente(error) ? AVISO_SQL_MODELOS : `Não foi possível criar: ${error?.message ?? "?"}` }
  return { id: String(data.id) }
}

export async function excluirModelo(id: string): Promise<{ erro?: string }> {
  const db = await createAdminClient()
  const { error } = await db.from("comunicacao_aniversario_modelos").delete().eq("id", id).eq("emp_proprietaria_id", await tenantAtual())
  return error ? { erro: error.message } : {}
}

/** Sobe ou desce uma mensagem na lista (a primeira que a pessoa atender vale). */
export async function moverModelo(id: string, direcao: "subir" | "descer"): Promise<{ erro?: string }> {
  const modelos = await listarModelos()
  const i = modelos.findIndex((m) => m.id === id)
  const j = direcao === "subir" ? i - 1 : i + 1
  if (i < 0 || j < 0 || j >= modelos.length) return {}
  const ordem = [...modelos]
  ;[ordem[i], ordem[j]] = [ordem[j], ordem[i]]
  const db = await createAdminClient()
  const emp = await tenantAtual()
  for (const [k, m] of ordem.entries()) {
    if (m.ordem !== k + 1) await db.from("comunicacao_aniversario_modelos").update({ ordem: k + 1 }).eq("id", m.id).eq("emp_proprietaria_id", emp)
  }
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

/** O texto que a pessoa recebe: o da mensagem específica que ela atende, ou o padrão. */
export function textoParaPessoa(
  cfg: TextoParabens,
  modelos: ModeloAniversario[],
  perfil: PerfilAniversario
): TextoParabens & { modeloNome: string | null } {
  const m = escolherModelo(modelos, perfil)
  return m
    ? { assunto: m.assunto, mensagem: m.mensagem, textoWhatsapp: m.textoWhatsapp, modeloNome: m.nome }
    : { assunto: cfg.assunto, mensagem: cfg.mensagem, textoWhatsapp: cfg.textoWhatsapp, modeloNome: null }
}

/**
 * Cria (ou completa) o parabéns do dia: a mensagem e um destinatário por
 * aniversariante, cada um com o texto que lhe cabe (específica ou padrão).
 * Idempotente — rodar de novo acrescenta quem faltava e, para quem ainda está
 * na fila, atualiza o texto se a mensagem foi editada depois.
 */
export async function prepararAniversario(dataISO: string, opcoes: { tenantId?: string; db?: Db } = {}): Promise<{ mensagemId?: string; erro?: string }> {
  const db = opcoes.db ?? (await createAdminClient())
  const emp = opcoes.tenantId ?? (await tenantAtual())
  const cfg = await obterConfigAniversario({ tenantId: emp, db })
  if (!cfg.disponivel) return { erro: AVISO_SQL_MENSAGENS }

  const { data: existente, error: erroBusca } = await db
    .from("comunicacao_mensagens")
    .select("id, situacao")
    .eq("emp_proprietaria_id", emp)
    .eq("tipo", "aniversario")
    .eq("referencia", dataISO)
    .maybeSingle()
  if (erroBusca) return { erro: esquemaAusente(erroBusca) ? AVISO_SQL_MENSAGENS : erroBusca.message }
  let mensagemId = texto(existente?.id)
  const pessoas = await aniversariantesDoDia(dataISO, { tenantId: emp, db })
  // Dia sem aniversariante não vira mensagem.
  if (!mensagemId && pessoas.length === 0) return {}
  const modelos = cfg.completo ? await listarModelos({ tenantId: emp, db }) : []

  if (mensagemId) {
    await db
      .from("comunicacao_mensagens")
      .update({ assunto: cfg.assunto, corpo: cfg.mensagem, texto_whatsapp: cfg.textoWhatsapp })
      .eq("id", mensagemId)
  } else {
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
    const linhas = pessoas.map((p) => {
      const t = textoParaPessoa(cfg, modelos, p.perfil)
      return {
        p,
        t,
        linha: {
          emp_proprietaria_id: emp,
          mensagem_id: mensagemId,
          filiacao_id: p.filiacaoId,
          cpf: p.cpf,
          nome: p.nome,
          email: p.email,
          telefone: p.telefone,
          email_situacao: p.email ? "pendente" : "sem_email",
          ...(cfg.completo ? { assunto: t.assunto, corpo: t.mensagem, texto_whatsapp: t.textoWhatsapp, modelo_nome: t.modeloNome } : {}),
        },
      }
    })
    const { data: novos, error } = await db
      .from("comunicacao_envios")
      .upsert(
        linhas.map((l) => l.linha),
        { onConflict: "mensagem_id,cpf", ignoreDuplicates: true }
      )
      .select("id, email_situacao")
    if (error) return { erro: `Não foi possível registrar os aniversariantes: ${error.message}` }

    // Quem ainda está na fila recebe o texto atual (a mensagem pode ter sido editada).
    if (cfg.completo) {
      const { data: fila } = await db
        .from("comunicacao_envios")
        .select("id, cpf, assunto, corpo, texto_whatsapp, modelo_nome")
        .eq("mensagem_id", mensagemId)
        .in("email_situacao", ["pendente", "sem_email"])
      const porCpf = new Map(linhas.map((l) => [l.p.cpf, l.t]))
      for (const e of fila ?? []) {
        const t = porCpf.get(String(e.cpf))
        if (!t) continue
        if (e.assunto === t.assunto && e.corpo === t.mensagem && e.texto_whatsapp === t.textoWhatsapp && e.modelo_nome === t.modeloNome) continue
        await db
          .from("comunicacao_envios")
          .update({ assunto: t.assunto, corpo: t.mensagem, texto_whatsapp: t.textoWhatsapp, modelo_nome: t.modeloNome })
          .eq("id", e.id)
      }
    }

    // Entrou gente nova com e-mail depois de o dia terminar: volta a enviar.
    if (existente?.situacao === "enviada" && (novos ?? []).some((n) => n.email_situacao === "pendente")) {
      await db.from("comunicacao_mensagens").update({ situacao: "enviando" }).eq("id", mensagemId)
    }
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
  /** A mensagem específica que a pessoa recebeu (aniversário); null = a padrão. */
  modeloNome: string | null
  /** O texto do WhatsApp desta pessoa; null = o da mensagem. */
  textoWhatsapp: string | null
}

export type MensagemResumo = {
  id: string
  tipo: "aniversario" | "mala_direta"
  referencia: string | null
  titulo: string | null
  assunto: string | null
  corpo: string | null
  textoWhatsapp: string | null
  situacao: SituacaoMensagem
  enviadaEm: string | null
  filtros: FiltrosMalaDireta
  recorte: string | null
  agendadaPara: string | null
  agendadaHora: number
  criadoPorNome: string | null
  atualizadoEm: string | null
}

export async function mensagemDoAniversario(dataISO: string): Promise<{ mensagem: MensagemResumo | null; envios: Envio[] }> {
  const admin = await createAdminClient()
  const emp = await tenantAtual()
  const { data, error } = await admin
    .from("comunicacao_mensagens")
    .select(CAMPOS_MENSAGEM)
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

const CAMPOS_MENSAGEM =
  "id, tipo, referencia, titulo, assunto, corpo, texto_whatsapp, situacao, enviada_em, filtros, recorte, agendada_para, agendada_hora, criado_por, updated_at"

function mapearMensagem(d: Record<string, unknown>, nomes?: Map<string, string>): MensagemResumo {
  return {
    id: String(d.id),
    tipo: d.tipo === "aniversario" ? "aniversario" : "mala_direta",
    referencia: texto(d.referencia),
    titulo: texto(d.titulo),
    assunto: texto(d.assunto),
    corpo: texto(d.corpo),
    textoWhatsapp: texto(d.texto_whatsapp),
    situacao: (texto(d.situacao) ?? "rascunho") as SituacaoMensagem,
    enviadaEm: texto(d.enviada_em),
    filtros: normalizarFiltros(d.filtros as Record<string, unknown> | null),
    recorte: texto(d.recorte),
    agendadaPara: texto(d.agendada_para),
    agendadaHora: Number.isInteger(Number(d.agendada_hora)) && d.agendada_hora !== null ? Number(d.agendada_hora) : HORA_ENVIO_PADRAO,
    criadoPorNome: d.criado_por ? (nomes?.get(String(d.criado_por)) ?? null) : null,
    atualizadoEm: texto(d.updated_at),
  }
}

export async function enviosDaMensagem(mensagemId: string): Promise<Envio[]> {
  const admin = await createAdminClient()
  const emp = await tenantAtual()
  const linhas: Record<string, unknown>[] = []
  for (let de = 0; ; de += 1000) {
    const { data, error } = await admin
      .from("comunicacao_envios")
      .select("id, filiacao_id, cpf, nome, email, telefone, email_situacao, email_em, email_erro, whatsapp_em, whatsapp_por, modelo_nome, texto_whatsapp")
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
    modeloNome: texto(l.modelo_nome),
    textoWhatsapp: texto(l.texto_whatsapp),
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

/** Endereços do descadastro: a página (link do rodapé) e o one-click (cabeçalho). */
function linksDescadastro(emp: string, cpf: string, origem: string): { pagina: string; umClique: string } {
  const token = tokenDescadastro(emp, cpf)
  return { pagina: `${origem}/comunicados/sair/${token}`, umClique: `${origem}/api/comunicados/sair?t=${token}` }
}

/** Rodapé da mala direta: por que a pessoa recebe e como deixar de receber. */
export function rodapeDescadastro(entidade: string, href: string): string {
  return textoSuave(
    `Você recebe este e-mail por ser filiado(a) à ${escaparHtml(entidade)}. Não quer mais receber estes comunicados? <a href="${escaparHtml(href)}" style="color:inherit;">Descadastre-se</a>.`
  )
}

/**
 * HTML do e-mail de um destinatário (o miolo; a moldura vem do enviarEmail).
 * O parabéns é texto simples; a mala direta vem do editor formatado.
 */
export function htmlDoEnvio(msg: Pick<MensagemResumo, "tipo" | "corpo">, nome: string, entidade: string, descadastro?: string): string {
  if (msg.tipo === "aniversario") return textoParaHtml(aplicarVariaveis(msg.corpo ?? "", { nome, entidade }))
  return corpoParaEmailHtml(msg.corpo, { nome, entidade }) + (descadastro ? "\n" + rodapeDescadastro(entidade, descadastro) : "")
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
    .select(CAMPOS_MENSAGEM)
    .eq("id", mensagemId)
    .eq("emp_proprietaria_id", emp)
    .maybeSingle()
  if (erroMsg || !m) return { enviados: 0, falhas: 0, restantes: 0, erro: erroMsg?.message ?? "Mensagem não encontrada." }
  const msg = mapearMensagem(m)
  if (msg.situacao === "cancelada") return { enviados: 0, falhas: 0, restantes: 0, erro: "A mensagem foi cancelada." }

  // Reserva esquecida (um envio que caiu no meio) volta para a fila depois de 10 min.
  await db
    .from("comunicacao_envios")
    .update({ email_situacao: "pendente" })
    .eq("mensagem_id", mensagemId)
    .eq("email_situacao", "processando")
    .lt("email_em", new Date(Date.now() - 10 * 60_000).toISOString())

  const { data: candidatos, error } = await db
    .from("comunicacao_envios")
    .select("id")
    .eq("mensagem_id", mensagemId)
    .eq("email_situacao", "pendente")
    .order("id")
    .limit(opcoes.limite ?? LOTE_PADRAO)
  if (error) return { enviados: 0, falhas: 0, restantes: 0, erro: error.message }

  // Reserva: só fica com o e-mail quem conseguiu passá-lo de "pendente" para
  // "processando". A tela e o agendador podem rodar juntos sem repetir envio.
  const { data: pendentes, error: erroReserva } = candidatos?.length
    ? await db
        .from("comunicacao_envios")
        .update({ email_situacao: "processando", email_em: new Date().toISOString() })
        .in("id", candidatos.map((c) => c.id))
        .eq("email_situacao", "pendente")
        .select("id, cpf, nome, email, assunto, corpo")
    : { data: [], error: null }
  if (erroReserva) return { enviados: 0, falhas: 0, restantes: 0, erro: erroReserva.message }
  const meus = new Set((pendentes ?? []).map((p) => String(p.id)))

  // O mesmo e-mail em duas pessoas (casal, e-mail da família) recebe uma vez.
  const { data: jaEnviados } = await db
    .from("comunicacao_envios")
    .select("id, email")
    .eq("mensagem_id", mensagemId)
    .in("email_situacao", ["enviado", "processando"])
  const vistos = new Set(
    (jaEnviados ?? []).filter((e) => !meus.has(String(e.id))).map((e) => String(e.email ?? "").toLowerCase())
  )

  // Mala direta: quem se descadastrou depois de a lista ser fechada sai agora.
  const malaDireta = msg.tipo === "mala_direta"
  const optout = malaDireta ? await descadastradosDoTenant(emp, db) : new Set<string>()

  const enviados: string[] = []
  const duplicados: string[] = []
  const descadastrados: string[] = []
  const falhas: { id: string; erro: string }[] = []
  const fila: { id: string; cpf: string; nome: string; email: string; assunto: string | null; corpo: string | null }[] = []
  for (const p of pendentes ?? []) {
    const email = String(p.email ?? "").toLowerCase()
    if (optout.has(String(p.cpf ?? ""))) descadastrados.push(String(p.id))
    else if (vistos.has(email)) duplicados.push(String(p.id))
    else {
      vistos.add(email)
      fila.push({ id: String(p.id), cpf: String(p.cpf ?? ""), nome: texto(p.nome) ?? "", email, assunto: texto(p.assunto), corpo: texto(p.corpo) })
    }
  }

  for (let i = 0; i < fila.length; i += PARALELO) {
    const bloco = fila.slice(i, i + PARALELO)
    const oks = await Promise.all(
      bloco.map((d) => {
        const links = malaDireta ? linksDescadastro(emp, d.cpf, contexto.origem) : null
        return enviarEmail({
          email: d.email,
          nome: d.nome,
          // No aniversário, cada pessoa pode ter a sua mensagem específica.
          assunto: aplicarVariaveis(d.assunto ?? msg.assunto ?? "", { nome: d.nome, entidade: contexto.entidade }),
          html: htmlDoEnvio({ tipo: msg.tipo, corpo: d.corpo ?? msg.corpo }, d.nome, contexto.entidade, links?.pagina),
          contexto,
          cabecalhos: links
            ? { "List-Unsubscribe": `<${links.umClique}>`, "List-Unsubscribe-Post": "List-Unsubscribe=One-Click" }
            : undefined,
        }).catch(() => false)
      })
    )
    bloco.forEach((d, j) => (oks[j] ? enviados.push(d.id) : falhas.push({ id: d.id, erro: "O provedor de e-mail recusou ou não respondeu." })))
  }

  const agora = new Date().toISOString()
  if (enviados.length) await db.from("comunicacao_envios").update({ email_situacao: "enviado", email_em: agora, email_erro: null }).in("id", enviados)
  if (duplicados.length) await db.from("comunicacao_envios").update({ email_situacao: "duplicado", email_em: agora }).in("id", duplicados)
  if (descadastrados.length) await db.from("comunicacao_envios").update({ email_situacao: "descadastrado" }).in("id", descadastrados)
  if (falhas.length) await db.from("comunicacao_envios").update({ email_situacao: "falha", email_em: agora, email_erro: falhas[0].erro }).in("id", falhas.map((f) => f.id))

  // Conta também o que outro processo reservou: a mensagem só termina quando tudo saiu.
  const { count } = await db
    .from("comunicacao_envios")
    .select("id", { count: "exact", head: true })
    .eq("mensagem_id", mensagemId)
    .in("email_situacao", ["pendente", "processando"])
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

// ── Mala direta ────────────────────────────────────────────────────────────

/** Entre dois cadastros do mesmo CPF, qual representa a pessoa. */
function melhorLinha(a: LinhaRelatorio, b: LinhaRelatorio): LinhaRelatorio {
  if ((a.condicao === "Ativo") !== (b.condicao === "Ativo")) return a.condicao === "Ativo" ? a : b
  if (a.vinculoAberto !== b.vinculoAberto) return a.vinculoAberto ? a : b
  return a
}

/** As pessoas do recorte (uma por CPF), na base dos relatórios de filiados. */
async function pessoasDoRecorte(filtros: FiltrosMalaDireta): Promise<{ base: BaseRelatorios; linhas: LinhaRelatorio[] }> {
  const base = await baseRelatorios()
  const condicoes = new Set(filtros.condicoes)
  const filtradas = filtrarRelatorio(base, {
    situacao: "ativas",
    condicao: "todas",
    fonte: filtros.fonte,
    condicaoFonte: filtros.condicaoFonte,
    uf: filtros.uf,
    cidade: filtros.cidade,
    lotacao: filtros.lotacao,
    formaRecebimento: filtros.formaRecebimento,
    inadimplente: filtros.inadimplente,
    idadeMin: filtros.idadeMin,
    idadeMax: filtros.idadeMax,
  }).filter((l) => (l.condicao ? condicoes.has(l.condicao) : condicoes.has(CONDICAO_SEM_INFORMACAO)))
  const porCpf = new Map<string, LinhaRelatorio>()
  for (const l of filtradas) {
    const chave = cpfConfiavel(l.cpf) ?? `id:${l.id}`
    const atual = porCpf.get(chave)
    porCpf.set(chave, atual ? melhorLinha(atual, l) : l)
  }
  return { base, linhas: [...porCpf.values()] }
}

/** Texto legível do recorte, para o histórico da mensagem. */
export function descreverFiltros(filtros: FiltrosMalaDireta, fontes: { id: string; nome: string }[]): string {
  const rotuloCondicao = (c: string) => (c === CONDICAO_SEM_INFORMACAO ? "Sem condição informada" : c)
  const partes = [`Condição: ${filtros.condicoes.map(rotuloCondicao).join(", ")}`]
  if (filtros.fonte) partes.push(`Fonte: ${fontes.find((f) => f.id === filtros.fonte)?.nome ?? filtros.fonte}`)
  if (filtros.condicaoFonte) partes.push(filtros.condicaoFonte)
  if (filtros.formaRecebimento) {
    partes.push(
      filtros.formaRecebimento === "nao_informado"
        ? "Forma de recebimento não informada"
        : ROTULOS_FORMA_RECEBIMENTO[filtros.formaRecebimento as FormaRecebimento]
    )
  }
  if (filtros.inadimplente) partes.push(filtros.inadimplente === "sim" ? "Só inadimplentes" : "Sem inadimplentes")
  if (filtros.uf) partes.push(`UF: ${filtros.uf}`)
  if (filtros.cidade) partes.push(`Cidade contém "${filtros.cidade}"`)
  if (filtros.lotacao) partes.push(`Lotação contém "${filtros.lotacao}"`)
  if (filtros.idadeMin || filtros.idadeMax) {
    partes.push(
      filtros.idadeMin && filtros.idadeMax
        ? `De ${filtros.idadeMin} a ${filtros.idadeMax} anos`
        : filtros.idadeMin
          ? `${filtros.idadeMin} anos ou mais`
          : `Até ${filtros.idadeMax} anos`
    )
  }
  return partes.join(" · ")
}

export type DestinatarioRecorte = Destinatario & { descadastrado: boolean }

/** Quem recebe a mala direta, com e-mail, WhatsApp e a marca de descadastro. */
export async function destinatariosDoRecorte(
  filtros: FiltrosMalaDireta
): Promise<{ recorte: string; pessoas: DestinatarioRecorte[] }> {
  const db = await createAdminClient()
  const emp = await tenantAtual()
  const { base, linhas } = await pessoasDoRecorte(filtros)
  const ids = linhas.map((l) => l.id)
  const fichas: LinhaFiliacao[] = []
  for (let i = 0; i < ids.length; i += 800) {
    const grupo = ids.slice(i, i + 800)
    const partes = await Promise.all(
      [0, 200, 400, 600]
        .map((d) => grupo.slice(d, d + 200))
        .filter((fatia) => fatia.length)
        .map(async (fatia) => {
          const { data, error } = await db.from("filiacoes").select(CAMPOS_CONTATO).eq("emp_proprietaria_id", emp).in("id", fatia)
          if (error) throw new Error(`Falha ao ler os contatos: ${error.message}`)
          return data ?? []
        })
    )
    fichas.push(...partes.flat())
  }
  const [mapa, optout] = await Promise.all([contatos(db, emp, fichas), descadastradosDoTenant(emp, db)])
  const pessoas = linhas
    .map((l) => {
      const cpf = cpfConfiavel(l.cpf) ?? `id:${l.id}`
      return {
        filiacaoId: l.id,
        cpf,
        nome: l.nome ?? "(sem nome)",
        email: mapa.get(l.id)?.email ?? null,
        telefone: mapa.get(l.id)?.telefone ?? null,
        descadastrado: optout.has(cpf) || optout.has(`id:${l.id}`),
      }
    })
    .sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"))
  return { recorte: descreverFiltros(filtros, base.fontes), pessoas }
}

export type ResumoRecorte = {
  recorte: string
  pessoas: number
  comEmail: number
  semEmail: number
  descadastrados: number
  comWhatsapp: number
  /** E-mails iguais em mais de uma pessoa: saem uma vez só. */
  emailsRepetidos: number
  amostra: string[]
}

export async function resumoDoRecorte(filtros: FiltrosMalaDireta): Promise<ResumoRecorte> {
  const { recorte, pessoas } = await destinatariosDoRecorte(filtros)
  const recebem = pessoas.filter((p) => !p.descadastrado && p.email)
  return {
    recorte,
    pessoas: pessoas.length,
    comEmail: recebem.length,
    semEmail: pessoas.filter((p) => !p.descadastrado && !p.email).length,
    descadastrados: pessoas.filter((p) => p.descadastrado).length,
    comWhatsapp: pessoas.filter((p) => p.telefone).length,
    emailsRepetidos: recebem.length - new Set(recebem.map((p) => p.email)).size,
    amostra: pessoas.slice(0, 12).map((p) => p.nome),
  }
}

export type MalaDiretaNaLista = MensagemResumo & { total: number; enviados: number; pendentes: number; falhas: number }

async function contagem(db: Db, mensagemId: string, situacao?: SituacaoEmail): Promise<number> {
  let q = db.from("comunicacao_envios").select("id", { count: "exact", head: true }).eq("mensagem_id", mensagemId)
  if (situacao) q = q.eq("email_situacao", situacao)
  const { count } = await q
  return count ?? 0
}

export async function listarMalasDiretas(): Promise<{ disponivel: boolean; mensagens: MalaDiretaNaLista[] }> {
  const db = await createAdminClient()
  const { data, error } = await db
    .from("comunicacao_mensagens")
    .select(CAMPOS_MENSAGEM)
    .eq("emp_proprietaria_id", await tenantAtual())
    .eq("tipo", "mala_direta")
    .order("created_at", { ascending: false })
    .limit(100)
  if (error) {
    if (esquemaAusente(error)) return { disponivel: false, mensagens: [] }
    throw new Error(`Falha ao ler as mensagens: ${error.message}`)
  }
  const nomes = await nomesDosUsuarios((data ?? []).map((d) => texto(d.criado_por)).filter((v): v is string => !!v))
  const mensagens = await Promise.all(
    (data ?? []).map(async (d) => {
      const m = mapearMensagem(d, nomes)
      if (m.situacao === "rascunho") return { ...m, total: 0, enviados: 0, pendentes: 0, falhas: 0 }
      const [total, enviados, pendentes, falhas] = await Promise.all([
        contagem(db, m.id),
        contagem(db, m.id, "enviado"),
        contagem(db, m.id, "pendente"),
        contagem(db, m.id, "falha"),
      ])
      return { ...m, total, enviados, pendentes, falhas }
    })
  )
  return { disponivel: true, mensagens }
}

export async function obterMalaDireta(id: string): Promise<MensagemResumo | null> {
  const db = await createAdminClient()
  const { data, error } = await db
    .from("comunicacao_mensagens")
    .select(CAMPOS_MENSAGEM)
    .eq("id", id)
    .eq("emp_proprietaria_id", await tenantAtual())
    .eq("tipo", "mala_direta")
    .maybeSingle()
  if (error) {
    if (esquemaAusente(error) || error.code === "22P02") return null
    throw new Error(`Falha ao ler a mensagem: ${error.message}`)
  }
  if (!data) return null
  const nomes = data.criado_por ? await nomesDosUsuarios([String(data.criado_por)]) : undefined
  return mapearMensagem(data, nomes)
}

export async function criarMalaDireta(usuarioId: string): Promise<{ id?: string; erro?: string }> {
  const db = await createAdminClient()
  const { data, error } = await db
    .from("comunicacao_mensagens")
    .insert({
      emp_proprietaria_id: await tenantAtual(),
      tipo: "mala_direta",
      titulo: "Nova mensagem",
      filtros: { condicoes: ["Ativo"] },
      situacao: "rascunho",
      criado_por: usuarioId,
      atualizado_por: usuarioId,
      updated_at: new Date().toISOString(),
    })
    .select("id")
    .single()
  if (error || !data) return { erro: esquemaAusente(error) ? AVISO_SQL_MENSAGENS : `Não foi possível criar: ${error?.message ?? "?"}` }
  return { id: String(data.id) }
}

export type DadosMalaDireta = {
  titulo: string
  assunto: string
  corpo: string
  textoWhatsapp: string
  filtros: FiltrosMalaDireta
}

/** Grava o rascunho. Só rascunho se edita — agendada volta a rascunho antes. */
export async function salvarMalaDireta(id: string, d: DadosMalaDireta, usuarioId: string): Promise<{ erro?: string }> {
  const atual = await obterMalaDireta(id)
  if (!atual) return { erro: "Mensagem não encontrada." }
  if (atual.situacao !== "rascunho") return { erro: "Só dá para editar um rascunho. Desfaça o agendamento antes." }
  const db = await createAdminClient()
  const { error } = await db
    .from("comunicacao_mensagens")
    .update({
      titulo: d.titulo.trim() || "Sem título",
      assunto: d.assunto.trim(),
      corpo: d.corpo,
      texto_whatsapp: d.textoWhatsapp.trim(),
      filtros: d.filtros,
      atualizado_por: usuarioId,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id)
    .eq("emp_proprietaria_id", await tenantAtual())
  return error ? { erro: `Não foi possível salvar: ${error.message}` } : {}
}

/** O que falta para a mensagem poder sair. */
export function faltasParaEnviar(m: Pick<MensagemResumo, "assunto" | "corpo">): string | null {
  if (!m.assunto?.trim()) return "Escreva o assunto do e-mail."
  if (!corpoParaEmailHtml(m.corpo, { nome: "x", entidade: "x" }).trim()) return "Escreva o texto do e-mail."
  return null
}

/**
 * Fecha a lista de destinatários da mensagem (um por CPF), com a situação de
 * cada um: na fila, sem e-mail ou descadastrado. Refaz do zero — só antes de
 * qualquer envio.
 */
async function fecharDestinatarios(m: MensagemResumo): Promise<{ erro?: string; recorte?: string }> {
  const db = await createAdminClient()
  const emp = await tenantAtual()
  const { recorte, pessoas } = await destinatariosDoRecorte(m.filtros)
  if (!pessoas.length) return { erro: "Ninguém está no recorte escolhido." }
  const { error: erroLimpa } = await db.from("comunicacao_envios").delete().eq("mensagem_id", m.id)
  if (erroLimpa) return { erro: `Não foi possível preparar os destinatários: ${erroLimpa.message}` }
  for (let i = 0; i < pessoas.length; i += 500) {
    const { error } = await db.from("comunicacao_envios").insert(
      pessoas.slice(i, i + 500).map((p) => ({
        emp_proprietaria_id: emp,
        mensagem_id: m.id,
        filiacao_id: p.filiacaoId,
        cpf: p.cpf,
        nome: p.nome,
        email: p.email,
        telefone: p.telefone,
        email_situacao: p.descadastrado ? "descadastrado" : p.email ? "pendente" : "sem_email",
      }))
    )
    if (error) return { erro: `Não foi possível registrar os destinatários: ${error.message}` }
  }
  return { recorte }
}

/** Agenda (data e hora) ou começa a enviar agora (sem data). */
export async function liberarMalaDireta(
  id: string,
  usuarioId: string,
  agendarPara: string | null,
  hora: number = HORA_ENVIO_PADRAO
): Promise<{ erro?: string }> {
  const m = await obterMalaDireta(id)
  if (!m) return { erro: "Mensagem não encontrada." }
  if (m.situacao !== "rascunho") return { erro: "Esta mensagem já foi liberada." }
  const falta = faltasParaEnviar(m)
  if (falta) return { erro: falta }
  if (agendarPara) {
    if (!Number.isInteger(hora) || hora < 0 || hora > 23) return { erro: "Escolha a hora do envio." }
    const hoje = hojeSP()
    if (agendarPara < hoje || (agendarPara === hoje && hora <= horaAgoraSP())) {
      return { erro: "Escolha um dia e hora que ainda não passaram. Para agora, use Enviar agora." }
    }
  }
  const fechado = await fecharDestinatarios(m)
  if (fechado.erro) return { erro: fechado.erro }
  const db = await createAdminClient()
  // Sem e-mail na fila (todos sem e-mail ou descadastrados), não há o que enviar:
  // a mensagem já nasce enviada e a lista serve ao WhatsApp.
  const nadaNaFila = !agendarPara && (await contagem(db, m.id, "pendente")) === 0
  const agora = new Date().toISOString()
  const { error } = await db
    .from("comunicacao_mensagens")
    .update({
      ...(nadaNaFila ? { enviada_em: agora } : {}),
      situacao: agendarPara ? "agendada" : nadaNaFila ? "enviada" : "enviando",
      agendada_para: agendarPara,
      agendada_hora: agendarPara ? hora : HORA_ENVIO_PADRAO,
      recorte: fechado.recorte,
      atualizado_por: usuarioId,
      updated_at: agora,
    })
    .eq("id", id)
    .eq("emp_proprietaria_id", await tenantAtual())
  return error ? { erro: error.message } : {}
}

/** Agendada volta a rascunho: a lista de destinatários é refeita quando liberar de novo. */
export async function desfazerAgendamento(id: string, usuarioId: string): Promise<{ erro?: string }> {
  const m = await obterMalaDireta(id)
  if (!m || m.situacao !== "agendada") return { erro: "A mensagem não está agendada." }
  const db = await createAdminClient()
  await db.from("comunicacao_envios").delete().eq("mensagem_id", id)
  const { error } = await db
    .from("comunicacao_mensagens")
    .update({ situacao: "rascunho", agendada_para: null, atualizado_por: usuarioId, updated_at: new Date().toISOString() })
    .eq("id", id)
    .eq("emp_proprietaria_id", await tenantAtual())
  return error ? { erro: error.message } : {}
}

/** Interrompe um envio em andamento: os que faltavam não recebem. */
export async function interromperEnvio(id: string, usuarioId: string): Promise<{ erro?: string }> {
  const m = await obterMalaDireta(id)
  if (!m || m.situacao !== "enviando") return { erro: "A mensagem não está sendo enviada." }
  const db = await createAdminClient()
  const { error } = await db
    .from("comunicacao_mensagens")
    .update({ situacao: "cancelada", atualizado_por: usuarioId, updated_at: new Date().toISOString() })
    .eq("id", id)
    .eq("emp_proprietaria_id", await tenantAtual())
  return error ? { erro: error.message } : {}
}

export async function excluirRascunho(id: string): Promise<{ erro?: string }> {
  const m = await obterMalaDireta(id)
  if (!m || m.situacao !== "rascunho") return { erro: "Só um rascunho pode ser excluído." }
  const db = await createAdminClient()
  const { error } = await db.from("comunicacao_mensagens").delete().eq("id", id).eq("emp_proprietaria_id", await tenantAtual())
  return error ? { erro: error.message } : {}
}

// ── Agendador ──────────────────────────────────────────────────────────────

/** Hora cheia agora em Brasília (0–23). */
export function horaAgoraSP(): number {
  return Number(new Intl.DateTimeFormat("en-US", { timeZone: "America/Sao_Paulo", hour: "numeric", hourCycle: "h23" }).format(new Date()))
}

type ResultadoMala = { tenant: string; mensagem: string; enviados: number; falhas: number; restantes: number; erro?: string }

/**
 * As malas diretas agendadas cuja hora chegou passam a "enviando" e, junto com
 * as que ficaram pela metade, mandam e-mails até o prazo. O agendador roda a
 * cada 15 minutos: o que sobrar continua no próximo disparo, sem depender da
 * tela aberta.
 */
export async function executarMalasDiretas(prazo: number, somente?: string | null): Promise<ResultadoMala[]> {
  const svc = createServiceClient()
  const hoje = hojeSP()
  const hora = horaAgoraSP()
  let qa = svc
    .from("comunicacao_mensagens")
    .select("id, agendada_para, agendada_hora")
    .eq("tipo", "mala_direta")
    .eq("situacao", "agendada")
    .lte("agendada_para", hoje)
  if (somente) qa = qa.eq("emp_proprietaria_id", somente)
  const { data: agendadas, error: erroAgenda } = await qa
  if (erroAgenda) return esquemaAusente(erroAgenda) ? [] : [{ tenant: "-", mensagem: "-", enviados: 0, falhas: 0, restantes: 0, erro: erroAgenda.message }]
  const chegaram = (agendadas ?? [])
    .filter((m) => String(m.agendada_para) < hoje || Number(m.agendada_hora ?? HORA_ENVIO_PADRAO) <= hora)
    .map((m) => String(m.id))
  if (chegaram.length) {
    await svc
      .from("comunicacao_mensagens")
      .update({ situacao: "enviando", updated_at: new Date().toISOString() })
      .in("id", chegaram)
      .eq("situacao", "agendada")
  }

  let qe = svc.from("comunicacao_mensagens").select("id, emp_proprietaria_id").eq("tipo", "mala_direta").eq("situacao", "enviando").order("created_at")
  if (somente) qe = qe.eq("emp_proprietaria_id", somente)
  const { data } = await qe
  const resultados: ResultadoMala[] = []
  const contextos = new Map<string, ContextoEmail>()
  for (const linha of data ?? []) {
    if (Date.now() >= prazo) break
    const tenantId = String(linha.emp_proprietaria_id)
    const mensagemId = String(linha.id)
    let enviados = 0
    let falhas = 0
    let restantes = 0
    try {
      if (!contextos.has(tenantId)) contextos.set(tenantId, await contextoDoTenant(tenantId, svc))
      while (Date.now() < prazo) {
        const r = await enviarLote(mensagemId, { tenantId, db: svc, contexto: contextos.get(tenantId) })
        enviados += r.enviados
        falhas += r.falhas
        restantes = r.restantes
        if (r.erro || r.restantes === 0 || r.enviados + r.falhas === 0) break
      }
      resultados.push({ tenant: tenantId, mensagem: mensagemId, enviados, falhas, restantes })
    } catch (e) {
      resultados.push({ tenant: tenantId, mensagem: mensagemId, enviados, falhas, restantes, erro: e instanceof Error ? e.message : String(e) })
    }
  }
  return resultados
}

/**
 * Aviso à equipe: a lista de um dia de aniversários (hoje ou amanhã) por
 * e-mail, com o link do WhatsApp de cada pessoa (passa pelo Confluir, que
 * registra quem abriu). Sai uma vez por dia de aniversário.
 */
async function enviarAvisoEquipe(
  mensagemId: string,
  dataISO: string,
  emails: string[],
  sobreEmail: string,
  opcoes: { tenantId: string; db: Db; contexto: ContextoEmail }
): Promise<boolean> {
  const { db, contexto } = opcoes
  const { data: envios } = await db
    .from("comunicacao_envios")
    .select("id, nome, telefone, email_situacao, modelo_nome")
    .eq("mensagem_id", mensagemId)
    .order("nome")
  const lista = envios ?? []
  if (!lista.length) return true
  const quando = dataISO === hojeSP() ? "hoje" : "amanhã"
  const linhas = lista
    .map((e) => {
      const situacao = ROTULO_SITUACAO_EMAIL[(e.email_situacao as SituacaoEmail) ?? "pendente"]
      const whats = e.telefone && numeroWhatsapp(String(e.telefone))
        ? `<a href="${contexto.origem}/painel/comunicacao/aniversariantes/whatsapp/${e.id}" style="color:${COR.laranjaAcao};font-weight:600;">Abrir WhatsApp</a>`
        : `<span style="color:${COR.textoSuave};">sem celular</span>`
      const modelo = e.modelo_nome ? ` · ${escaparHtml(String(e.modelo_nome))}` : ""
      return `<tr><td style="padding:8px 0;border-bottom:1px solid ${COR.borda};"><strong>${escaparHtml(String(e.nome ?? ""))}</strong><br><span style="font-size:12px;color:${COR.textoSuave};">E-mail: ${situacao}${modelo}</span></td><td align="right" style="padding:8px 0;border-bottom:1px solid ${COR.borda};font-size:13px;">${whats}</td></tr>`
    })
    .join("")
  const html = [
    tituloEmail(`Aniversariantes de ${quando} — ${dataBR(dataISO).slice(0, 5)}`),
    paragrafo(
      `${lista.length} filiado${lista.length === 1 ? "" : "s"} faz${lista.length === 1 ? "" : "em"} aniversário ${quando}. ${sobreEmail} Para mandar pelo WhatsApp, use os links — o Confluir registra quem abriu.`
    ),
    `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 20px;font-size:14px;">${linhas}</table>`,
    botaoEmail(`${contexto.origem}/painel/comunicacao/aniversariantes?data=${dataISO}`, "Abrir a lista no Confluir"),
  ].join("\n")
  const oks = await Promise.all(
    emails.map((email) =>
      enviarEmail({ email, nome: email, assunto: `Aniversariantes de ${quando} (${lista.length})`, html, contexto }).catch(() => false)
    )
  )
  return oks.some(Boolean)
}

type ResultadoAniversario = {
  tenant: string
  /** O dia de aniversário tratado (hoje ou amanhã, conforme a antecedência). */
  dia: string
  enviados: number
  falhas: number
  aviso?: boolean
  erro?: string
}

/**
 * Um dia de aniversários de um tenant: prepara a mensagem, manda os e-mails
 * (se `enviar`) e o aviso à equipe (se `avisar` e ainda não saiu). Um dia já
 * concluído só custa uma consulta.
 */
async function processarDiaDeAniversario(
  tenantId: string,
  dia: string,
  o: { enviar: boolean; avisar: string[] | null; sobreEmail: string; prazo: number; db: Db }
): Promise<ResultadoAniversario | null> {
  const { db } = o
  const { data: existente } = await db
    .from("comunicacao_mensagens")
    .select("situacao, aviso_equipe_em")
    .eq("emp_proprietaria_id", tenantId)
    .eq("tipo", "aniversario")
    .eq("referencia", dia)
    .maybeSingle()
  const avisoPendente = !!o.avisar?.length && !existente?.aviso_equipe_em
  if (existente && (!o.enviar || existente.situacao === "enviada") && !avisoPendente) return null

  const prep = await prepararAniversario(dia, { tenantId, db })
  // Sem erro = ninguém faz aniversário nesse dia.
  if (!prep.mensagemId) return prep.erro ? { tenant: tenantId, dia, enviados: 0, falhas: 0, erro: prep.erro } : null
  const contexto = await contextoDoTenant(tenantId, db)
  let enviados = 0
  let falhas = 0
  let restantes = 0
  if (o.enviar) {
    while (Date.now() < o.prazo) {
      const r = await enviarLote(prep.mensagemId, { tenantId, db, contexto })
      enviados += r.enviados
      falhas += r.falhas
      restantes = r.restantes
      if (r.erro || r.restantes === 0 || r.enviados + r.falhas === 0) break
    }
  }
  // O aviso sai quando a fila acabou (ou logo, se este disparo não envia e-mails).
  let aviso: boolean | undefined
  if (avisoPendente && (!o.enviar || restantes === 0)) {
    aviso = await enviarAvisoEquipe(prep.mensagemId, dia, o.avisar!, o.sobreEmail, { tenantId, db, contexto })
    if (aviso) await db.from("comunicacao_mensagens").update({ aviso_equipe_em: new Date().toISOString() }).eq("id", prep.mensagemId)
  }
  return { tenant: tenantId, dia, enviados, falhas, aviso }
}

/**
 * O parabéns nos tenants com o envio automático ou o aviso à equipe ligados,
 * a partir da hora configurada. Cada um tem o seu dia: no dia do aniversário
 * (trata os aniversários de hoje) ou na véspera (trata os de amanhã). O
 * agendador roda a cada 15 minutos. `somente` roda um tenant só.
 */
export async function executarAniversarios(prazo: number, somente?: string | null): Promise<ResultadoAniversario[]> {
  const svc = createServiceClient()
  const resultados: ResultadoAniversario[] = []
  const hoje = hojeSP()
  const hora = horaAgoraSP()
  const tenants = somente ? [somente] : await tenantsComParabensAutomatico(svc)
  for (const tenantId of tenants) {
    if (Date.now() >= prazo) break
    try {
      const cfg = await obterConfigAniversario({ tenantId, db: svc })
      if (!cfg.disponivel || (!cfg.ativo && !cfg.avisoEquipeEmails.length) || hora < cfg.horaEnvio) continue
      const diaEmail = somarDias(hoje, cfg.parabensAntecedencia)
      const diaAviso = somarDias(hoje, cfg.avisoAntecedencia)
      // O que o aviso diz sobre o e-mail dos aniversariantes daquele dia.
      const sobreEmail = (dia: string) =>
        !cfg.ativo
          ? "O parabéns automático por e-mail está desligado."
          : dia === diaEmail
            ? "O parabéns por e-mail já saiu para quem tem e-mail."
            : dia < diaEmail
              ? "O parabéns por e-mail saiu ontem, na véspera."
              : `O parabéns por e-mail sai amanhã, às ${rotuloHora(cfg.horaEnvio)}.`
      const avisar = cfg.avisoEquipeEmails.length ? cfg.avisoEquipeEmails : null

      if (cfg.ativo) {
        const r = await processarDiaDeAniversario(tenantId, diaEmail, {
          enviar: true,
          avisar: diaAviso === diaEmail ? avisar : null,
          sobreEmail: sobreEmail(diaEmail),
          prazo,
          db: svc,
        })
        if (r) resultados.push(r)
      }
      if (avisar && (!cfg.ativo || diaAviso !== diaEmail)) {
        const r = await processarDiaDeAniversario(tenantId, diaAviso, {
          enviar: false,
          avisar,
          sobreEmail: sobreEmail(diaAviso),
          prazo,
          db: svc,
        })
        if (r) resultados.push(r)
      }
    } catch (e) {
      resultados.push({ tenant: tenantId, dia: hoje, enviados: 0, falhas: 0, erro: e instanceof Error ? e.message : String(e) })
    }
  }
  return resultados
}

async function tenantsComParabensAutomatico(db: Db): Promise<string[]> {
  const { data, error } = await db
    .from("comunicacao_aniversario_config")
    .select("emp_proprietaria_id")
    .or("ativo.eq.true,aviso_equipe_emails.not.is.null")
  if (error) return []
  return (data ?? []).map((d) => String(d.emp_proprietaria_id))
}
