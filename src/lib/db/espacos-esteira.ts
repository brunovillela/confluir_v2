import "server-only"

import { esquemaAusente, texto } from "@/lib/db/comum"
import { criarNotificacao } from "@/lib/db/notificacoes"
import { enviarEmail } from "@/lib/email"
import {
  botaoEmail,
  caixaAviso,
  escaparHtml,
  paragrafo,
  tituloEmail,
} from "@/lib/email-layout"
import type { ExigenciaCalculada, Gatilho } from "@/lib/espacos-constantes"
import { createAdminClient } from "@/lib/supabase/admin"
import { tenantAtual } from "@/lib/tenant"

/**
 * Cessão de espaços — fase 3: a esteira do pedido (visita técnica, autorização
 * e custeio). Ver supabase/cessao-esteira.sql.
 *
 * Os PASSOS saem do espaço, não do pedido: espaço com visita dispensada não
 * abre o passo, e espaço sem autorização pula a avaliação. Por isso a situação
 * continua curta e o andamento mora nas colunas de cada passo.
 */

export const AVISO_SQL_ESTEIRA =
  "Esteira da cessão ainda não configurada — rode supabase/cessao-esteira.sql no SQL Editor do Supabase."

export type SituacaoSolicitacao =
  | "rascunho"
  | "solicitada"
  | "em_analise"
  | "recusada"
  | "cancelada"
  | "confirmada"

export const ROTULO_SITUACAO: Record<SituacaoSolicitacao, string> = {
  rascunho: "Aguardando confirmação do e-mail",
  solicitada: "Na fila",
  em_analise: "Em análise",
  recusada: "Recusada",
  cancelada: "Cancelada",
  confirmada: "Confirmada",
}

export type SolicitacaoLinha = {
  id: string
  numero: number | null
  espacoId: string
  espacoNome: string
  solicitante: string
  entidade: string | null
  inicio: string | null
  termino: string | null
  situacao: SituacaoSolicitacao
  publicoEstimado: number | null
  analistaNome: string | null
  created_at: string | null
}

export async function listarSolicitacoes(filtros: {
  situacao?: string
  espacoId?: string
}): Promise<{ linhas: SolicitacaoLinha[]; esquemaPronto: boolean }> {
  const admin = await createAdminClient()
  let q = admin
    .from("cessao_solicitacoes")
    .select(
      "id, numero, espaco_id, solicitante_nome, entidade, inicio, termino, situacao, publico_estimado, analista_id, created_at"
    )
    .eq("emp_proprietaria_id", await tenantAtual())
  // Rascunho é pedido que nem confirmou o e-mail — não é fila de ninguém.
  if (filtros.situacao && filtros.situacao !== "todas") {
    q = q.eq("situacao", filtros.situacao)
  } else {
    q = q.neq("situacao", "rascunho")
  }
  if (filtros.espacoId) q = q.eq("espaco_id", filtros.espacoId)

  const { data, error } = await q
    .order("inicio", { ascending: true, nullsFirst: false })
    .limit(300)
  if (error) {
    if (esquemaAusente(error)) return { linhas: [], esquemaPronto: false }
    throw new Error(`Falha ao listar os pedidos: ${error.message}`)
  }

  const espacoIds = [...new Set((data ?? []).map((s) => String(s.espaco_id)))]
  const analistaIds = [
    ...new Set((data ?? []).map((s) => s.analista_id).filter(Boolean)),
  ].map(String)
  const [{ data: espacos }, { data: pessoas }] = await Promise.all([
    espacoIds.length
      ? admin.from("cessao_espacos").select("id, nome").in("id", espacoIds)
      : Promise.resolve({ data: [] }),
    analistaIds.length
      ? admin.from("usuarios").select("id, nome_completo, nome_guerra").in("id", analistaIds)
      : Promise.resolve({ data: [] }),
  ])
  const nomeEspaco = new Map((espacos ?? []).map((e) => [String(e.id), texto(e.nome)]))
  const nomePessoa = new Map(
    (pessoas ?? []).map((p) => [
      String(p.id),
      texto(p.nome_completo) ?? texto(p.nome_guerra),
    ])
  )

  return {
    esquemaPronto: true,
    linhas: (data ?? []).map((s) => ({
      id: String(s.id),
      numero: (s.numero as number | null) ?? null,
      espacoId: String(s.espaco_id),
      espacoNome: nomeEspaco.get(String(s.espaco_id)) ?? "(espaço)",
      solicitante: texto(s.solicitante_nome) ?? "(sem nome)",
      entidade: texto(s.entidade),
      inicio: texto(s.inicio),
      termino: texto(s.termino),
      situacao: (s.situacao as SituacaoSolicitacao) ?? "solicitada",
      publicoEstimado: (s.publico_estimado as number | null) ?? null,
      analistaNome: s.analista_id ? (nomePessoa.get(String(s.analista_id)) ?? null) : null,
      created_at: texto(s.created_at),
    })),
  }
}

/** O histórico é lido meses depois — o tipo cru não serve de rótulo. */
export const ROTULO_EVENTO: Record<string, string> = {
  analise: "Pedido assumido",
  visita_agendada: "Visita agendada",
  visita_realizada: "Visita realizada",
  visita_dispensada: "Visita dispensada",
  autorizacao_autorizada: "Autorizado",
  autorizacao_negada: "Autorização negada",
  custeio: "Custeio lançado",
  custeio_pago: "Custeio pago",
  confirmada: "Cessão confirmada",
  recusada: "Pedido recusado",
  cancelada: "Pedido cancelado",
  termo_gerado: "Termo gerado",
  termo_enviado: "Termo enviado para assinatura",
  termo_assinado: "Termo assinado pelas duas partes",
  termo_recusado: "Assinatura recusada",
  termo_cancelado: "Assinatura cancelada",
}

export type PassoVisita = {
  exigida: boolean
  facultativa: boolean
  dispensada: boolean
  agendadaEm: string | null
  responsavelId: string | null
  responsavelNome: string | null
  realizadaEm: string | null
  parecer: string | null
  /** Quem compareceu pelo solicitante — a visita é obrigação de quem recebe. */
  participante: string | null
}

export type SolicitacaoDetalhe = {
  id: string
  numero: number | null
  situacao: SituacaoSolicitacao
  espacoId: string
  espacoNome: string
  espacoExigeTermo: boolean
  espacoExigeAutorizacao: boolean
  // Quem pede
  solicitante: string
  cpf: string | null
  email: string | null
  telefone: string | null
  entidade: string | null
  representanteNome: string | null
  representanteTelefone: string | null
  identificacao: string | null
  // O evento
  inicio: string | null
  termino: string | null
  montagemInicio: string | null
  desmontagemTermino: string | null
  finalidade: string | null
  publicoEstimado: number | null
  respostas: Record<Exclude<Gatilho, "publico">, boolean>
  observacoes: string | null
  // Esteira
  analistaId: string | null
  analistaNome: string | null
  visita: PassoVisita
  autorizacao: {
    exigida: boolean
    situacao: "pendente" | "autorizada" | "negada"
    porNome: string | null
    em: string | null
    parecer: string | null
  }
  custeio: {
    valor: number | null
    observacao: string | null
    pagoEm: string | null
    comprovante: string | null
    itens: { id: string; descricao: string | null; valor: number }[]
  }
  recusaMotivo: string | null
  confirmadaEm: string | null
  created_at: string | null
  exigencias: ExigenciaCalculada[]
  eventos: { tipo: string; detalhe: string | null; quem: string | null; quando: string }[]
}

export async function obterSolicitacao(
  id: string
): Promise<SolicitacaoDetalhe | null> {
  const admin = await createAdminClient()
  const { data, error } = await admin
    .from("cessao_solicitacoes")
    .select("*")
    .eq("id", id)
    .eq("emp_proprietaria_id", await tenantAtual())
    .maybeSingle()
  if (error || !data) return null

  const [{ data: espaco }, { data: exig }, { data: itens }, { data: eventos }] =
    await Promise.all([
      admin
        .from("cessao_espacos")
        .select("nome, exige_termo, exige_autorizacao, visita_tecnica")
        .eq("id", data.espaco_id)
        .maybeSingle(),
      admin
        .from("cessao_solicitacao_exigencias")
        .select("gatilho, motivo, bombeiros, segurancas, observacao")
        .eq("solicitacao_id", id),
      admin
        .from("cessao_custeio_itens")
        .select("id, descricao, valor")
        .eq("solicitacao_id", id)
        .order("created_at", { ascending: true }),
      admin
        .from("cessao_solicitacao_eventos")
        .select("tipo, detalhe, usuario_id, created_at")
        .eq("solicitacao_id", id)
        .order("created_at", { ascending: false }),
    ])

  const pessoaIds = [
    ...new Set(
      [
        data.analista_id,
        data.visita_responsavel_id,
        data.autorizacao_por_id,
        ...((eventos ?? []).map((e) => e.usuario_id) as unknown[]),
      ].filter(Boolean)
    ),
  ].map(String)
  const { data: pessoas } = pessoaIds.length
    ? await admin
        .from("usuarios")
        .select("id, nome_completo, nome_guerra")
        .in("id", pessoaIds)
    : { data: [] }
  const nome = (id: unknown) =>
    id
      ? ((pessoas ?? []).find((p) => String(p.id) === String(id))?.nome_completo as
          | string
          | null) ?? null
      : null

  const visitaRegra = String(espaco?.visita_tecnica ?? "facultativa")

  return {
    id: String(data.id),
    numero: (data.numero as number | null) ?? null,
    situacao: (data.situacao as SituacaoSolicitacao) ?? "solicitada",
    espacoId: String(data.espaco_id),
    espacoNome: texto(espaco?.nome) ?? "(espaço)",
    espacoExigeTermo: espaco?.exige_termo !== false,
    espacoExigeAutorizacao: espaco?.exige_autorizacao !== false,
    solicitante: texto(data.solicitante_nome) ?? "(sem nome)",
    cpf: texto(data.solicitante_cpf),
    email: texto(data.solicitante_email),
    telefone: texto(data.solicitante_telefone),
    entidade: texto(data.entidade),
    representanteNome: texto(data.representante_nome),
    representanteTelefone: texto(data.representante_telefone),
    identificacao: texto(data.identificacao),
    inicio: texto(data.inicio),
    termino: texto(data.termino),
    montagemInicio: texto(data.montagem_inicio),
    desmontagemTermino: texto(data.desmontagem_termino),
    finalidade: texto(data.finalidade),
    publicoEstimado: (data.publico_estimado as number | null) ?? null,
    respostas: {
      infantil: data.tem_infantil === true,
      idoso: data.tem_idoso === true,
      mobilidade: data.tem_mobilidade === true,
      bebida: data.tem_bebida === true,
      estresse: data.tem_estresse === true,
    },
    observacoes: texto(data.observacoes),
    analistaId: data.analista_id ? String(data.analista_id) : null,
    analistaNome: nome(data.analista_id),
    visita: {
      exigida: visitaRegra === "obrigatoria",
      facultativa: visitaRegra === "facultativa",
      dispensada: visitaRegra === "dispensada" || data.visita_dispensada === true,
      agendadaEm: texto(data.visita_agendada_em),
      responsavelId: data.visita_responsavel_id ? String(data.visita_responsavel_id) : null,
      responsavelNome: nome(data.visita_responsavel_id),
      realizadaEm: texto(data.visita_realizada_em),
      parecer: texto(data.visita_parecer),
      participante: texto(data.visita_participante),
    },
    autorizacao: {
      exigida: espaco?.exige_autorizacao !== false,
      situacao: (data.autorizacao_situacao as "pendente" | "autorizada" | "negada") ?? "pendente",
      porNome: nome(data.autorizacao_por_id),
      em: texto(data.autorizacao_em),
      parecer: texto(data.autorizacao_parecer),
    },
    custeio: {
      valor: data.custeio_valor === null ? null : Number(data.custeio_valor),
      observacao: texto(data.custeio_observacao),
      pagoEm: texto(data.custeio_pago_em),
      comprovante: texto(data.custeio_comprovante),
      itens: (itens ?? []).map((i) => ({
        id: String(i.id),
        descricao: texto(i.descricao),
        valor: Number(i.valor ?? 0),
      })),
    },
    recusaMotivo: texto(data.recusa_motivo),
    confirmadaEm: texto(data.confirmada_em),
    created_at: texto(data.created_at),
    exigencias: (exig ?? []).map((e) => ({
      gatilho: e.gatilho as Gatilho,
      motivo: texto(e.motivo) ?? "",
      bombeiros: Number(e.bombeiros ?? 0),
      segurancas: Number(e.segurancas ?? 0),
      observacao: texto(e.observacao),
    })),
    eventos: (eventos ?? []).map((e) => ({
      tipo: texto(e.tipo) ?? "",
      detalhe: texto(e.detalhe),
      quem: nome(e.usuario_id),
      quando: String(e.created_at),
    })),
  }
}

/** Tudo que a esteira faz passa por aqui — a trilha nunca fica para depois. */
async function registrarEvento(
  solicitacaoId: string,
  tipo: string,
  detalhe: string | null,
  usuarioId: string
): Promise<void> {
  const admin = await createAdminClient()
  await admin.from("cessao_solicitacao_eventos").insert({
    solicitacao_id: solicitacaoId,
    tipo,
    detalhe,
    usuario_id: usuarioId,
    emp_proprietaria_id: await tenantAtual(),
  })
}

async function atualizar(
  id: string,
  mudancas: Record<string, unknown>
): Promise<{ erro?: string }> {
  const admin = await createAdminClient()
  const { error } = await admin
    .from("cessao_solicitacoes")
    .update({ ...mudancas, updated_at: new Date().toISOString() })
    .eq("id", id)
    .eq("emp_proprietaria_id", await tenantAtual())
  if (error) {
    if (esquemaAusente(error)) return { erro: AVISO_SQL_ESTEIRA }
    return { erro: `Não foi possível salvar: ${error.message}` }
  }
  return {}
}

export async function assumirPedido(
  id: string,
  usuarioId: string
): Promise<{ erro?: string }> {
  const r = await atualizar(id, { analista_id: usuarioId, situacao: "em_analise" })
  // Sem detalhe: o rótulo do evento já diz "Pedido assumido".
  if (!r.erro) await registrarEvento(id, "analise", null, usuarioId)
  return r
}

export async function agendarVisita(
  id: string,
  dados: { quando: string; responsavelId: string | null },
  usuarioId: string
): Promise<{ erro?: string }> {
  if (!dados.quando) return { erro: "Informe a data e a hora da visita." }
  const quandoISO = new Date(dados.quando).toISOString()
  const r = await atualizar(id, {
    visita_agendada_em: quandoISO,
    visita_responsavel_id: dados.responsavelId,
    visita_dispensada: false,
  })
  if (!r.erro) {
    // Na trilha e no e-mail vai a data legível, não o valor do campo.
    const legivel = new Intl.DateTimeFormat("pt-BR", {
      timeZone: "America/Sao_Paulo",
      dateStyle: "short",
      timeStyle: "short",
    }).format(new Date(quandoISO))
    await registrarEvento(id, "visita_agendada", legivel, usuarioId)
    await avisarSolicitante(id, "visita", legivel)
  }
  return r
}

/**
 * A visita é obrigação de QUEM RECEBE o espaço — ele vem, vê o lugar e acerta
 * o que for preciso. Por isso o registro guarda os dois lados: o parecer (o
 * que ficou acertado) e quem compareceu pelo solicitante.
 */
export async function registrarVisita(
  id: string,
  dados: { parecer: string; participante: string },
  usuarioId: string
): Promise<{ erro?: string }> {
  if (!dados.participante.trim()) {
    return { erro: "Informe quem compareceu pelo solicitante." }
  }
  const r = await atualizar(id, {
    visita_realizada_em: new Date().toISOString(),
    visita_parecer: dados.parecer.trim() || null,
    visita_participante: dados.participante.trim(),
  })
  if (!r.erro) {
    await registrarEvento(
      id,
      "visita_realizada",
      [dados.participante.trim(), dados.parecer.trim()].filter(Boolean).join(" — "),
      usuarioId
    )
  }
  return r
}

export async function dispensarVisita(
  id: string,
  usuarioId: string
): Promise<{ erro?: string }> {
  const r = await atualizar(id, { visita_dispensada: true })
  if (!r.erro) await registrarEvento(id, "visita_dispensada", null, usuarioId)
  return r
}

export async function decidirAutorizacao(
  id: string,
  decisao: "autorizada" | "negada",
  parecer: string,
  usuarioId: string
): Promise<{ erro?: string }> {
  if (decisao === "negada" && !parecer.trim()) {
    return { erro: "Negar exige um motivo — ele vai para o solicitante." }
  }
  const r = await atualizar(id, {
    autorizacao_situacao: decisao,
    autorizacao_por_id: usuarioId,
    autorizacao_em: new Date().toISOString(),
    autorizacao_parecer: parecer.trim() || null,
    ...(decisao === "negada"
      ? { situacao: "recusada", recusa_motivo: parecer.trim() }
      : {}),
  })
  if (!r.erro) {
    await registrarEvento(id, `autorizacao_${decisao}`, parecer, usuarioId)
    if (decisao === "negada") await avisarSolicitante(id, "recusado", parecer)
  }
  return r
}

export async function lancarCusteio(
  id: string,
  dados: {
    itens: { descricao: string; valor: number }[]
    observacao: string | null
  },
  usuarioId: string
): Promise<{ erro?: string }> {
  const admin = await createAdminClient()
  const emp = await tenantAtual()
  await admin.from("cessao_custeio_itens").delete().eq("solicitacao_id", id)
  const validos = dados.itens.filter((i) => i.descricao.trim() || i.valor > 0)
  if (validos.length > 0) {
    const { error } = await admin.from("cessao_custeio_itens").insert(
      validos.map((i) => ({
        solicitacao_id: id,
        descricao: i.descricao.trim() || null,
        valor: i.valor,
        emp_proprietaria_id: emp,
      }))
    )
    if (error) {
      if (esquemaAusente(error)) return { erro: AVISO_SQL_ESTEIRA }
      return { erro: `Não foi possível salvar o custeio: ${error.message}` }
    }
  }
  const total = validos.reduce((s, i) => s + i.valor, 0)
  const r = await atualizar(id, {
    custeio_valor: validos.length > 0 ? total : null,
    custeio_observacao: dados.observacao?.trim() || null,
  })
  if (!r.erro) {
    await registrarEvento(
      id,
      "custeio",
      `${validos.length} item(ns), total ${total.toFixed(2)}`,
      usuarioId
    )
  }
  return r
}

export async function registrarPagamento(
  id: string,
  usuarioId: string
): Promise<{ erro?: string }> {
  const r = await atualizar(id, { custeio_pago_em: new Date().toISOString() })
  if (!r.erro) await registrarEvento(id, "custeio_pago", null, usuarioId)
  return r
}

/**
 * O que ainda falta para confirmar. Vazio = pode confirmar. A MESMA função
 * alimenta a tela (que explica) e a action (que recusa).
 */
export function pendenciasParaConfirmar(s: SolicitacaoDetalhe): string[] {
  const falta: string[] = []
  if (s.situacao === "recusada" || s.situacao === "cancelada") {
    falta.push("o pedido está encerrado")
    return falta
  }
  if (s.visita.exigida && !s.visita.realizadaEm && !s.visita.dispensada) {
    falta.push("a visita técnica ainda não foi realizada")
  }
  if (s.autorizacao.exigida && s.autorizacao.situacao !== "autorizada") {
    falta.push("falta a autorização")
  }
  if (s.custeio.valor !== null && s.custeio.valor > 0 && !s.custeio.pagoEm) {
    falta.push("o custeio ainda não foi pago")
  }
  return falta
}

export async function confirmarCessao(
  id: string,
  usuarioId: string
): Promise<{ erro?: string }> {
  const s = await obterSolicitacao(id)
  if (!s) return { erro: "Pedido não encontrado." }
  const falta = pendenciasParaConfirmar(s)
  if (falta.length > 0) {
    return { erro: `Ainda não dá para confirmar: ${falta.join("; ")}.` }
  }
  const r = await atualizar(id, {
    situacao: "confirmada",
    confirmada_em: new Date().toISOString(),
    confirmada_por_id: usuarioId,
  })
  if (!r.erro) {
    await registrarEvento(id, "confirmada", null, usuarioId)
    await avisarSolicitante(id, "confirmado", null)
  }
  return r
}

export async function recusarPedido(
  id: string,
  motivo: string,
  usuarioId: string
): Promise<{ erro?: string }> {
  if (!motivo.trim()) return { erro: "Diga o motivo — ele vai para o solicitante." }
  const r = await atualizar(id, {
    situacao: "recusada",
    recusa_motivo: motivo.trim(),
  })
  if (!r.erro) {
    await registrarEvento(id, "recusada", motivo, usuarioId)
    await avisarSolicitante(id, "recusado", motivo)
  }
  return r
}

export async function cancelarPedido(
  id: string,
  motivo: string,
  usuarioId: string
): Promise<{ erro?: string }> {
  const r = await atualizar(id, {
    situacao: "cancelada",
    recusa_motivo: motivo.trim() || null,
  })
  if (!r.erro) {
    await registrarEvento(id, "cancelada", motivo, usuarioId)
    await avisarSolicitante(id, "cancelado", motivo)
  }
  return r
}

/** Todo passo que muda a vida do solicitante avisa o solicitante. */
async function avisarSolicitante(
  id: string,
  tipo: "visita" | "confirmado" | "recusado" | "cancelado",
  detalhe: string | null
): Promise<void> {
  const admin = await createAdminClient()
  const { data } = await admin
    .from("cessao_solicitacoes")
    .select("solicitante_nome, solicitante_email, numero, espaco_id")
    .eq("id", id)
    .maybeSingle()
  if (!data?.solicitante_email) return
  const { data: espaco } = await admin
    .from("cessao_espacos")
    .select("nome")
    .eq("id", data.espaco_id)
    .maybeSingle()
  const nomeEspaco = texto(espaco?.nome) ?? "espaço"
  const numero = data.numero ? `nº ${data.numero}` : ""

  const textos: Record<typeof tipo, { assunto: string; corpo: string }> = {
    visita: {
      assunto: `Visita técnica agendada — ${nomeEspaco}`,
      corpo:
        paragrafo(
          `A visita técnica do seu pedido ${escaparHtml(numero)} para <strong>${escaparHtml(nomeEspaco)}</strong> foi agendada. <strong>Sua presença é necessária</strong>: é na visita que se acerta tudo o que o evento precisa — acessos, energia, som, limpeza e o que mais couber.`
        ) +
        (detalhe ? caixaAviso(`Data e hora: ${escaparHtml(detalhe)}`) : ""),
    },
    confirmado: {
      assunto: `Cessão confirmada — ${nomeEspaco}`,
      corpo: paragrafo(
        `Seu pedido ${escaparHtml(numero)} para <strong>${escaparHtml(nomeEspaco)}</strong> foi <strong>confirmado</strong>. Em caso de dúvida, responda a quem está em contato com você.`
      ),
    },
    recusado: {
      assunto: `Pedido não aprovado — ${nomeEspaco}`,
      corpo:
        paragrafo(
          `Seu pedido ${escaparHtml(numero)} para <strong>${escaparHtml(nomeEspaco)}</strong> não foi aprovado.`
        ) + (detalhe ? caixaAviso(escaparHtml(detalhe)) : ""),
    },
    cancelado: {
      assunto: `Pedido cancelado — ${nomeEspaco}`,
      corpo:
        paragrafo(
          `Seu pedido ${escaparHtml(numero)} para <strong>${escaparHtml(nomeEspaco)}</strong> foi cancelado.`
        ) + (detalhe ? caixaAviso(escaparHtml(detalhe)) : ""),
    },
  }

  const { assunto, corpo } = textos[tipo]
  await enviarEmail({
    email: String(data.solicitante_email),
    nome: texto(data.solicitante_nome),
    assunto,
    html: tituloEmail(assunto) + corpo,
  })
}

/** Aviso no sino para quem cuida de espaços. */
export async function avisarEquipeNovoPedido(
  solicitacaoId: string,
  texto_: string
): Promise<void> {
  const admin = await createAdminClient()
  const { data } = await admin
    .from("permissoes")
    .select("usuario_id")
    .eq("emp_proprietaria_id", await tenantAtual())
    .or("espacos_gestao.is.true,espacos.is.true")
  for (const p of data ?? []) {
    await criarNotificacao({
      usuarioId: String(p.usuario_id),
      texto: `Novo pedido de uso de espaço: ${texto_}`,
    })
  }
}

export const botaoAviso = botaoEmail
