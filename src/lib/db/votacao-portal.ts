import "server-only"
import { createHash, randomInt, randomUUID } from "node:crypto"

import { derivarModalidade, type Modalidade } from "@/lib/assembleias-constantes"
import { enviarEmail } from "@/lib/email"
import { createAdminClient } from "@/lib/supabase/admin"
import { tenantAtual } from "@/lib/tenant"

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

const CODIGO_VALIDADE_MIN = 15

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
    .select("pend_email, pend_codigo_hash, pend_codigo_token, pend_expira_em")
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
  if (hashCodigo(codigo, data.pend_codigo_token) !== data.pend_codigo_hash) {
    return { erro: "Código inválido." }
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
  online: boolean
  inicio: string | null
  /** Fim da assembleia — base da contagem regressiva (online). */
  termino: string | null
  apuracaoEncerrada: boolean
  /** Já votou? (apto.hora_voto preenchido) */
  jaVotou: boolean
}

function txt(v: unknown): string | null {
  return typeof v === "string" && v.trim() ? v : null
}

/** fonte_pagadora_id dos empregadores ATIVOS do CPF (sem desfiliação/demissão). */
async function empregadoresAtivos(cpf: string): Promise<Set<string>> {
  const admin = await createAdminClient()
  const emp = await tenantAtual()
  const { data: filiacoes } = await admin
    .from("filiacoes")
    .select("id")
    .eq("cpf", cpf)
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
 * verificado) e cujo empregador está ativo no vínculo dele.
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
    .not("assembleia_id", "is", null)
  if (!aptos || aptos.length === 0) return []

  // Voto único: presença registrada na urna (mesmo antes do voto digital cair)
  // já conta como participação — impede votar online numa assembleia híbrida.
  const votouPorAssembleia = new Map<string, boolean>()
  for (const a of aptos) {
    const aid = String(a.assembleia_id)
    votouPorAssembleia.set(
      aid,
      votouPorAssembleia.get(aid) ||
        Boolean(a.hora_voto) ||
        Boolean(a.presenca_em)
    )
  }
  const assembleiaIds = [...votouPorAssembleia.keys()]

  const { data: assembleias } = await admin
    .from("voto_assembleias")
    .select(
      "id, nome_assembleia, online, urnas_de_votacao, data_inicio, data_termino, periodo_inicio, periodo_termino, apuracao_encerrada, empresa_id, rod_assembleia_id, campanha_id"
    )
    .eq("emp_proprietaria_id", emp)
    .in("id", assembleiaIds)
  if (!assembleias || assembleias.length === 0) return []

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

  const empresaIds = new Set<string>()
  const campanhaIds = new Set<string>()
  for (const a of assembleias) {
    const rod = a.rod_assembleia_id ? rodadas.get(String(a.rod_assembleia_id)) : null
    const empId = txt(a.empresa_id) ?? txt(rod?.empresa_id)
    const campId = txt(a.campanha_id) ?? txt(rod?.campanha_id)
    if (empId) empresaIds.add(empId)
    if (campId) campanhaIds.add(campId)
  }
  const [empresasRes, campanhasRes] = await Promise.all([
    empresaIds.size
      ? admin.from("empresa").select("id, nome_fantasia, nome_razao").in("id", [...empresaIds])
      : Promise.resolve({ data: [] }),
    campanhaIds.size
      ? admin.from("voto_campanha").select("id, tema").in("id", [...campanhaIds])
      : Promise.resolve({ data: [] }),
  ])
  const nomeEmpresa = new Map(
    (empresasRes.data ?? []).map((e) => [
      String(e.id),
      txt(e.nome_fantasia) ?? txt(e.nome_razao) ?? "(sem nome)",
    ])
  )
  const temaCampanha = new Map(
    (campanhasRes.data ?? []).map((c) => [String(c.id), txt(c.tema)])
  )

  const agora = Date.now()
  const saida: AssembleiaDoFiliado[] = []
  for (const a of assembleias) {
    const rod = a.rod_assembleia_id ? rodadas.get(String(a.rod_assembleia_id)) : null
    const empId = txt(a.empresa_id) ?? txt(rod?.empresa_id)
    // Empregador precisa estar ATIVO no vínculo do filiado.
    if (!empId || !ativos.has(empId)) continue

    const apuracaoEncerrada =
      a.apuracao_encerrada === true || rod?.apuracao_encerrada === true
    const modalidade = derivarModalidade(a)
    const online = modalidade === "online"
    const inicio = txt(a.data_inicio) ?? txt(a.periodo_inicio)
    const termino = txt(a.data_termino) ?? txt(a.periodo_termino) ?? txt(rod?.termino)

    // Só interessa o que ainda está em andamento: não encerrado e, quando há
    // fim, que o fim não tenha passado.
    if (apuracaoEncerrada) continue
    if (termino && new Date(termino).getTime() < agora) continue

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
      termino,
      apuracaoEncerrada,
      jaVotou: votouPorAssembleia.get(String(a.id)) ?? false,
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
 * Registra o voto do filiado de forma SECRETA: grava as respostas sem ligar
 * ao eleitor, marca a participação no apto (hora_voto) para impedir voto
 * duplo, e lança um apontamento GENÉRICO no prontuário.
 */
export async function registrarVotoFiliado(
  cpf: string,
  assembleiaId: string,
  escolhas: { perguntaId: string; opcaoId: string }[]
): Promise<{ erro?: string; ok?: boolean }> {
  const admin = await createAdminClient()
  const emp = await tenantAtual()

  const { buscarFiliadoPorCpf } = await import("@/lib/contas")
  const filiado = await buscarFiliadoPorCpf(cpf)
  if (!filiado?.ativo) {
    return { erro: "A votação pela área do filiado é para filiações ativas." }
  }

  const eleg = await elegibilidadeParaVotar(cpf, assembleiaId)
  if (!eleg) return { erro: "Você não está apto a votar nesta assembleia." }
  if (!eleg.online) return { erro: "Esta assembleia não é de votação online." }
  if (eleg.jaVotou) return { erro: "Você já votou nesta assembleia." }

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

  // 1) grava o voto SECRETO (sem eleitor_id) em voto_online — a tabela que a
  //    apuração do painel conta. Uma linha por pergunta.
  const linhas = perguntas.map((p) => ({
    emp_proprietaria_id: emp,
    assembleia_id: assembleiaId,
    rod_assembleia_id: eleg.rodadaId,
    pergunta_id: p.id,
    resposta_id: escolhaPorPergunta.get(p.id) as string,
    valido: true,
    eleitor_id: null,
    created_at: agora,
  }))
  const { error: erroVoto } = await admin.from("voto_online").insert(linhas)
  if (erroVoto) {
    return { erro: `Não foi possível registrar o voto: ${erroVoto.message}` }
  }

  // 2) marca a PARTICIPAÇÃO no apto (impede voto duplo) — por cpf ou e-mail.
  const filtros = [`cpf.eq.${cpf}`]
  if (emailVot.email) filtros.push(`email_corporativo.eq.${emailVot.email}`)
  await admin
    .from("voto_assembleias_aptos")
    .update({ hora_voto: agora })
    .eq("emp_proprietaria_id", emp)
    .eq("assembleia_id", assembleiaId)
    .or(filtros.join(","))
    .is("hora_voto", null)

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
  return { ok: true }
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
}

/** Votações em que o filiado PARTICIPOU (apto com hora_voto), sem o voto. */
export async function minhasVotacoes(cpf: string): Promise<MinhaVotacao[]> {
  const admin = await createAdminClient()
  const emp = await tenantAtual()
  const emailVot = await obterEmailVotacao(cpf)

  const filtros = [`cpf.eq.${cpf}`]
  if (emailVot.email) filtros.push(`email_corporativo.eq.${emailVot.email}`)
  const { data: aptos } = await admin
    .from("voto_assembleias_aptos")
    .select("assembleia_id, hora_voto, presenca_urna_id")
    .eq("emp_proprietaria_id", emp)
    .or(filtros.join(","))
    .not("hora_voto", "is", null)
    .not("assembleia_id", "is", null)
  if (!aptos || aptos.length === 0) return []

  const votouEm = new Map<string, string>()
  const urnaDaAssembleia = new Map<string, string>()
  for (const a of aptos) {
    const id = String(a.assembleia_id)
    if (!votouEm.has(id)) votouEm.set(id, String(a.hora_voto))
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
      "id, nome_assembleia, online, urnas_de_votacao, apuracao_encerrada, empresa_id, campanha_id"
    )
    .eq("emp_proprietaria_id", emp)
    .in("id", ids)
  if (!assembleias) return []

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

  const empresaIds = [
    ...new Set(
      assembleias.map((a) => txt(a.empresa_id)).filter(Boolean) as string[]
    ),
  ]
  const campanhaIds = [
    ...new Set(
      assembleias.map((a) => txt(a.campanha_id)).filter(Boolean) as string[]
    ),
  ]
  const [empresasRes, campanhasRes] = await Promise.all([
    empresaIds.length
      ? admin.from("empresa").select("id, nome_fantasia, nome_razao").in("id", empresaIds)
      : Promise.resolve({ data: [] }),
    campanhaIds.length
      ? admin.from("voto_campanha").select("id, tema").in("id", campanhaIds)
      : Promise.resolve({ data: [] }),
  ])
  const nomeEmpresa = new Map(
    (empresasRes.data ?? []).map((e) => [
      String(e.id),
      txt(e.nome_fantasia) ?? txt(e.nome_razao),
    ])
  )
  const temaCampanha = new Map(
    (campanhasRes.data ?? []).map((c) => [String(c.id), txt(c.tema)])
  )

  return assembleias
    .map((a) => {
      const apurado = a.apuracao_encerrada === true
      return {
        assembleiaId: String(a.id),
        nome: txt(a.nome_assembleia),
        tema: temaCampanha.get(String(txt(a.campanha_id))) ?? null,
        empregador: nomeEmpresa.get(String(txt(a.empresa_id))) ?? null,
        modalidade: derivarModalidade(a),
        quando: votouEm.get(String(a.id)) ?? null,
        urna:
          nomeUrna.get(urnaDaAssembleia.get(String(a.id)) ?? "") ?? null,
        apuracaoEncerrada: apurado,
        resultado: apurado
          ? resultadoPorAssembleia.get(String(a.id)) ?? []
          : null,
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

  const { data: aptos } = await admin
    .from("voto_assembleias_aptos")
    .select("hora_voto, presenca_em")
    .eq("emp_proprietaria_id", emp)
    .eq("assembleia_id", assembleiaId)
    .eq("email_corporativo", alvo)
  if (!aptos || aptos.length === 0) return null
  // Voto único: presença na urna também conta (assembleia híbrida).
  const jaVotou = aptos.some(
    (a) => Boolean(a.hora_voto) || Boolean(a.presenca_em)
  )

  const { data: a } = await admin
    .from("voto_assembleias")
    .select(
      "id, nome_assembleia, online, urnas_de_votacao, data_inicio, data_termino, periodo_inicio, periodo_termino, apuracao_encerrada, empresa_id, rod_assembleia_id, campanha_id"
    )
    .eq("id", assembleiaId)
    .eq("emp_proprietaria_id", emp)
    .maybeSingle()
  if (!a) return null

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
  const termino = txt(a.data_termino) ?? txt(a.periodo_termino) ?? txt(rod?.termino)
  if (apuracaoEncerrada) return null
  if (termino && new Date(termino).getTime() < Date.now()) return null

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
    online: derivarModalidade(a) === "online",
    inicio: txt(a.data_inicio) ?? txt(a.periodo_inicio),
    termino,
    apuracaoEncerrada,
    jaVotou,
  }
}

/** Registra o voto SECRETO de um eleitor identificado por e-mail (não-filiado). */
export async function registrarVotoEleitorEmail(
  email: string,
  assembleiaId: string,
  escolhas: { perguntaId: string; opcaoId: string }[]
): Promise<{ erro?: string; ok?: boolean }> {
  const admin = await createAdminClient()
  const emp = await tenantAtual()
  const alvo = email.trim().toLowerCase()

  const eleg = await elegibilidadeEleitorEmail(alvo, assembleiaId)
  if (!eleg) return { erro: "Você não está apto a votar nesta assembleia." }
  if (!eleg.online) return { erro: "Esta assembleia não é de votação online." }
  if (eleg.jaVotou) return { erro: "Você já votou nesta assembleia." }

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
  const linhas = perguntas.map((p) => ({
    emp_proprietaria_id: emp,
    assembleia_id: assembleiaId,
    rod_assembleia_id: eleg.rodadaId,
    pergunta_id: p.id,
    resposta_id: escolhaPorPergunta.get(p.id) as string,
    valido: true,
    eleitor_id: null,
    created_at: agora,
  }))
  const { error: erroVoto } = await admin.from("voto_online").insert(linhas)
  if (erroVoto) {
    return { erro: `Não foi possível registrar o voto: ${erroVoto.message}` }
  }

  await admin
    .from("voto_assembleias_aptos")
    .update({ hora_voto: agora })
    .eq("emp_proprietaria_id", emp)
    .eq("assembleia_id", assembleiaId)
    .eq("email_corporativo", alvo)
    .is("hora_voto", null)
  return { ok: true }
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

  const [empRes, campRes, assRes] = await Promise.all([
    txt(rod.empresa_id)
      ? admin.from("empresa").select("nome_fantasia, nome_razao").eq("id", rod.empresa_id).maybeSingle()
      : Promise.resolve({ data: null }),
    txt(rod.campanha_id)
      ? admin.from("voto_campanha").select("tema").eq("id", rod.campanha_id).maybeSingle()
      : Promise.resolve({ data: null }),
    admin
      .from("voto_assembleias")
      .select(
        "id, nome_assembleia, descricao, online, urnas_de_votacao, data_inicio, data_realizacao, data_termino"
      )
      .eq("emp_proprietaria_id", emp)
      .eq("rod_assembleia_id", rodadaId)
      .order("data_inicio", { ascending: true, nullsFirst: false }),
  ])

  return {
    rodadaId: String(rod.id),
    nome: txt(rod.nome_assembleia),
    tema: txt(campRes.data?.tema),
    empregador: empRes.data
      ? txt(empRes.data.nome_fantasia) ?? txt(empRes.data.nome_razao)
      : null,
    inicio: txt(rod.inicio),
    termino: txt(rod.termino),
    assembleias: (assRes.data ?? []).map((a) => ({
      id: String(a.id),
      nome: txt(a.nome_assembleia),
      descricao: txt(a.descricao),
      modalidade: derivarModalidade(a),
      dataInicio: txt(a.data_inicio),
      dataRealizacao: txt(a.data_realizacao),
      dataTermino: txt(a.data_termino),
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

  let q = admin
    .from("voto_assembleias_aptos")
    .select("id, nome_completo, cpf, matricula, hora_voto")
    .eq("emp_proprietaria_id", emp)
    .eq("assembleia_id", assembleiaId)
    .order("nome_completo", { ascending: true })
    .limit(50)
  const termo = busca.trim()
  if (termo) {
    const escapado = termo.replace(/[%_,()]/g, " ")
    q = q.or(
      `nome_completo.ilike.%${escapado}%,cpf.ilike.%${escapado}%,matricula.ilike.%${escapado}%`
    )
  }
  const [{ data: aptos }, contagem, perguntas, empRes] = await Promise.all([
    q,
    admin
      .from("voto_assembleias_aptos")
      .select("hora_voto")
      .eq("emp_proprietaria_id", emp)
      .eq("assembleia_id", assembleiaId),
    perguntasDaAssembleia(assembleiaId),
    txt(a.empresa_id)
      ? admin.from("empresa").select("nome_fantasia, nome_razao").eq("id", a.empresa_id).maybeSingle()
      : Promise.resolve({ data: null }),
  ])
  const todas = contagem.data ?? []
  return {
    assembleiaId,
    nome: txt(a.nome_assembleia),
    empregador: empRes.data
      ? txt(empRes.data.nome_fantasia) ?? txt(empRes.data.nome_razao)
      : null,
    aberta: info.ok,
    totalAptos: todas.length,
    votaram: todas.filter((x) => x.hora_voto).length,
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
    .eq("assembleia_id", assembleiaId)
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
    .eq("assembleia_id", assembleiaId)
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
  const linhas = perguntas.map((p) => ({
    emp_proprietaria_id: emp,
    assembleia_id: assembleiaId,
    rod_assembleia_id: info.rodadaId,
    pergunta_id: p.id,
    resposta_id: escolhaPorPergunta.get(p.id) as string,
    valido: true,
    eleitor_id: null,
    created_at: agora,
  }))
  const { error: erroVoto } = await admin.from("voto_online").insert(linhas)
  if (erroVoto) {
    return { erro: `Não foi possível registrar o voto: ${erroVoto.message}` }
  }

  await admin
    .from("voto_assembleias_aptos")
    .update({ hora_voto: agora })
    .eq("id", aptoId)
    .eq("emp_proprietaria_id", emp)

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
    .eq("assembleia_id", assembleiaId)
    .eq("email_corporativo", email.trim().toLowerCase())
    .limit(1)
    .maybeSingle()
  return Boolean(data)
}
