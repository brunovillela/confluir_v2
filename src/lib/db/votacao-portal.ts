import "server-only"
import { createHash, randomInt, randomUUID } from "node:crypto"

import {
  derivarModalidade,
  hojeEmBrasilia,
  horaCurta,
  horaDoVotoSecreto,
  temVotoOnline,
  type Modalidade,
  type SalaVirtual,
} from "@/lib/assembleias-constantes"
import { grafiasDoCpf, limparCpf } from "@/lib/cpf"
import { enviarEmail } from "@/lib/email"
import { direitoDoFiliado } from "@/lib/db/filiacao-direitos"
import {
  assembleiaPrincipalDasRodadas,
  escopoAptos,
  filtroAptos,
} from "@/lib/db/votacao-escopo"
import {
  abreEmISO,
  colunasHorario,
  colunasSala,
  fimDaJanelaISO,
  situacaoDaAssembleia,
} from "@/lib/db/assembleias-horarios"
import { createAdminClient } from "@/lib/supabase/admin"
import { tenantAtual } from "@/lib/tenant"
import type { CanalAcesso } from "@/lib/votacao-canais"
import {
  CODIGO_EMAIL_VOTACAO_MAX_TENTATIVAS as MAX_TENTATIVAS,
  CODIGO_EMAIL_VOTACAO_VALIDADE_MIN as CODIGO_VALIDADE_MIN,
} from "@/lib/votacao-codigo-email"

/**
 * Votação na ÁREA DO FILIADO (complemento ao ambiente público).
 *
 * Regras de negócio (Bruno, 2026-08-29):
 * - Aptidão: filiado ATIVO + empregador ATIVO no histórico de vínculos (sem
 *   desfiliação nem data de demissão) que seja fonte da campanha + consta nos
 *   APTOS por CPF ou por e-mail de votação VERIFICADO (= email_corporativo do
 *   apto — muitas empresas não cedem CPF).
 * - O VOTO é secreto: nunca liga o filiado ao conteúdo. A participação vive no
 *   apto (`hora_voto`); é dela que saem "Minhas votações" e o prontuário.
 */

function hashCodigo(codigo: string, token: string): string {
  return createHash("sha256").update(`${codigo}:${token}`).digest("hex")
}

// ── E-mail de votação verificado ───────────────────────────────────────────

export type EmailVotacao = {
  /** E-mail verificado atual (usado no casamento por e-mail). */
  email: string | null
  verificadoEm: string | null
  /** Há uma verificação de e-mail pendente (código enviado). */
  pendente: string | null
}

export async function obterEmailVotacao(cpf: string): Promise<EmailVotacao> {
  const admin = await createAdminClient()
  const { data, error } = await admin
    .from("votacao_email_verificado")
    .select("email, verificado_em, pend_email, pend_expira_em")
    .eq("emp_proprietaria_id", await tenantAtual())
    .eq("cpf", cpf)
    .maybeSingle()
  // Tolera a tabela ausente (SQL ainda não rodado) — o voto por CPF funciona
  // sem ela; só o casamento/verificação por e-mail depende do supabase/
  // assembleias-portal.sql.
  if (error) {
    return { email: null, verificadoEm: null, pendente: null }
  }
  const pendVivo =
    data?.pend_email &&
    data?.pend_expira_em &&
    new Date(data.pend_expira_em).getTime() > Date.now()
  return {
    email: (data?.email as string | null) ?? null,
    verificadoEm: (data?.verificado_em as string | null) ?? null,
    pendente: pendVivo ? (data!.pend_email as string) : null,
  }
}

/**
 * Se o e-mail informado já for exatamente o e-mail principal do filiado (o
 * mesmo que ele usa para entrar no portal), consideramos verificado e gravamos
 * direto — "e-mail principal verificado entra automaticamente".
 */
export async function definirEmailVotacaoDireto(
  cpf: string,
  email: string
): Promise<void> {
  const admin = await createAdminClient()
  const agora = new Date().toISOString()
  await admin.from("votacao_email_verificado").upsert(
    {
      emp_proprietaria_id: await tenantAtual(),
      cpf,
      email: email.toLowerCase(),
      verificado_em: agora,
      pend_email: null,
      pend_codigo_hash: null,
      pend_codigo_token: null,
      pend_expira_em: null,
      pend_tentativas: 0,
      updated_at: agora,
    },
    { onConflict: "emp_proprietaria_id,cpf" }
  )
}

export async function solicitarVerificacaoEmail(
  cpf: string,
  email: string
): Promise<{ erro?: string; ok?: string }> {
  const alvo = email.trim().toLowerCase()
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(alvo)) {
    return { erro: "Informe um e-mail válido." }
  }
  const admin = await createAdminClient()
  const emp = await tenantAtual()
  const codigo = String(randomInt(0, 1_000_000)).padStart(6, "0")
  const token = randomUUID()
  const agora = new Date()
  const expira = new Date(agora.getTime() + CODIGO_VALIDADE_MIN * 60_000)

  const { error } = await admin.from("votacao_email_verificado").upsert(
    {
      emp_proprietaria_id: emp,
      cpf,
      pend_email: alvo,
      pend_codigo_hash: hashCodigo(codigo, token),
      pend_codigo_token: token,
      pend_expira_em: expira.toISOString(),
      pend_tentativas: 0,
      updated_at: agora.toISOString(),
    },
    { onConflict: "emp_proprietaria_id,cpf" }
  )
  if (error) {
    if (/schema|does not exist|relation/i.test(error.message)) {
      return { erro: "Rode supabase/assembleias-portal.sql no Supabase." }
    }
    return { erro: "Não foi possível iniciar a verificação." }
  }

  const enviado = await enviarEmail({
    email: alvo,
    assunto: "Código para verificar seu e-mail de votação — {ENTIDADE}",
    html: `<p>Seu código para verificar este e-mail de votação é:</p>
      <p style="font-size:24px;font-weight:bold;letter-spacing:4px">${codigo}</p>
      <p>Ele vale por ${CODIGO_VALIDADE_MIN} minutos. Se você não pediu isso, ignore este e-mail.</p>`,
  })
  if (!enviado) {
    return {
      erro: "Não foi possível enviar o e-mail. Confira o endereço e tente de novo.",
    }
  }
  return { ok: `Enviamos um código para ${alvo}. Digite-o para confirmar.` }
}

export async function confirmarVerificacaoEmail(
  cpf: string,
  codigo: string
): Promise<{ erro?: string; ok?: boolean }> {
  if (!/^\d{6}$/.test(codigo)) return { erro: "O código tem 6 dígitos." }
  const admin = await createAdminClient()
  const emp = await tenantAtual()
  const { data } = await admin
    .from("votacao_email_verificado")
    .select("pend_email, pend_codigo_hash, pend_codigo_token, pend_expira_em, pend_tentativas")
    .eq("emp_proprietaria_id", emp)
    .eq("cpf", cpf)
    .maybeSingle()
  if (!data?.pend_email || !data.pend_codigo_hash || !data.pend_codigo_token) {
    return { erro: "Nenhuma verificação pendente. Reenvie o código." }
  }
  if (
    !data.pend_expira_em ||
    new Date(data.pend_expira_em).getTime() < Date.now()
  ) {
    return { erro: "Código expirado. Reenvie." }
  }
  const tentativas = typeof data.pend_tentativas === "number" ? data.pend_tentativas : 0
  if (tentativas >= MAX_TENTATIVAS) {
    return { erro: "Muitas tentativas com este código. Peça um novo código." }
  }
  if (hashCodigo(codigo, data.pend_codigo_token) !== data.pend_codigo_hash) {
    // Conta o erro só sobre o valor lido (faz o papel de um incremento
    // atômico): dois chutes ao mesmo tempo não valem por um.
    const { data: contado } = await admin
      .from("votacao_email_verificado")
      .update({ pend_tentativas: tentativas + 1 })
      .eq("emp_proprietaria_id", emp)
      .eq("cpf", cpf)
      .eq("pend_codigo_token", data.pend_codigo_token)
      .eq("pend_tentativas", tentativas)
      .select("pend_tentativas")
    if (!contado?.length) return { erro: "Código inválido. Tente de novo." }
    const restam = MAX_TENTATIVAS - (tentativas + 1)
    return {
      erro:
        restam > 0
          ? `Código inválido. Resta${restam === 1 ? "" : "m"} ${restam} tentativa${restam === 1 ? "" : "s"}.`
          : "Código inválido. As tentativas acabaram: peça um novo código.",
    }
  }
  const agora = new Date().toISOString()
  await admin
    .from("votacao_email_verificado")
    .update({
      email: data.pend_email,
      verificado_em: agora,
      pend_email: null,
      pend_codigo_hash: null,
      pend_codigo_token: null,
      pend_expira_em: null,
      pend_tentativas: 0,
      updated_at: agora,
    })
    .eq("emp_proprietaria_id", emp)
    .eq("cpf", cpf)
  return { ok: true }
}

// ── Aptidão: assembleias em que o filiado pode votar/consultar ─────────────

export type AssembleiaDoFiliado = {
  assembleiaId: string
  rodadaId: string | null
  campanhaId: string | null
  nome: string | null
  tema: string | null
  empregador: string | null
  modalidade: Modalidade
  /**
   * Aceita voto pela internet (online OU híbrida — temVotoOnline). Na híbrida
   * a mesma pessoa escolhe entre a cédula online e a urna; o voto é um só.
   */
  online: boolean
  inicio: string | null
  /** Hora de início ('HH:MM'), quando a assembleia tem (presencial: "às 14:00"). */
  horaInicio: string | null
  /** Fim da assembleia (data + hora) — base da contagem regressiva (online). */
  termino: string | null
  /** Sala da reunião online, quando há e ainda não passou (achado A47). */
  sala: SalaVirtual | null
  /** Quando a votação ainda não abriu: o momento em que abre. */
  abreEm: string | null
  apuracaoEncerrada: boolean
  /** Já votou? (apto.hora_voto preenchido) */
  jaVotou: boolean
  /** Pleito interno: só filiados votam, e a carência de filiação se aplica. */
  somenteFiliados: boolean
  /**
   * Bloqueio por carência, quando houver. Nulo = pode votar.
   * Só existe em pleito de filiados — assembleia da categoria nunca tem.
   */
  carencia: { motivo: string; liberaEm: string | null; diasRestantes: number | null } | null
}

function txt(v: unknown): string | null {
  return typeof v === "string" && v.trim() ? v : null
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/**
 * Sala da assembleia virtual de uma linha de voto_assembleias (colunasSala).
 * Só link web (http/https — o mesmo que o painel aceita ao salvar; nada de
 * javascript:), e só enquanto a data da sala não passou: assembleia velha
 * não deve exibir link morto. Sem data, vale o link com o que houver.
 */
function salaDaLinha(a: Record<string, unknown>): SalaVirtual | null {
  const link = txt(a.sala_link)?.trim()
  if (!link || !/^https?:\/\//i.test(link)) return null
  const data = txt(a.sala_data)?.slice(0, 10) ?? null
  if (data && data < hojeEmBrasilia()) return null
  return { link, data, hora: horaCurta(txt(a.sala_hora)) }
}

/**
 * Fontes pagadoras de cada campanha (voto_campanha_fontes). Desde 09/2026 o
 * painel não grava empregador na rodada nem na assembleia (criarRodada /
 * criarAssembleia): ele mora na campanha. No legado, quando os dois existem,
 * o empregador da rodada/assembleia é SEMPRE uma fonte da campanha — 13 de 13
 * rodadas e 38 de 38 assembleias no tenant real (conferido em 11/10/2026).
 * É a régua do Bruno: empregador ativo "que seja fonte da campanha".
 */
async function fontesDasCampanhas(campanhaIds: string[]): Promise<Map<string, string[]>> {
  const mapa = new Map<string, string[]>()
  if (campanhaIds.length === 0) return mapa
  const admin = await createAdminClient()
  const { data } = await admin
    .from("voto_campanha_fontes")
    .select("campanha_id, empresa_id")
    .in("campanha_id", campanhaIds)
  for (const f of data ?? []) {
    const empresa = txt(f.empresa_id)
    if (!empresa) continue
    const arr = mapa.get(String(f.campanha_id)) ?? []
    arr.push(empresa)
    mapa.set(String(f.campanha_id), arr)
  }
  return mapa
}

/** Nome de exibição de cada empresa (fantasia, senão razão social); sem nome fica de fora. */
async function nomesDasEmpresas(ids: string[]): Promise<Map<string, string>> {
  const mapa = new Map<string, string>()
  if (ids.length === 0) return mapa
  const admin = await createAdminClient()
  const { data } = await admin
    .from("empresa")
    .select("id, nome_fantasia, nome_razao")
    .in("id", [...new Set(ids)])
  for (const e of data ?? []) {
    const nome = txt(e.nome_fantasia) ?? txt(e.nome_razao)
    if (nome) mapa.set(String(e.id), nome)
  }
  return mapa
}

/**
 * fonte_pagadora_id dos empregadores ATIVOS do CPF (sem desfiliação/demissão).
 * Exportada porque a Oposição usa a MESMA régua para saber se o filiado
 * trabalha numa fonte com campanha aberta — duas cópias da regra iriam
 * divergir na primeira mudança.
 */
export async function empregadoresAtivos(cpf: string): Promise<Set<string>> {
  const admin = await createAdminClient()
  const emp = await tenantAtual()
  const { data: filiacoes } = await admin
    .from("filiacoes")
    .select("id")
    // O legado tem CPF com e sem máscara: comparar só uma grafia perdia vínculos.
    .in("cpf", grafiasDoCpf(limparCpf(cpf)))
    .eq("emp_proprietaria_id", emp)
    .not("filiacao_excluida", "is", true)
  const ids = (filiacoes ?? []).map((f) => f.id as string)
  if (ids.length === 0) return new Set()

  const { data: vinc } = await admin
    .from("filiacao_vinculos")
    .select("fonte_pagadora_id, data_desfiliacao, data_saida_demissao")
    .in("filiado_id", ids)
  // Empregador ativo = vínculo sem data de DESFILIAÇÃO nem de DEMISSÃO. (A
  // "data de saída" é duplicata de uma delas — não é critério à parte.)
  const ativos = new Set<string>()
  for (const v of vinc ?? []) {
    if (
      txt(v.fonte_pagadora_id) &&
      !txt(v.data_desfiliacao) &&
      !txt(v.data_saida_demissao)
    ) {
      ativos.add(String(v.fonte_pagadora_id))
    }
  }
  return ativos
}

/**
 * Assembleias abertas em que este filiado ativo está apto (por CPF ou e-mail
 * verificado) e cujo empregador — o da assembleia, o da rodada ou uma fonte
 * da campanha — está ativo no vínculo dele.
 */
export async function assembleiasDoFiliado(
  cpf: string
): Promise<AssembleiaDoFiliado[]> {
  const admin = await createAdminClient()
  const emp = await tenantAtual()

  const [ativos, emailVot] = await Promise.all([
    empregadoresAtivos(cpf),
    obterEmailVotacao(cpf),
  ])
  if (ativos.size === 0) return []

  // Aptos que casam por CPF ou por e-mail de votação verificado.
  const filtros = [`cpf.eq.${cpf}`]
  if (emailVot.email) filtros.push(`email_corporativo.eq.${emailVot.email}`)
  const { data: aptos } = await admin
    .from("voto_assembleias_aptos")
    .select("id, assembleia_id, rod_assembleia_id, hora_voto, presenca_em")
    .eq("emp_proprietaria_id", emp)
    .or(filtros.join(","))
  if (!aptos || aptos.length === 0) return []

  // Apto só na RODADA (a lista que a gestão sobe) vale em todas as assembleias
  // dela; apto amarrado a uma assembleia vale só nela. Ver votacao-escopo.ts.
  const rodadasSoltas = [
    ...new Set(
      aptos
        .filter((a) => !a.assembleia_id && a.rod_assembleia_id)
        .map((a) => String(a.rod_assembleia_id))
    ),
  ]
  const { data: daRodada } = rodadasSoltas.length
    ? await admin
        .from("voto_assembleias")
        .select("id, rod_assembleia_id")
        .eq("emp_proprietaria_id", emp)
        .in("rod_assembleia_id", rodadasSoltas)
    : { data: [] as { id: string; rod_assembleia_id: string }[] }

  // Voto único POR RODADA: presença registrada na urna (mesmo antes do voto
  // digital cair) já conta — impede votar online numa assembleia híbrida.
  const votouNaRodada = new Map<string, boolean>()
  for (const a of aptos) {
    const r = txt(a.rod_assembleia_id)
    if (r) votouNaRodada.set(r, votouNaRodada.get(r) || Boolean(a.hora_voto) || Boolean(a.presenca_em))
  }
  const votouPorAssembleia = new Map<string, boolean>()
  const marcar = (aid: string, votou: boolean) =>
    votouPorAssembleia.set(aid, votouPorAssembleia.get(aid) || votou)
  for (const a of aptos) {
    if (!a.assembleia_id) continue
    const r = txt(a.rod_assembleia_id)
    marcar(
      String(a.assembleia_id),
      Boolean(a.hora_voto) || Boolean(a.presenca_em) || (r ? (votouNaRodada.get(r) ?? false) : false)
    )
  }
  for (const a of daRodada ?? []) {
    marcar(String(a.id), votouNaRodada.get(String(a.rod_assembleia_id)) ?? false)
  }
  const assembleiaIds = [...votouPorAssembleia.keys()]
  if (assembleiaIds.length === 0) return []

  // O select é montado com as colunas de horário quando elas existem, então o
  // tipo vem solto — as leituras passam por txt()/derivarModalidade().
  const { data: brutas } = await admin
    .from("voto_assembleias")
    .select(
      "id, nome_assembleia, online, urnas_de_votacao, somente_filiados, data_inicio, data_termino, periodo_inicio, periodo_termino, apuracao_encerrada, empresa_id, rod_assembleia_id, campanha_id" +
        (await colunasHorario()) +
        (await colunasSala())
    )
    .eq("emp_proprietaria_id", emp)
    .in("id", assembleiaIds)
  const assembleias = (brutas ?? []) as unknown as Record<string, unknown>[]
  if (assembleias.length === 0) return []

  // Empregador da assembleia (empresa_id) ou da rodada.
  const rodIds = [
    ...new Set(
      assembleias.map((a) => txt(a.rod_assembleia_id)).filter(Boolean) as string[]
    ),
  ]
  const rodadas = new Map<string, Record<string, unknown>>()
  if (rodIds.length) {
    const { data } = await admin
      .from("voto_rod_assembleias")
      .select("id, empresa_id, campanha_id, termino, apuracao_encerrada")
      .in("id", rodIds)
    for (const r of data ?? []) rodadas.set(String(r.id), r)
  }

  const campanhaDe = (a: Record<string, unknown>): string | null => {
    const rod = a.rod_assembleia_id ? rodadas.get(String(a.rod_assembleia_id)) : null
    return txt(a.campanha_id) ?? txt(rod?.campanha_id)
  }
  const campanhaIds = new Set(
    assembleias.map(campanhaDe).filter((c): c is string => Boolean(c))
  )
  // Empregador: o da assembleia, o da rodada ou — sem nenhum dos dois, como
  // em tudo o que o painel cria desde 09/2026 — as fontes da campanha. Antes
  // a falta dele escondia do portal TODAS as votações novas (investigação da
  // onda 3, 11/10/2026: 7 de 7 rodadas recentes com empresa_id nulo).
  const fontes = await fontesDasCampanhas([...campanhaIds])
  const empresasDe = (a: Record<string, unknown>): string[] => {
    const rod = a.rod_assembleia_id ? rodadas.get(String(a.rod_assembleia_id)) : null
    const propria = txt(a.empresa_id) ?? txt(rod?.empresa_id)
    if (propria) return [propria]
    const camp = campanhaDe(a)
    return camp ? (fontes.get(camp) ?? []) : []
  }
  const [nomeEmpresa, campanhasRes] = await Promise.all([
    nomesDasEmpresas(assembleias.flatMap(empresasDe)),
    campanhaIds.size
      ? admin.from("voto_campanha").select("id, tema").in("id", [...campanhaIds])
      : Promise.resolve({ data: [] }),
  ])
  const temaCampanha = new Map(
    (campanhasRes.data ?? []).map((c) => [String(c.id), txt(c.tema)])
  )

  // A carência é a MESMA para todos os pleitos do filiado — uma consulta só,
  // fora do laço.
  const direito = await direitoDoFiliado(cpf, "votacao")

  const agora = Date.now()
  const saida: AssembleiaDoFiliado[] = []
  for (const a of assembleias) {
    const rod = a.rod_assembleia_id ? rodadas.get(String(a.rod_assembleia_id)) : null
    // Um empregador da assembleia precisa estar ATIVO no vínculo do filiado.
    // Sem empregador nenhum (legado sem rodada nem campanha com fonte), a
    // assembleia segue fora: a lista de aptos sozinha não basta.
    const empId = empresasDe(a).find((e) => ativos.has(e))
    if (!empId) continue

    const apuracaoEncerrada =
      a.apuracao_encerrada === true || rod?.apuracao_encerrada === true
    const modalidade = derivarModalidade(a)
    // Híbrida também tem cédula online (antes só "online" contava, e a
    // híbrida aparecia como presencial — achado A11).
    const online = temVotoOnline(modalidade)
    const inicio = txt(a.data_inicio) ?? txt(a.periodo_inicio)
    const fonte = {
      data_inicio: txt(a.data_inicio) ?? txt(a.periodo_inicio),
      hora_inicio: txt(a.hora_inicio),
      data_termino: txt(a.data_termino) ?? txt(a.periodo_termino),
      hora_termino: txt(a.hora_termino),
    }
    const terminoRodada = txt(rod?.termino)

    // Só interessa o que ainda está em andamento: não encerrado e dentro da
    // janela da assembleia (data + hora).
    if (apuracaoEncerrada) continue
    if (situacaoDaAssembleia(fonte, terminoRodada, agora) === "encerrada") continue
    const termino = fimDaJanelaISO(fonte, terminoRodada)

    saida.push({
      assembleiaId: String(a.id),
      rodadaId: txt(a.rod_assembleia_id),
      campanhaId: txt(a.campanha_id) ?? txt(rod?.campanha_id),
      nome: txt(a.nome_assembleia),
      tema: temaCampanha.get(String(txt(a.campanha_id) ?? txt(rod?.campanha_id))) ?? null,
      empregador: nomeEmpresa.get(empId) ?? null,
      modalidade,
      online,
      inicio,
      horaInicio: horaCurta(txt(a.hora_inicio)),
      termino,
      sala: salaDaLinha(a),
      abreEm: abreEmISO(fonte, agora),
      apuracaoEncerrada,
      jaVotou: votouPorAssembleia.get(String(a.id)) ?? false,
      somenteFiliados: a.somente_filiados === true,
      carencia:
        a.somente_filiados === true && !direito.liberado
          ? {
              motivo: direito.motivo ?? "Carência de filiação não cumprida.",
              liberaEm: direito.liberaEm ?? null,
              diasRestantes: direito.diasRestantes ?? null,
            }
          : null,
    })
  }
  // Online (com contagem) primeiro; depois por término mais próximo.
  saida.sort((x, y) => {
    if (x.online !== y.online) return x.online ? -1 : 1
    return (x.termino ?? "9999").localeCompare(y.termino ?? "9999")
  })
  return saida
}

// ── Cédula: perguntas e registro do voto (secreto) ─────────────────────────

export type OpcaoVoto = { id: string; texto: string | null }
export type PerguntaVoto = {
  id: string
  pergunta: string | null
  ordem: number | null
  opcoes: OpcaoVoto[]
}

/** Perguntas + opções da rodada de uma assembleia (para a cédula). */
export async function perguntasDaAssembleia(
  assembleiaId: string
): Promise<PerguntaVoto[]> {
  const admin = await createAdminClient()
  const emp = await tenantAtual()
  const { data: a } = await admin
    .from("voto_assembleias")
    .select("rod_assembleia_id")
    .eq("id", assembleiaId)
    .eq("emp_proprietaria_id", emp)
    .maybeSingle()
  const rodId = a ? txt(a.rod_assembleia_id) : null
  if (!rodId) return []
  const { data: perguntas } = await admin
    .from("voto_assembleias_perguntas")
    .select("id, pergunta, ordem")
    .eq("rod_assembleia_id", rodId)
    .order("ordem", { ascending: true, nullsFirst: false })
  const ids = (perguntas ?? []).map((p) => p.id as string)
  const opcoesPorPergunta = new Map<string, OpcaoVoto[]>()
  if (ids.length) {
    const { data: opcoes } = await admin
      .from("voto_opcoes_resposta")
      .select("id, opcao_resposta, pergunta_id")
      .in("pergunta_id", ids)
    for (const o of opcoes ?? []) {
      const arr = opcoesPorPergunta.get(String(o.pergunta_id)) ?? []
      arr.push({ id: String(o.id), texto: txt(o.opcao_resposta) })
      opcoesPorPergunta.set(String(o.pergunta_id), arr)
    }
  }
  return (perguntas ?? []).map((p) => ({
    id: String(p.id),
    pergunta: txt(p.pergunta),
    ordem: (p.ordem as number | null) ?? null,
    opcoes: opcoesPorPergunta.get(String(p.id)) ?? [],
  }))
}

/** Assembleia elegível para ESTE filiado votar agora (ou null). */
export async function elegibilidadeParaVotar(
  cpf: string,
  assembleiaId: string
): Promise<AssembleiaDoFiliado | null> {
  const lista = await assembleiasDoFiliado(cpf)
  return lista.find((a) => a.assembleiaId === assembleiaId) ?? null
}

/**
 * O comprovante que acabou de sair com o voto — para a tela mostrar na hora
 * (achado A46). Nunca o conteúdo do voto.
 */
export type ComprovanteEmitido = {
  codigo: string
  quando: string
  canal: import("@/lib/db/voto-comprovante").CanalVoto
  /** Para onde o e-mail de confirmação SAIU; nulo = não saiu. */
  emailPara: string | null
}

/** Resultado do registro do voto; `comprovante` nulo = voto valeu, comprovante não saiu. */
export type VotoRegistrado = {
  erro?: string
  ok?: boolean
  comprovante?: ComprovanteEmitido | null
}

/**
 * Registra o voto do filiado de forma SECRETA: grava as respostas sem ligar
 * ao eleitor, marca a participação no apto (hora_voto) para impedir voto
 * duplo, e lança um apontamento GENÉRICO no prontuário.
 */
/**
 * Grava por onde a pessoa entrou para votar (fase 4 do plano de 16/10/2026),
 * na participação — nunca no voto. Melhor esforço: sem a coluna
 * (supabase/votacao-acesso-canal.sql) ou com erro, o voto já está gravado.
 */
/**
 * Reserva a participação ANTES de gravar o voto (achado S4): o update só pega
 * linhas com hora_voto nula e o Postgres serializa dois envios simultâneos.
 * Marca as linhas do eleitor no escopo, mas no máximo UMA por CPF: o índice
 * único voto_aptos_rodada_cpf_votou_idx (dossiê de auditoria C-4) recusa a
 * segunda participação do mesmo CPF na rodada, e marcar as duas derrubava o
 * voto inteiro. Se alguma linha do eleitor já votou, não reserva nada (antes
 * a outra linha, ainda nula, deixava votar de novo). Erro do banco (corrida
 * com outro envio) também conta como "já votou". Devolve os ids reservados.
 */
async function reservarParticipacao(
  admin: Awaited<ReturnType<typeof createAdminClient>>,
  emp: string,
  filtroOu: string,
  agora: string
): Promise<string[]> {
  const { data: linhas, error } = await admin
    .from("voto_assembleias_aptos")
    .select("id, cpf, hora_voto")
    .eq("emp_proprietaria_id", emp)
    .or(filtroOu)
  if (error || !linhas?.length) return []
  if (linhas.some((l) => l.hora_voto)) return []
  const cpfs = new Set<string>()
  const ids: string[] = []
  for (const l of linhas) {
    const cpf = String(l.cpf ?? "").replace(/\D/g, "")
    if (cpf.length === 11) {
      if (cpfs.has(cpf)) continue
      cpfs.add(cpf)
    }
    ids.push(String(l.id))
  }
  const { data: reservados, error: erroReserva } = await admin
    .from("voto_assembleias_aptos")
    .update({ hora_voto: agora })
    .eq("emp_proprietaria_id", emp)
    .in("id", ids)
    .is("hora_voto", null)
    .select("id")
  if (erroReserva || !reservados) return []
  return reservados.map((r) => String(r.id))
}

async function marcarCanal(
  admin: Awaited<ReturnType<typeof createAdminClient>>,
  emp: string,
  ids: string[],
  canal: CanalAcesso
): Promise<void> {
  if (ids.length === 0) return
  try {
    await admin.from("voto_assembleias_aptos").update({ acesso_canal: canal }).eq("emp_proprietaria_id", emp).in("id", ids)
  } catch {
    // o canal é indicador; o voto já está registrado
  }
}

export async function registrarVotoFiliado(
  cpf: string,
  assembleiaId: string,
  escolhas: { perguntaId: string; opcaoId: string }[],
  /** Por onde entrou: o portal (padrão), o código na página da votação ou o link. */
  canal: CanalAcesso = "portal"
): Promise<VotoRegistrado> {
  const admin = await createAdminClient()
  const emp = await tenantAtual()

  const { buscarFiliadoPorCpf } = await import("@/lib/contas")
  const filiado = await buscarFiliadoPorCpf(cpf)
  if (!filiado?.ativo) {
    return { erro: "A votação pela área do filiado é para filiações ativas." }
  }

  const eleg = await elegibilidadeParaVotar(cpf, assembleiaId)
  if (!eleg) return { erro: "Você não está apto a votar nesta assembleia." }
  // `online` inclui a híbrida (temVotoOnline): só urna/reunião param aqui.
  if (!eleg.online) {
    return { erro: "Esta assembleia é só presencial — não há voto pela internet." }
  }
  if (eleg.jaVotou) return { erro: "Você já votou nesta assembleia." }
  if (eleg.abreEm) {
    return { erro: "A votação desta assembleia ainda não começou." }
  }
  // A carência é conferida AQUI, e não só na tela: sem isto bastaria um POST
  // direto para votar antes do prazo.
  if (eleg.carencia) {
    return {
      erro: `${eleg.carencia.motivo}${eleg.carencia.diasRestantes ? ` Faltam ${eleg.carencia.diasRestantes} dia(s).` : ""}`,
    }
  }

  const perguntas = await perguntasDaAssembleia(assembleiaId)
  if (perguntas.length === 0) {
    return { erro: "A cédula ainda não tem perguntas." }
  }
  const escolhaPorPergunta = new Map(
    escolhas.map((e) => [e.perguntaId, e.opcaoId])
  )
  for (const p of perguntas) {
    const opc = escolhaPorPergunta.get(p.id)
    if (!opc || !p.opcoes.some((o) => o.id === opc)) {
      return { erro: "Responda todas as perguntas para confirmar o voto." }
    }
  }

  const emailVot = await obterEmailVotacao(cpf)
  const agora = new Date().toISOString()

  // 1) RESERVA a participação no apto ANTES de gravar o voto — por cpf ou
  //    e-mail. O update só pega linhas com hora_voto nula e o Postgres
  //    serializa dois envios simultâneos: o segundo encontra 0 linhas e para
  //    aqui. (Antes a ordem era "grava o voto, depois marca", sem conferir
  //    linhas afetadas, e a corrida contava dois votos — achado S4.)
  const filtros = [`cpf.eq.${cpf}`]
  if (emailVot.email) filtros.push(`email_corporativo.eq.${emailVot.email}`)
  const filtroOu = filtroAptos(await escopoAptos(assembleiaId), filtros)
  const reservados = await reservarParticipacao(admin, emp, filtroOu, agora)
  if (reservados.length === 0) {
    return { erro: "Você já votou nesta assembleia." }
  }

  // 2) grava o voto SECRETO (sem eleitor_id) em voto_online — a tabela que a
  //    apuração do painel conta. Uma linha por pergunta. A hora vai truncada
  //    para não casar com a hora exata da participação.
  const linhas = perguntas.map((p) => ({
    emp_proprietaria_id: emp,
    assembleia_id: assembleiaId,
    rod_assembleia_id: eleg.rodadaId,
    pergunta_id: p.id,
    resposta_id: escolhaPorPergunta.get(p.id) as string,
    valido: true,
    eleitor_id: null,
    created_at: horaDoVotoSecreto(agora),
  }))
  const { error: erroVoto } = await admin.from("voto_online").insert(linhas)
  if (erroVoto) {
    // Sem voto gravado, a reserva é desfeita: a pessoa pode tentar de novo.
    await admin
      .from("voto_assembleias_aptos")
      .update({ hora_voto: null })
      .in("id", reservados)
    return { erro: `Não foi possível registrar o voto: ${erroVoto.message}` }
  }

  await marcarCanal(admin, emp, reservados, canal)

  // 2b) comprovante de participação + e-mail de confirmação (best-effort: o
  //     voto já está registrado, nada aqui pode derrubá-lo).
  const comprovante = await comprovarVoto({
    filtroOu,
    assembleiaId,
    quando: agora,
    email: emailVot.email ?? filiado.email,
    nome: filiado.nome_completo ?? null,
  })

  // 3) apontamento GENÉRICO no prontuário (sem revelar o voto). Best-effort.
  if (filiado?.filiacaoId) {
    const nomeAss = eleg.nome ? ` "${eleg.nome}"` : ""
    await admin.from("filiacao_prontuario").insert({
      filiacao_id: filiado.filiacaoId,
      data: agora,
      tipo: "Assembleia",
      descricao: `Participou da votação da assembleia${nomeAss}.`,
      diretor_funcionario_id: null,
      emp_proprietaria_id: emp,
      created_at: agora,
      modified_at: agora,
    })
  }
  return { ok: true, comprovante }
}

/** A participação do filiado numa assembleia (a rodada dela), sem o voto. */
export type ParticipacaoNaAssembleia = {
  quando: string | null
  codigo: string | null
  canal: import("@/lib/db/voto-comprovante").CanalVoto | null
  /** O e-mail de confirmação saiu (comprovante_email_em). */
  emailEnviado: boolean
}

/**
 * Para a tela da cédula depois do voto: quando votou e o comprovante. Lê os
 * aptos no escopo da assembleia (votacao-escopo.ts: o apto dela ou o da
 * rodada) — quem votou por um apto amarrado a OUTRA assembleia da rodada
 * fica sem código aqui, e a tela manda para Minhas votações.
 * A tela é refeita no servidor logo depois do voto (a action revalida), e é
 * daqui que ela tira o comprovante — inclusive se a pessoa recarregar.
 */
export async function participacaoNaAssembleia(
  cpf: string,
  assembleiaId: string
): Promise<ParticipacaoNaAssembleia | null> {
  // O id vem da URL e entra no filtro .or() do PostgREST. Diferente do voto
  // (que passa antes por elegibilidadeParaVotar), aqui nada o valida: um id
  // com "),or(" abriria o filtro e traria o comprovante de outra pessoa.
  if (!UUID.test(assembleiaId)) return null
  const admin = await createAdminClient()
  const emailVot = await obterEmailVotacao(cpf)
  const filtros = [`cpf.eq.${cpf}`]
  if (emailVot.email) filtros.push(`email_corporativo.eq.${emailVot.email}`)
  const { colunasComprovante, comprovanteDaLinha } = await import("@/lib/db/voto-comprovante")
  // comprovante_email_em nasce no mesmo SQL das outras colunas do comprovante.
  const colunas = await colunasComprovante()
  const { data } = await admin
    .from("voto_assembleias_aptos")
    .select("hora_voto" + colunas + (colunas ? ", comprovante_email_em" : ""))
    .eq("emp_proprietaria_id", await tenantAtual())
    .or(filtroAptos(await escopoAptos(assembleiaId), filtros))
    .not("hora_voto", "is", null)
    .order("hora_voto", { ascending: false })
    .limit(5)
  const linhas = (data ?? []) as unknown as Record<string, unknown>[]
  if (linhas.length === 0) return null
  const comComprovante = linhas.find((l) => comprovanteDaLinha(l)) ?? linhas[0]
  const comp = comprovanteDaLinha(comComprovante)
  return {
    quando: comp?.quando ?? txt(comComprovante.hora_voto),
    codigo: comp?.codigo ?? null,
    canal: comp?.canal ?? null,
    emailEnviado: Boolean(txt(comComprovante.comprovante_email_em)),
  }
}

/**
 * Quando a votação online de uma assembleia termina e se já terminou — para
 * a cédula dizer "encerrou em 12/10 às 18:00" em vez de insinuar erro de
 * cadastro (achado A93). Só datas: não diz nada sobre quem é apto.
 */
export async function fimDaVotacao(
  assembleiaId: string
): Promise<{ termino: string | null; encerrada: boolean } | null> {
  const admin = await createAdminClient()
  const emp = await tenantAtual()
  const { data: bruta } = await admin
    .from("voto_assembleias")
    .select(
      "id, data_inicio, data_termino, periodo_inicio, periodo_termino, apuracao_encerrada, rod_assembleia_id" +
        (await colunasHorario())
    )
    .eq("id", assembleiaId)
    .eq("emp_proprietaria_id", emp)
    .maybeSingle()
  const a = bruta as unknown as Record<string, unknown> | null
  if (!a) return null
  const { data: rod } = txt(a.rod_assembleia_id)
    ? await admin
        .from("voto_rod_assembleias")
        .select("termino, apuracao_encerrada")
        .eq("id", String(a.rod_assembleia_id))
        .eq("emp_proprietaria_id", emp)
        .maybeSingle()
    : { data: null }
  const fonte = {
    data_inicio: txt(a.data_inicio) ?? txt(a.periodo_inicio),
    hora_inicio: txt(a.hora_inicio),
    data_termino: txt(a.data_termino) ?? txt(a.periodo_termino),
    hora_termino: txt(a.hora_termino),
  }
  const terminoRodada = txt(rod?.termino)
  return {
    termino: fimDaJanelaISO(fonte, terminoRodada),
    encerrada:
      a.apuracao_encerrada === true ||
      rod?.apuracao_encerrada === true ||
      situacaoDaAssembleia(fonte, terminoRodada) === "encerrada",
  }
}

// ── Minhas votações (participação; nunca o conteúdo do voto) ────────────────

export type MinhaVotacao = {
  assembleiaId: string
  nome: string | null
  tema: string | null
  empregador: string | null
  modalidade: Modalidade
  quando: string | null
  /** Urna presencial em que votou (registro do eleitor), quando houver. */
  urna: string | null
  apuracaoEncerrada: boolean
  /** Comprovante da participação (código, canal, resumo) — nunca o voto. */
  comprovante: import("@/lib/db/voto-comprovante").ComprovanteDoEleitor | null
  /**
   * Resultado FINAL por opção (só quando apurado). Cada pergunta com suas
   * opções + branco/nulo. Nunca resultados parciais.
   */
  resultado:
    | {
        perguntaId: string
        pergunta: string | null
        itens: { rotulo: string; quantidade: number }[]
      }[]
    | null
  /**
   * SHA-256 do resultado congelado, calculado pelo banco no encerramento
   * (dossiê de auditoria C-3): o filiado pode guardar e conferir depois.
   */
  resultadoHash: string | null
}

/** Votações em que o filiado PARTICIPOU (apto com hora_voto), sem o voto. */
export async function minhasVotacoes(cpf: string): Promise<MinhaVotacao[]> {
  const admin = await createAdminClient()
  const emp = await tenantAtual()
  const emailVot = await obterEmailVotacao(cpf)

  const filtros = [`cpf.eq.${cpf}`]
  if (emailVot.email) filtros.push(`email_corporativo.eq.${emailVot.email}`)
  // Select montado (as colunas do comprovante só entram depois do SQL), por
  // isso o tipo vem solto.
  const { data: aptosBrutos } = await admin
    .from("voto_assembleias_aptos")
    .select(
      "assembleia_id, rod_assembleia_id, hora_voto, presenca_urna_id" +
        (await (await import("@/lib/db/voto-comprovante")).colunasComprovante())
    )
    .eq("emp_proprietaria_id", emp)
    .or(filtros.join(","))
    .not("hora_voto", "is", null)
  const aptos = (aptosBrutos ?? []) as unknown as Record<string, unknown>[]
  if (aptos.length === 0) return []

  // Apto só na rodada: a participação aparece na assembleia da urna em que a
  // presença foi registrada, ou na assembleia principal da rodada.
  const urnasDaPresenca = [
    ...new Set(
      aptos
        .filter((a) => !a.assembleia_id && a.presenca_urna_id)
        .map((a) => String(a.presenca_urna_id))
    ),
  ]
  const { data: urnasAss } = urnasDaPresenca.length
    ? await admin.from("voto_urnas").select("id, assembleia_id").in("id", urnasDaPresenca)
    : { data: [] as { id: string; assembleia_id: string }[] }
  const assembleiaDaUrna = new Map((urnasAss ?? []).map((u) => [String(u.id), String(u.assembleia_id)]))
  const principal = await assembleiaPrincipalDasRodadas([
    ...new Set(
      aptos
        .filter((a) => !a.assembleia_id && a.rod_assembleia_id)
        .map((a) => String(a.rod_assembleia_id))
    ),
  ])

  const { comprovanteDaLinha } = await import("@/lib/db/voto-comprovante")
  const votouEm = new Map<string, string>()
  const comprovantePor = new Map<
    string,
    import("@/lib/db/voto-comprovante").ComprovanteDoEleitor
  >()
  const urnaDaAssembleia = new Map<string, string>()
  for (const a of aptos) {
    const id =
      txt(a.assembleia_id) ??
      (a.presenca_urna_id ? assembleiaDaUrna.get(String(a.presenca_urna_id)) : undefined) ??
      (a.rod_assembleia_id ? principal.get(String(a.rod_assembleia_id)) : undefined)
    if (!id) continue
    if (!votouEm.has(id)) votouEm.set(id, String(a.hora_voto))
    const comp = comprovanteDaLinha(a)
    if (comp && !comprovantePor.has(id)) comprovantePor.set(id, comp)
    const urnaId = txt(a.presenca_urna_id)
    if (urnaId && !urnaDaAssembleia.has(id)) urnaDaAssembleia.set(id, urnaId)
  }
  const ids = [...votouEm.keys()]

  const urnaIds = [...new Set(urnaDaAssembleia.values())]
  const { data: urnasData } = urnaIds.length
    ? await admin
        .from("voto_urnas")
        .select("id, nome")
        .eq("emp_proprietaria_id", emp)
        .in("id", urnaIds)
    : { data: [] }
  const nomeUrna = new Map(
    (urnasData ?? []).map((u) => [String(u.id), txt(u.nome)])
  )
  const { data: assembleias } = await admin
    .from("voto_assembleias")
    .select(
      "id, nome_assembleia, online, urnas_de_votacao, apuracao_encerrada, empresa_id, campanha_id, rod_assembleia_id"
    )
    .eq("emp_proprietaria_id", emp)
    .in("id", ids)
  if (!assembleias) return []
  const { hashesDosResultados } = await import("@/lib/db/votacao-livro-apuracao")
  const hashes = await hashesDosResultados(
    assembleias.filter((a) => a.apuracao_encerrada === true).map((a) => String(a.id))
  )

  // Resultado final por opção (snapshot) das assembleias já apuradas.
  const apuradas = assembleias
    .filter((a) => a.apuracao_encerrada === true)
    .map((a) => String(a.id))
  const resultadoPorAssembleia = new Map<
    string,
    { perguntaId: string; pergunta: string | null; itens: { rotulo: string; quantidade: number }[] }[]
  >()
  if (apuradas.length) {
    const { data: linhas } = await admin
      .from("voto_resultado_final")
      .select("assembleia_id, pergunta_id, opcao_id, tipo, quantidade")
      .eq("emp_proprietaria_id", emp)
      .in("assembleia_id", apuradas)
    const perguntaIds = [
      ...new Set((linhas ?? []).map((l) => String(l.pergunta_id))),
    ]
    const opcaoIds = [
      ...new Set(
        (linhas ?? [])
          .map((l) => txt(l.opcao_id))
          .filter(Boolean) as string[]
      ),
    ]
    const [{ data: pergs }, { data: ops }] = await Promise.all([
      perguntaIds.length
        ? admin
            .from("voto_assembleias_perguntas")
            .select("id, pergunta, ordem")
            .in("id", perguntaIds)
        : Promise.resolve({ data: [] }),
      opcaoIds.length
        ? admin
            .from("voto_opcoes_resposta")
            .select("id, opcao_resposta")
            .in("id", opcaoIds)
        : Promise.resolve({ data: [] }),
    ])
    const textoPergunta = new Map(
      (pergs ?? []).map((p) => [String(p.id), txt(p.pergunta)])
    )
    const ordemPergunta = new Map(
      (pergs ?? []).map((p) => [String(p.id), (p.ordem as number | null) ?? 0])
    )
    const textoOpcao = new Map(
      (ops ?? []).map((o) => [String(o.id), txt(o.opcao_resposta)])
    )
    // Agrupa por assembleia → pergunta → itens.
    for (const ass of apuradas) {
      const doAss = (linhas ?? []).filter((l) => String(l.assembleia_id) === ass)
      const porPergunta = new Map<string, { rotulo: string; quantidade: number }[]>()
      for (const l of doAss) {
        const pid = String(l.pergunta_id)
        const rotulo =
          l.tipo === "branco"
            ? "Branco"
            : l.tipo === "nulo"
              ? "Nulo"
              : textoOpcao.get(txt(l.opcao_id) ?? "") ?? "(opção)"
        const arr = porPergunta.get(pid) ?? []
        arr.push({
          rotulo,
          quantidade: typeof l.quantidade === "number" ? l.quantidade : 0,
        })
        porPergunta.set(pid, arr)
      }
      const perguntas = [...porPergunta.entries()]
        .sort((x, y) => (ordemPergunta.get(x[0]) ?? 0) - (ordemPergunta.get(y[0]) ?? 0))
        .map(([pid, itens]) => ({
          perguntaId: pid,
          pergunta: textoPergunta.get(pid) ?? null,
          itens,
        }))
      resultadoPorAssembleia.set(ass, perguntas)
    }
  }

  // Empregador e tema: os da assembleia, os da rodada ou as fontes da
  // campanha — o que o painel cria desde 09/2026 só tem a campanha, e o
  // histórico ficava sem empresa e sem tema.
  const rodadaIds = [
    ...new Set(
      assembleias.map((a) => txt(a.rod_assembleia_id)).filter(Boolean) as string[]
    ),
  ]
  const { data: rodadasHist } = rodadaIds.length
    ? await admin
        .from("voto_rod_assembleias")
        .select("id, empresa_id, campanha_id")
        .eq("emp_proprietaria_id", emp)
        .in("id", rodadaIds)
    : { data: [] as { id: string; empresa_id: string | null; campanha_id: string | null }[] }
  const rodadaHist = new Map((rodadasHist ?? []).map((r) => [String(r.id), r]))
  const campanhaDe = (a: (typeof assembleias)[number]): string | null =>
    txt(a.campanha_id) ?? txt(rodadaHist.get(String(a.rod_assembleia_id))?.campanha_id)
  const campanhaIds = [
    ...new Set(assembleias.map(campanhaDe).filter((c): c is string => Boolean(c))),
  ]
  const fontes = await fontesDasCampanhas(campanhaIds)
  const empresasDe = (a: (typeof assembleias)[number]): string[] => {
    const propria =
      txt(a.empresa_id) ?? txt(rodadaHist.get(String(a.rod_assembleia_id))?.empresa_id)
    if (propria) return [propria]
    const camp = campanhaDe(a)
    return camp ? (fontes.get(camp) ?? []) : []
  }
  const [nomeEmpresa, campanhasRes] = await Promise.all([
    nomesDasEmpresas(assembleias.flatMap(empresasDe)),
    campanhaIds.length
      ? admin.from("voto_campanha").select("id, tema").in("id", campanhaIds)
      : Promise.resolve({ data: [] }),
  ])
  const temaCampanha = new Map(
    (campanhasRes.data ?? []).map((c) => [String(c.id), txt(c.tema)])
  )

  return assembleias
    .map((a) => {
      const apurado = a.apuracao_encerrada === true
      return {
        assembleiaId: String(a.id),
        nome: txt(a.nome_assembleia),
        tema: temaCampanha.get(campanhaDe(a) ?? "") ?? null,
        empregador:
          empresasDe(a)
            .map((e) => nomeEmpresa.get(e))
            .filter(Boolean)
            .join(" / ") || null,
        modalidade: derivarModalidade(a),
        quando: votouEm.get(String(a.id)) ?? null,
        comprovante: comprovantePor.get(String(a.id)) ?? null,
        urna:
          nomeUrna.get(urnaDaAssembleia.get(String(a.id)) ?? "") ?? null,
        apuracaoEncerrada: apurado,
        resultado: apurado
          ? resultadoPorAssembleia.get(String(a.id)) ?? []
          : null,
        resultadoHash: apurado ? (hashes.get(String(a.id)) ?? null) : null,
      }
    })
    .sort((x, y) => (y.quando ?? "").localeCompare(x.quando ?? ""))
}

// ── Eleitor NÃO-FILIADO (ambiente público, por e-mail corporativo) ─────────
//
// A empresa envia a lista de aptos; muitos sem CPF, só com e-mail. O
// não-filiado se identifica pelo e-mail do apto (OTP nesse e-mail). Não há
// vínculo/filiação a checar, nem prontuário — só a aptidão na lista.

/** Assembleia elegível para um eleitor identificado por e-mail (ou null). */
export async function elegibilidadeEleitorEmail(
  email: string,
  assembleiaId: string
): Promise<AssembleiaDoFiliado | null> {
  const admin = await createAdminClient()
  const emp = await tenantAtual()
  const alvo = email.trim().toLowerCase()

  const escopo = await escopoAptos(assembleiaId)
  const { data: aptos } = await admin
    .from("voto_assembleias_aptos")
    .select("hora_voto, presenca_em, cpf")
    .eq("emp_proprietaria_id", emp)
    .or(filtroAptos(escopo))
    .eq("email_corporativo", alvo)
  if (!aptos || aptos.length === 0) return null
  // Voto único: presença na urna também conta (assembleia híbrida). Com o CPF
  // informado no primeiro acesso, outro registro da MESMA pessoa (vindo pelo
  // CPF) também conta — senão ela votaria pelas duas portas.
  const cpfs = [...new Set(aptos.map((a) => a.cpf).filter((c): c is string => Boolean(c)))]
  const { data: pelosCpfs } = cpfs.length
    ? await admin
        .from("voto_assembleias_aptos")
        .select("hora_voto, presenca_em")
        .eq("emp_proprietaria_id", emp)
        .or(filtroAptos(escopo))
        .in("cpf", cpfs)
    : { data: [] as { hora_voto: string | null; presenca_em: string | null }[] }
  const jaVotou = [...aptos, ...(pelosCpfs ?? [])].some(
    (a) => Boolean(a.hora_voto) || Boolean(a.presenca_em)
  )

  const { data: aBruta } = await admin
    .from("voto_assembleias")
    .select(
      "id, nome_assembleia, online, urnas_de_votacao, somente_filiados, data_inicio, data_termino, periodo_inicio, periodo_termino, apuracao_encerrada, empresa_id, rod_assembleia_id, campanha_id" +
        (await colunasHorario()) +
        (await colunasSala())
    )
    .eq("id", assembleiaId)
    .eq("emp_proprietaria_id", emp)
    .maybeSingle()
  const a = aBruta as unknown as Record<string, unknown> | null
  if (!a) return null
  // Este caminho é o do eleitor identificado só por E-MAIL — quem não é
  // filiado. Pleito interno não é dele, mesmo que o e-mail esteja na lista de
  // aptos herdada do empregador.
  if (a.somente_filiados === true) return null

  let rod: Record<string, unknown> | null = null
  if (txt(a.rod_assembleia_id)) {
    const { data } = await admin
      .from("voto_rod_assembleias")
      .select("empresa_id, campanha_id, termino, apuracao_encerrada")
      .eq("id", a.rod_assembleia_id)
      .maybeSingle()
    rod = data
  }
  const apuracaoEncerrada = a.apuracao_encerrada === true || rod?.apuracao_encerrada === true
  const fonte = {
    data_inicio: txt(a.data_inicio) ?? txt(a.periodo_inicio),
    hora_inicio: txt(a.hora_inicio),
    data_termino: txt(a.data_termino) ?? txt(a.periodo_termino),
    hora_termino: txt(a.hora_termino),
  }
  const terminoRodada = txt(rod?.termino)
  if (apuracaoEncerrada) return null
  // Antes da abertura a assembleia continua visível (a tela diz quando abre);
  // depois do término, não.
  if (situacaoDaAssembleia(fonte, terminoRodada) === "encerrada") return null
  const termino = fimDaJanelaISO(fonte, terminoRodada)

  const empId = txt(a.empresa_id) ?? txt(rod?.empresa_id)
  const campId = txt(a.campanha_id) ?? txt(rod?.campanha_id)
  const [empRes, campRes] = await Promise.all([
    empId ? admin.from("empresa").select("nome_fantasia, nome_razao").eq("id", empId).maybeSingle() : Promise.resolve({ data: null }),
    campId ? admin.from("voto_campanha").select("tema").eq("id", campId).maybeSingle() : Promise.resolve({ data: null }),
  ])

  return {
    assembleiaId: String(a.id),
    rodadaId: txt(a.rod_assembleia_id),
    campanhaId: campId,
    nome: txt(a.nome_assembleia),
    tema: txt(campRes.data?.tema),
    empregador: empRes.data ? txt(empRes.data.nome_fantasia) ?? txt(empRes.data.nome_razao) : null,
    modalidade: derivarModalidade(a),
    // Híbrida também (online + urna); o voto único já conta presenca_em acima.
    online: temVotoOnline(derivarModalidade(a)),
    inicio: txt(a.data_inicio) ?? txt(a.periodo_inicio),
    horaInicio: horaCurta(txt(a.hora_inicio)),
    termino,
    sala: salaDaLinha(a),
    abreEm: abreEmISO(fonte),
    apuracaoEncerrada,
    jaVotou,
    somenteFiliados: false,
    carencia: null,
  }
}

/** Registra o voto SECRETO de um eleitor identificado por e-mail (não-filiado). */
export async function registrarVotoEleitorEmail(
  email: string,
  assembleiaId: string,
  escolhas: { perguntaId: string; opcaoId: string }[],
  /** Quem se cadastrou pelo link único recebe o comprovante no e-mail confirmado. */
  emailComprovante?: string | null,
  /** Por onde entrou: o código na página da votação (padrão) ou o link. */
  canal: CanalAcesso = "codigo_email"
): Promise<VotoRegistrado> {
  const admin = await createAdminClient()
  const emp = await tenantAtual()
  const alvo = email.trim().toLowerCase()

  const eleg = await elegibilidadeEleitorEmail(alvo, assembleiaId)
  if (!eleg) return { erro: "Você não está apto a votar nesta assembleia." }
  // `online` inclui a híbrida (temVotoOnline): só urna/reunião param aqui.
  if (!eleg.online) {
    return { erro: "Esta assembleia é só presencial — não há voto pela internet." }
  }
  if (eleg.jaVotou) return { erro: "Você já votou nesta assembleia." }
  if (eleg.abreEm) return { erro: "A votação desta assembleia ainda não começou." }

  const perguntas = await perguntasDaAssembleia(assembleiaId)
  if (perguntas.length === 0) return { erro: "A cédula ainda não tem perguntas." }
  const escolhaPorPergunta = new Map(escolhas.map((e) => [e.perguntaId, e.opcaoId]))
  for (const p of perguntas) {
    const opc = escolhaPorPergunta.get(p.id)
    if (!opc || !p.opcoes.some((o) => o.id === opc)) {
      return { erro: "Responda todas as perguntas para confirmar o voto." }
    }
  }

  const agora = new Date().toISOString()

  // 1) RESERVA a participação pelo e-mail E pelo CPF informado no primeiro
  //    acesso: se a mesma pessoa também está na lista pelo CPF, esse outro
  //    registro fica votado junto e ela não vota de novo pela área do
  //    filiado. Reservar ANTES de gravar o voto fecha o voto duplo por envios
  //    simultâneos (achado S4): o segundo envio encontra 0 linhas.
  const escopo = await escopoAptos(assembleiaId)
  const { data: meus } = await admin
    .from("voto_assembleias_aptos")
    .select("cpf, nome_completo")
    .eq("emp_proprietaria_id", emp)
    .or(filtroAptos(escopo))
    .eq("email_corporativo", alvo)
  const cpfs = [...new Set((meus ?? []).map((m) => m.cpf).filter((c): c is string => Boolean(c)))]
  const filtros = [`email_corporativo.eq.${alvo}`, ...cpfs.map((c) => `cpf.eq.${c}`)]
  const reservados = await reservarParticipacao(admin, emp, filtroAptos(escopo, filtros), agora)
  if (reservados.length === 0) {
    return { erro: "Você já votou nesta assembleia." }
  }

  // 2) o voto SECRETO, com a hora truncada (ver horaDoVotoSecreto).
  const linhas = perguntas.map((p) => ({
    emp_proprietaria_id: emp,
    assembleia_id: assembleiaId,
    rod_assembleia_id: eleg.rodadaId,
    pergunta_id: p.id,
    resposta_id: escolhaPorPergunta.get(p.id) as string,
    valido: true,
    eleitor_id: null,
    created_at: horaDoVotoSecreto(agora),
  }))
  const { error: erroVoto } = await admin.from("voto_online").insert(linhas)
  if (erroVoto) {
    await admin
      .from("voto_assembleias_aptos")
      .update({ hora_voto: null })
      .in("id", reservados)
    return { erro: `Não foi possível registrar o voto: ${erroVoto.message}` }
  }

  await marcarCanal(admin, emp, reservados, canal)

  const comprovante = await comprovarVoto({
    filtroOu: filtroAptos(escopo, filtros),
    assembleiaId,
    quando: agora,
    email: emailComprovante ?? alvo,
    nome: (meus?.[0] as { nome_completo?: string | null } | undefined)?.nome_completo ?? null,
  })
  return { ok: true, comprovante }
}

/**
 * Emite o comprovante nos aptos que acabaram de ser marcados e manda o e-mail
 * de confirmação. Nunca lança: comprovante é um extra do voto, que já está
 * gravado quando esta função roda. Devolve o comprovante para a tela mostrar
 * na hora; nulo quando ele não saiu (aptos não achados, SQL ausente, falha).
 */
async function comprovarVoto(dados: {
  filtroOu: string
  assembleiaId: string
  quando: string
  email: string | null
  nome: string | null
}): Promise<ComprovanteEmitido | null> {
  let emitido: ComprovanteEmitido | null = null
  try {
    const { aptosVotantes, emitirComprovante, enviarEmailComprovante } = await import(
      "@/lib/db/voto-comprovante"
    )
    const aptoIds = await aptosVotantes(dados.filtroOu, dados.quando)
    if (aptoIds.length === 0) return null
    const comprovante = await emitirComprovante({
      aptoIds,
      assembleiaId: dados.assembleiaId,
      canal: "online",
      quando: dados.quando,
    })
    if (!comprovante) return null
    emitido = { codigo: comprovante.codigo, quando: comprovante.quando, canal: "online", emailPara: null }
    if (!dados.email) return emitido
    const enviado = await enviarEmailComprovante({
      aptoIds,
      assembleiaId: dados.assembleiaId,
      comprovante,
      canal: "online",
      email: dados.email,
      nome: dados.nome,
    })
    // Só promete o e-mail na tela quando ele saiu de fato.
    if (enviado) emitido.emailPara = dados.email
    return emitido
  } catch {
    // e-mail/coluna indisponível não invalida o voto
    return emitido
  }
}

// ── Datas da rodada (assembleia presencial — "confira as datas") ───────────

export type DatasDaRodada = {
  rodadaId: string
  nome: string | null
  tema: string | null
  empregador: string | null
  inicio: string | null
  termino: string | null
  assembleias: {
    id: string
    nome: string | null
    descricao: string | null
    modalidade: Modalidade
    dataInicio: string | null
    dataRealizacao: string | null
    dataTermino: string | null
    /** 'HH:MM' — a janela vale para as duas modalidades (A48). */
    horaInicio: string | null
    horaTermino: string | null
    sala: SalaVirtual | null
    /** Urnas presenciais ativas: o mais perto de "onde votar" que os dados têm. */
    urnas: { nome: string; abertura: string | null; fechamento: string | null }[]
  }[]
}

/**
 * Datas de todas as assembleias de uma rodada, para o filiado apto consultar
 * (o "confira as datas" do aviso presencial). Só mostra se o filiado estiver
 * apto na rodada (por CPF ou e-mail verificado).
 */
export async function datasDaRodada(
  cpf: string,
  rodadaId: string
): Promise<DatasDaRodada | null> {
  const admin = await createAdminClient()
  const emp = await tenantAtual()
  const emailVot = await obterEmailVotacao(cpf)

  const filtros = [`cpf.eq.${cpf}`]
  if (emailVot.email) filtros.push(`email_corporativo.eq.${emailVot.email}`)
  const { data: apto } = await admin
    .from("voto_assembleias_aptos")
    .select("id")
    .eq("emp_proprietaria_id", emp)
    .eq("rod_assembleia_id", rodadaId)
    .or(filtros.join(","))
    .limit(1)
    .maybeSingle()
  if (!apto) return null

  const { data: rod } = await admin
    .from("voto_rod_assembleias")
    .select("id, nome_assembleia, empresa_id, campanha_id, inicio, termino")
    .eq("id", rodadaId)
    .eq("emp_proprietaria_id", emp)
    .maybeSingle()
  if (!rod) return null

  // Empregador: o da rodada ou, sem ele, as fontes da campanha (o painel
  // guarda o empregador na campanha desde 09/2026).
  const campanhaId = txt(rod.campanha_id)
  const fontes = txt(rod.empresa_id)
    ? [String(rod.empresa_id)]
    : campanhaId
      ? ((await fontesDasCampanhas([campanhaId])).get(campanhaId) ?? [])
      : []
  const [nomeEmpresa, campRes, assRes] = await Promise.all([
    nomesDasEmpresas(fontes),
    campanhaId
      ? admin.from("voto_campanha").select("tema").eq("id", campanhaId).maybeSingle()
      : Promise.resolve({ data: null }),
    admin
      .from("voto_assembleias")
      .select(
        "id, nome_assembleia, descricao, online, urnas_de_votacao, data_inicio, data_realizacao, data_termino" +
          (await colunasHorario()) +
          (await colunasSala())
      )
      .eq("emp_proprietaria_id", emp)
      .eq("rod_assembleia_id", rodadaId)
      .order("data_inicio", { ascending: true, nullsFirst: false }),
  ])
  const assembleias = (assRes.data ?? []) as unknown as Record<string, unknown>[]

  // Urnas: tabela de supabase/votacao-mesarios.sql — sem ela, nenhuma.
  const urnasPor = new Map<string, DatasDaRodada["assembleias"][number]["urnas"]>()
  if (assembleias.length) {
    const { data: urnas, error } = await admin
      .from("voto_urnas")
      .select("assembleia_id, nome, abertura, fechamento, ativa")
      .eq("emp_proprietaria_id", emp)
      .in(
        "assembleia_id",
        assembleias.map((a) => String(a.id))
      )
      .order("abertura", { ascending: true, nullsFirst: false })
    for (const u of error ? [] : (urnas ?? [])) {
      const nome = txt(u.nome)
      if (u.ativa === false || !nome) continue
      const arr = urnasPor.get(String(u.assembleia_id)) ?? []
      arr.push({ nome, abertura: txt(u.abertura), fechamento: txt(u.fechamento) })
      urnasPor.set(String(u.assembleia_id), arr)
    }
  }

  return {
    rodadaId: String(rod.id),
    nome: txt(rod.nome_assembleia),
    tema: txt(campRes.data?.tema),
    empregador:
      fontes
        .map((f) => nomeEmpresa.get(f))
        .filter(Boolean)
        .join(" / ") || null,
    inicio: txt(rod.inicio),
    termino: txt(rod.termino),
    assembleias: assembleias.map((a) => ({
      id: String(a.id),
      nome: txt(a.nome_assembleia),
      descricao: txt(a.descricao),
      modalidade: derivarModalidade(a),
      dataInicio: txt(a.data_inicio),
      dataRealizacao: txt(a.data_realizacao),
      dataTermino: txt(a.data_termino),
      horaInicio: horaCurta(txt(a.hora_inicio)),
      horaTermino: horaCurta(txt(a.hora_termino)),
      sala: salaDaLinha(a),
      urnas: urnasPor.get(String(a.id)) ?? [],
    })),
  }
}

// ── Urna presencial (mesário registra o voto individual de cada apto) ──────
//
// Urna com mesário grava voto individual em voto_online (mesario_id = operador;
// eleitor_id NULO = secreto — o conteúdo não é ligado ao eleitor). A
// participação fica no apto (hora_voto), impedindo voto duplo.

export type AptoUrna = {
  id: string
  nome: string | null
  cpf: string | null
  matricula: string | null
  jaVotou: boolean
}
export type DadosUrna = {
  assembleiaId: string
  nome: string | null
  empregador: string | null
  aberta: boolean
  totalAptos: number
  votaram: number
  aptos: AptoUrna[]
  perguntas: PerguntaVoto[]
}

async function assembleiaUrnaAberta(
  assembleiaId: string
): Promise<{ ok: boolean; rodadaId: string | null; nome: string | null; empresaId: string | null }> {
  const admin = await createAdminClient()
  const emp = await tenantAtual()
  const { data: a } = await admin
    .from("voto_assembleias")
    .select(
      "id, nome_assembleia, online, urnas_de_votacao, apuracao_encerrada, data_termino, periodo_termino, rod_assembleia_id, empresa_id"
    )
    .eq("id", assembleiaId)
    .eq("emp_proprietaria_id", emp)
    .maybeSingle()
  if (!a) return { ok: false, rodadaId: null, nome: null, empresaId: null }
  const modalidade = derivarModalidade(a)
  const termino = txt(a.data_termino) ?? txt(a.periodo_termino)
  const aberta =
    modalidade === "urna" &&
    a.apuracao_encerrada !== true &&
    !(termino && new Date(termino).getTime() < Date.now())
  return {
    ok: aberta,
    rodadaId: txt(a.rod_assembleia_id),
    nome: txt(a.nome_assembleia),
    empresaId: txt(a.empresa_id),
  }
}

/** Dados da estação de urna: aptos (buscáveis) + a cédula. Só p/ urna aberta. */
export async function dadosUrna(
  assembleiaId: string,
  busca = ""
): Promise<DadosUrna | null> {
  const admin = await createAdminClient()
  const emp = await tenantAtual()
  const info = await assembleiaUrnaAberta(assembleiaId)

  const { data: a } = await admin
    .from("voto_assembleias")
    .select("id, nome_assembleia, urnas_de_votacao, online, empresa_id")
    .eq("id", assembleiaId)
    .eq("emp_proprietaria_id", emp)
    .maybeSingle()
  if (!a || derivarModalidade(a) !== "urna") return null

  const escopo = await escopoAptos(assembleiaId)
  const termo = busca.trim()
  const escapado = termo.replace(/[%_,()]/g, " ")
  const q = admin
    .from("voto_assembleias_aptos")
    .select("id, nome_completo, cpf, matricula, hora_voto")
    .eq("emp_proprietaria_id", emp)
    .or(
      filtroAptos(
        escopo,
        termo
          ? [
              `nome_completo.ilike.%${escapado}%`,
              `cpf.ilike.%${escapado}%`,
              `matricula.ilike.%${escapado}%`,
            ]
          : []
      )
    )
    .order("nome_completo", { ascending: true })
    .limit(50)
  // Totais por contagem no banco: ler as linhas parava em 1.000 (teto do
  // PostgREST) e a rodada pode ter dezenas de milhares de aptos.
  const [{ data: aptos }, total, votantes, perguntas, empRes] = await Promise.all([
    q,
    admin
      .from("voto_assembleias_aptos")
      .select("id", { count: "exact", head: true })
      .eq("emp_proprietaria_id", emp)
      .or(filtroAptos(escopo)),
    admin
      .from("voto_assembleias_aptos")
      .select("id", { count: "exact", head: true })
      .eq("emp_proprietaria_id", emp)
      .or(filtroAptos(escopo))
      .not("hora_voto", "is", null),
    perguntasDaAssembleia(assembleiaId),
    txt(a.empresa_id)
      ? admin.from("empresa").select("nome_fantasia, nome_razao").eq("id", a.empresa_id).maybeSingle()
      : Promise.resolve({ data: null }),
  ])
  return {
    assembleiaId,
    nome: txt(a.nome_assembleia),
    empregador: empRes.data
      ? txt(empRes.data.nome_fantasia) ?? txt(empRes.data.nome_razao)
      : null,
    aberta: info.ok,
    totalAptos: total.count ?? 0,
    votaram: votantes.count ?? 0,
    aptos: (aptos ?? []).map((x) => ({
      id: String(x.id),
      nome: txt(x.nome_completo),
      cpf: txt(x.cpf),
      matricula: txt(x.matricula),
      jaVotou: Boolean(x.hora_voto),
    })),
    perguntas,
  }
}

/** Um apto específico da urna (para a cédula individual). */
export async function aptoUrna(
  assembleiaId: string,
  aptoId: string
): Promise<{ nome: string | null; cpf: string | null; jaVotou: boolean } | null> {
  const admin = await createAdminClient()
  const { data } = await admin
    .from("voto_assembleias_aptos")
    .select("nome_completo, cpf, hora_voto")
    .eq("id", aptoId)
    .eq("emp_proprietaria_id", await tenantAtual())
    .or(filtroAptos(await escopoAptos(assembleiaId)))
    .maybeSingle()
  if (!data) return null
  return {
    nome: txt(data.nome_completo),
    cpf: txt(data.cpf),
    jaVotou: Boolean(data.hora_voto),
  }
}

/**
 * Registra o voto de um apto na urna (secreto), pelo mesário. O conteúdo do
 * voto nunca é ligado ao eleitor (eleitor_id null); a participação fica no
 * apto (hora_voto). `mesario_id` não é gravado (nulo, como o legado — a FK
 * do banco não referencia o usuário do painel).
 */
export async function registrarVotoUrna(
  assembleiaId: string,
  aptoId: string,
  escolhas: { perguntaId: string; opcaoId: string }[]
): Promise<{ erro?: string; ok?: boolean }> {
  const admin = await createAdminClient()
  const emp = await tenantAtual()

  const info = await assembleiaUrnaAberta(assembleiaId)
  if (!info.ok) return { erro: "Urna fechada ou assembleia não é de urna." }

  const { data: apto } = await admin
    .from("voto_assembleias_aptos")
    .select("id, cpf, hora_voto")
    .eq("id", aptoId)
    .eq("emp_proprietaria_id", emp)
    .or(filtroAptos(await escopoAptos(assembleiaId)))
    .maybeSingle()
  if (!apto) return { erro: "Eleitor não encontrado na lista de aptos." }
  if (apto.hora_voto) return { erro: "Este eleitor já votou." }

  const perguntas = await perguntasDaAssembleia(assembleiaId)
  if (perguntas.length === 0) return { erro: "A cédula ainda não tem perguntas." }
  const escolhaPorPergunta = new Map(
    escolhas.map((e) => [e.perguntaId, e.opcaoId])
  )
  for (const p of perguntas) {
    const opc = escolhaPorPergunta.get(p.id)
    if (!opc || !p.opcoes.some((o) => o.id === opc)) {
      return { erro: "Responda todas as perguntas para confirmar o voto." }
    }
  }

  const agora = new Date().toISOString()
  // Reserva a participação ANTES de gravar o voto (só vira se hora_voto for
  // nula): dois envios simultâneos não contam dois votos — achado S4.
  const { data: reservado } = await admin
    .from("voto_assembleias_aptos")
    .update({ hora_voto: agora })
    .eq("id", aptoId)
    .eq("emp_proprietaria_id", emp)
    .is("hora_voto", null)
    .select("id")
  if (!reservado || reservado.length === 0) return { erro: "Este eleitor já votou." }

  const linhas = perguntas.map((p) => ({
    emp_proprietaria_id: emp,
    assembleia_id: assembleiaId,
    rod_assembleia_id: info.rodadaId,
    pergunta_id: p.id,
    resposta_id: escolhaPorPergunta.get(p.id) as string,
    valido: true,
    eleitor_id: null,
    // Hora truncada: a exata fica só na participação (ver horaDoVotoSecreto).
    created_at: horaDoVotoSecreto(agora),
  }))
  const { error: erroVoto } = await admin.from("voto_online").insert(linhas)
  if (erroVoto) {
    await admin
      .from("voto_assembleias_aptos")
      .update({ hora_voto: null })
      .eq("id", aptoId)
      .eq("emp_proprietaria_id", emp)
    return { erro: `Não foi possível registrar o voto: ${erroVoto.message}` }
  }

  // Apontamento genérico no prontuário quando o apto é um filiado (por CPF).
  if (apto.cpf) {
    const { buscarFiliadoPorCpf } = await import("@/lib/contas")
    const filiado = await buscarFiliadoPorCpf(String(apto.cpf))
    if (filiado?.filiacaoId) {
      const nomeAss = info.nome ? ` "${info.nome}"` : ""
      await admin.from("filiacao_prontuario").insert({
        filiacao_id: filiado.filiacaoId,
        data: agora,
        tipo: "Assembleia",
        descricao: `Votou na urna da assembleia${nomeAss}.`,
        diretor_funcionario_id: null,
        emp_proprietaria_id: emp,
        created_at: agora,
        modified_at: agora,
      })
    }
  }
  return { ok: true }
}

/** Existe apto por e-mail nesta assembleia? (para o fluxo público de OTP). */
export async function existeAptoPorEmail(
  email: string,
  assembleiaId: string
): Promise<boolean> {
  const admin = await createAdminClient()
  const { data } = await admin
    .from("voto_assembleias_aptos")
    .select("id")
    .eq("emp_proprietaria_id", await tenantAtual())
    .or(filtroAptos(await escopoAptos(assembleiaId)))
    .eq("email_corporativo", email.trim().toLowerCase())
    .limit(1)
    .maybeSingle()
  return Boolean(data)
}

// ── Voto pelo LINK PESSOAL do e-mail (sem código) ──────────────────────────

/** O apto do link, conferindo que ele pertence mesmo a esta assembleia. */
async function aptoNoEscopo(
  aptoId: string,
  assembleiaId: string
): Promise<{
  id: string
  cpf: string | null
  email: string | null
  nome: string | null
  /** E-mail confirmado no link único (recebe o comprovante). */
  emailContato: string | null
  /** Telegram confirmado no link único (recebe o comprovante por lá). */
  telegramChatId: string | null
} | null> {
  const admin = await createAdminClient()
  const consulta = async (colunas: string) =>
    admin
      .from("voto_assembleias_aptos")
      .select(colunas)
      .eq("emp_proprietaria_id", await tenantAtual())
      .eq("id", aptoId)
      .or(filtroAptos(await escopoAptos(assembleiaId)))
      .maybeSingle()
  // email_contato só existe depois de supabase/votacao-link-unico.sql.
  const completo = await consulta("id, cpf, email_corporativo, nome_completo, email_contato, telegram_chat_id")
  const { data } = completo.error ? await consulta("id, cpf, email_corporativo, nome_completo") : completo
  const linha = data as Record<string, unknown> | null
  if (!linha) return null
  return {
    id: String(linha.id),
    cpf: txt(linha.cpf),
    email: txt(linha.email_corporativo),
    nome: txt(linha.nome_completo),
    emailContato: txt(linha.email_contato),
    telegramChatId: txt(linha.telegram_chat_id),
  }
}

/** Elegibilidade de quem entrou pelo link pessoal. */
export async function elegibilidadePorLink(
  aptoId: string,
  assembleiaId: string
): Promise<AssembleiaDoFiliado | null> {
  const apto = await aptoNoEscopo(aptoId, assembleiaId)
  if (!apto) return null
  if (apto.email) return elegibilidadeEleitorEmail(apto.email, assembleiaId)
  if (apto.cpf) return elegibilidadeParaVotar(apto.cpf, assembleiaId)
  return null
}

/**
 * Registra o voto de quem entrou pelo link. A identidade vem do COOKIE
 * assinado (apto), nunca de campo do formulário; daí em diante vale o mesmo
 * caminho de sempre — o voto continua secreto e a trava de voto único é a do
 * apto.
 */
export async function registrarVotoPorLink(
  aptoId: string,
  assembleiaId: string,
  escolhas: { perguntaId: string; opcaoId: string }[],
  /** Link pessoal (padrão) ou o link geral, por e-mail pessoal ou Telegram. */
  canal: CanalAcesso = "link_pessoal"
): Promise<{ erro?: string; ok?: boolean }> {
  const apto = await aptoNoEscopo(aptoId, assembleiaId)
  if (!apto) return { erro: "Este link não vale para esta assembleia." }
  const r = apto.email
    ? await registrarVotoEleitorEmail(apto.email, assembleiaId, escolhas, apto.emailContato, canal)
    : apto.cpf
      ? await registrarVotoFiliado(apto.cpf, assembleiaId, escolhas, canal)
      : { erro: "Cadastro de eleitor sem e-mail nem CPF — procure o sindicato." }
  // Quem se identificou pelo Telegram recebe o comprovante por lá também.
  if (r.ok && apto.telegramChatId) await comprovantePorTelegram(apto.id, apto.telegramChatId, assembleiaId)
  return r
}

/** Manda o código do comprovante pelo Telegram (melhor esforço). */
async function comprovantePorTelegram(aptoId: string, chatId: string, assembleiaId: string): Promise<void> {
  try {
    const admin = await createAdminClient()
    const [{ data: apto }, { data: assembleia }] = await Promise.all([
      admin.from("voto_assembleias_aptos").select("comprovante_codigo").eq("id", aptoId).maybeSingle(),
      admin.from("voto_assembleias").select("nome_assembleia").eq("id", assembleiaId).maybeSingle(),
    ])
    const codigo = txt(apto?.comprovante_codigo)
    const { enviarTelegram } = await import("@/lib/telegram")
    const { origemAtual } = await import("@/lib/tenant-url")
    const origem = await origemAtual().catch(() => "")
    await enviarTelegram({
      chatId,
      texto:
        `✅ Voto registrado${assembleia?.nome_assembleia ? ` — <b>${String(assembleia.nome_assembleia)}</b>` : ""}.` +
        (codigo ? `\nComprovante: <b>${codigo}</b>${origem ? `\n${origem}/comprovante/${codigo}` : ""}` : "") +
        "\n\nO voto é secreto: fica registrado que você votou, nunca em quem votou.",
    })
  } catch {
    // comprovante é extra: o voto já está gravado
  }
}
