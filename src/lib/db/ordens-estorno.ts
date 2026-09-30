import "server-only"

import { esquemaAusente, hojeSP } from "@/lib/db/comum"
import { descreverPagoCom, type DetalhePagamento } from "@/lib/db/compras-pagamento"
import { criarNotificacao } from "@/lib/db/notificacoes"
import {
  registrarEvento,
  SITUACAO_AGUARDANDO,
  SITUACAO_EM_AUTORIZACAO,
} from "@/lib/db/ordens-ciclo"
import { urlArquivoOrdem } from "@/lib/db/ordens-extrato"
import { procedenciaDaOrdem } from "@/lib/db/ordens-procedencia"
import { formatarData, formatarMoeda } from "@/lib/formato"
import { createAdminClient } from "@/lib/supabase/admin"
import { tenantAtual } from "@/lib/tenant"

/**
 * Estorno de pagamento (supabase/ordens-estorno.sql).
 *
 *   Paga ──estorno (até N dias após o pagamento)──▶ Aguardando informações
 *                                                        │ quem lançou a ordem
 *                                                        │ confere/corrige os dados
 *                                                        ▼
 *                                                  Em autorização ──▶ A pagar ──▶ Paga
 *
 * O banco devolve o pagamento depois da tentativa (conta encerrada, chave Pix
 * errada, boleto vencido…). O comunicado de estorno guarda o pagamento
 * desfeito, a ordem perde o registro de pagamento e a autorização (vai ser
 * paga de outro jeito: nova aprovação) e quem a lançou é avisado no sino.
 */

export const PRAZO_ESTORNO_PADRAO = 15

// ── Prazo ───────────────────────────────────────────────────────────────────

export async function obterPrazoEstorno(): Promise<{ dias: number; disponivel: boolean }> {
  const admin = await createAdminClient()
  const { data, error } = await admin
    .from("financeiro_config")
    .select("estorno_prazo_dias")
    .eq("emp_proprietaria_id", await tenantAtual())
    .maybeSingle()
  if (error) return { dias: PRAZO_ESTORNO_PADRAO, disponivel: false }
  const dias = Number(data?.estorno_prazo_dias)
  return { dias: dias > 0 ? dias : PRAZO_ESTORNO_PADRAO, disponivel: true }
}

export async function salvarPrazoEstorno(dias: number): Promise<{ erro?: string }> {
  if (!Number.isInteger(dias) || dias < 1 || dias > 365) {
    return { erro: "O prazo deve ser de 1 a 365 dias." }
  }
  const admin = await createAdminClient()
  const { error } = await admin.from("financeiro_config").upsert(
    {
      emp_proprietaria_id: await tenantAtual(),
      estorno_prazo_dias: dias,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "emp_proprietaria_id" }
  )
  if (error) {
    if (esquemaAusente(error)) return { erro: "Rode supabase/ordens-estorno.sql antes de configurar." }
    return { erro: `Não foi possível salvar: ${error.message}` }
  }
  return {}
}

function somarDias(dataISO: string, dias: number): string {
  const d = new Date(`${dataISO}T12:00:00Z`)
  d.setUTCDate(d.getUTCDate() + dias)
  return d.toISOString().slice(0, 10)
}

/** Até quando a ordem paga aceita o registro de estorno. */
export function janelaDeEstorno(
  dataPagamento: string | null,
  prazoDias: number
): { aberta: boolean; ate: string | null } {
  if (!dataPagamento || !/^\d{4}-\d{2}-\d{2}/.test(dataPagamento)) {
    return { aberta: false, ate: null }
  }
  const ate = somarDias(dataPagamento.slice(0, 10), prazoDias)
  return { aberta: hojeSP() <= ate, ate }
}

// ── Quem lançou ─────────────────────────────────────────────────────────────

/**
 * Quem lançou a ordem: o autor do evento "criada" da trilha; nas ordens de
 * antes da trilha, o solicitante da procedência (compra, diária, RPA…).
 */
export async function lancadorDaOrdem(ordem: Record<string, unknown>): Promise<string | null> {
  const admin = await createAdminClient()
  const { data } = await admin
    .from("ordens_pagamento_eventos")
    .select("usuario_id")
    .eq("ordem_id", String(ordem.id))
    .eq("tipo", "criada")
    .not("usuario_id", "is", null)
    .order("created_at", { ascending: true })
    .limit(1)
  const doEvento = (data?.[0]?.usuario_id as string | undefined) ?? null
  if (doEvento) return doEvento
  try {
    const p = await procedenciaDaOrdem(ordem)
    return p.solicitante?.id ?? null
  } catch {
    return null
  }
}

async function nomesDe(ids: (string | null | undefined)[]): Promise<Map<string, string>> {
  const unicos = [...new Set(ids.filter((v): v is string => !!v))]
  const nomes = new Map<string, string>()
  if (!unicos.length) return nomes
  const admin = await createAdminClient()
  const { data } = await admin
    .from("usuarios")
    .select("id, nome_completo, nome_guerra")
    .in("id", unicos)
  for (const u of data ?? []) {
    nomes.set(String(u.id), String(u.nome_completo ?? u.nome_guerra ?? "(sem nome)"))
  }
  return nomes
}

// ── Registrar o estorno ─────────────────────────────────────────────────────

export async function registrarEstorno(
  ordemId: string,
  usuarioId: string,
  dados: { dataEstorno: string; motivo: string; arquivoComunicado: string | null }
): Promise<{ erro?: string; estornoId?: string; responsavelId?: string | null }> {
  const motivo = dados.motivo.trim()
  if (motivo.length < 10) {
    return { erro: "Descreva o motivo do estorno informado pelo banco (ex.: conta encerrada, chave Pix inexistente)." }
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dados.dataEstorno)) return { erro: "Informe a data do estorno." }

  const admin = await createAdminClient()
  const emp = await tenantAtual()
  const { data: ordem } = await admin
    .from("ordens_pagamento")
    .select("*")
    .eq("id", ordemId)
    .eq("emp_proprietaria_id", emp)
    .maybeSingle()
  if (!ordem) return { erro: "Ordem não encontrada." }
  if (ordem.situacao !== "Paga") return { erro: "Só uma ordem paga pode ser estornada." }
  if (ordem.caixa_conta_id) {
    return { erro: "Compra paga em dinheiro pelo caixa não tem estorno bancário — use o caixa." }
  }
  const { dias } = await obterPrazoEstorno()
  const janela = janelaDeEstorno(ordem.data_pagamento as string | null, dias)
  if (!janela.aberta) {
    return {
      erro: janela.ate
        ? `O prazo para registrar estorno desta ordem acabou em ${formatarData(janela.ate)} (${dias} dias após o pagamento).`
        : "A ordem não tem data de pagamento registrada.",
    }
  }
  const dataPagamento = String(ordem.data_pagamento).slice(0, 10)
  if (dados.dataEstorno < dataPagamento) {
    return { erro: "O estorno não pode ser anterior ao pagamento." }
  }
  if (dados.dataEstorno > hojeSP()) return { erro: "A data do estorno não pode ser futura." }

  const responsavelId = await lancadorDaOrdem(ordem)
  const pagamento = {
    valor_pago: ordem.valor_pago ?? null,
    data_pagamento: ordem.data_pagamento ?? null,
    arquivo_pagamento: ordem.arquivo_pagamento ?? null,
    centro_custo_receita_id: ordem.centro_custo_receita_id ?? null,
    pagador_id: ordem.pagador_id ?? null,
    forma_pagamento: ordem.forma_pagamento ?? null,
    dados_bancarios_id: ordem.dados_bancarios_id ?? null,
    pix_codigo: ordem.pix_codigo ?? null,
    arquivo_boleto: ordem.arquivo_boleto ?? null,
    pago_com: await descreverPagoCom(ordem).catch(() => null),
    autorizacao_autorizador_id: ordem.autorizacao_autorizador_id ?? null,
    autorizacao_data: ordem.autorizacao_data ?? null,
    autorizacao_dispensada: ordem.autorizacao_dispensada ?? false,
  }

  const { data: estorno, error: erroEstorno } = await admin
    .from("ordens_pagamento_estornos")
    .insert({
      emp_proprietaria_id: emp,
      ordem_id: ordemId,
      data_estorno: dados.dataEstorno,
      motivo,
      arquivo_comunicado: dados.arquivoComunicado,
      registrado_por_id: usuarioId,
      responsavel_id: responsavelId,
      pagamento,
    })
    .select("id")
    .single()
  if (erroEstorno || !estorno) {
    if (erroEstorno && esquemaAusente(erroEstorno)) {
      return { erro: "Rode supabase/ordens-estorno.sql antes de registrar estornos." }
    }
    if (erroEstorno?.code === "23505") return { erro: "Esta ordem já tem um estorno pendente." }
    return { erro: `Não foi possível registrar o estorno: ${erroEstorno?.message}` }
  }
  const estornoId = String(estorno.id)

  const { data: regrediu, error: erroOrdem } = await admin
    .from("ordens_pagamento")
    .update({
      situacao: SITUACAO_AGUARDANDO,
      valor_pago: null,
      data_pagamento: null,
      arquivo_pagamento: null,
      pagador_id: null,
      centro_custo_receita_id: null,
      autorizacao_esta_autorizado: false,
      autorizacao_autorizador_id: null,
      autorizacao_data: null,
      autorizacao_observacao: `Pagamento estornado em ${formatarData(dados.dataEstorno)}: ${motivo}`,
      autorizacao_dispensada: false,
      autorizacao_dispensa_motivo: null,
    })
    .eq("id", ordemId)
    .eq("situacao", "Paga")
    .select("id")
  if (erroOrdem || (regrediu ?? []).length === 0) {
    await admin.from("ordens_pagamento_estornos").delete().eq("id", estornoId)
    return {
      erro: erroOrdem
        ? `Não foi possível regredir a ordem: ${erroOrdem.message}`
        : "A ordem mudou de situação enquanto o estorno era registrado.",
    }
  }

  await registrarEvento(ordemId, "estornada", usuarioId, motivo, {
    estorno_id: estornoId,
    data_estorno: dados.dataEstorno,
    valor_pago: pagamento.valor_pago,
    data_pagamento: pagamento.data_pagamento,
    pago_com: pagamento.pago_com,
    responsavel_id: responsavelId,
    comunicado: Boolean(dados.arquivoComunicado),
  })

  if (responsavelId) {
    try {
      await criarNotificacao({
        usuarioId: responsavelId,
        texto: `Pagamento estornado — ordem ${ordem.codigo ?? ""} (${formatarMoeda(pagamento.valor_pago as number | null)}): ${motivo}. Confira os dados bancários ou o boleto e reencaminhe para autorização.`,
        link: `/painel/estornos/${estornoId}`,
      })
    } catch (e) {
      console.error("registrarEstorno/notificação:", e)
    }
  }
  return { estornoId, responsavelId }
}

// ── Consulta ────────────────────────────────────────────────────────────────

export type ResumoEstorno = {
  id: string
  ordemId: string
  ordemCodigo: string | null
  ordemDescricao: string | null
  ordemSituacao: string | null
  valor: number | null
  dataEstorno: string
  motivo: string
  responsavelId: string | null
  responsavel: string | null
  registradoPor: string | null
  criadoEm: string
  resolvidoEm: string | null
  resolvidoPor: string | null
  resolucao: string | null
}

function paraResumo(l: Record<string, unknown>, nomes: Map<string, string>): ResumoEstorno {
  const o = (l.ordens_pagamento ?? {}) as Record<string, unknown>
  const pg = (l.pagamento ?? {}) as Record<string, unknown>
  return {
    id: String(l.id),
    ordemId: String(l.ordem_id),
    ordemCodigo: (o.codigo as string | null) ?? null,
    ordemDescricao: (o.descricao as string | null) ?? null,
    ordemSituacao: (o.situacao as string | null) ?? null,
    valor: pg.valor_pago === null || pg.valor_pago === undefined ? null : Number(pg.valor_pago),
    dataEstorno: String(l.data_estorno),
    motivo: String(l.motivo ?? ""),
    responsavelId: (l.responsavel_id as string | null) ?? null,
    responsavel: l.responsavel_id ? (nomes.get(String(l.responsavel_id)) ?? null) : null,
    registradoPor: l.registrado_por_id ? (nomes.get(String(l.registrado_por_id)) ?? null) : null,
    criadoEm: String(l.created_at),
    resolvidoEm: (l.resolvido_em as string | null) ?? null,
    resolvidoPor: l.resolvido_por_id ? (nomes.get(String(l.resolvido_por_id)) ?? null) : null,
    resolucao: (l.resolucao as string | null) ?? null,
  }
}

const COLUNAS_RESUMO =
  "id, ordem_id, data_estorno, motivo, responsavel_id, registrado_por_id, resolvido_em, resolvido_por_id, resolucao, pagamento, created_at, ordens_pagamento(codigo, descricao, situacao)"

export async function listarEstornos(filtro: {
  situacao: "pendentes" | "resolvidos" | "todos"
  responsavelId?: string
}): Promise<{ disponivel: boolean; estornos: ResumoEstorno[] }> {
  const admin = await createAdminClient()
  let q = admin
    .from("ordens_pagamento_estornos")
    .select(COLUNAS_RESUMO)
    .eq("emp_proprietaria_id", await tenantAtual())
    .order("created_at", { ascending: false })
    .limit(500)
  if (filtro.situacao === "pendentes") q = q.is("resolvido_em", null)
  if (filtro.situacao === "resolvidos") q = q.not("resolvido_em", "is", null)
  if (filtro.responsavelId) q = q.eq("responsavel_id", filtro.responsavelId)
  const { data, error } = await q
  if (error) return { disponivel: false, estornos: [] }
  const linhas = (data ?? []) as Record<string, unknown>[]
  const nomes = await nomesDe(
    linhas.flatMap((l) => [l.responsavel_id, l.registrado_por_id, l.resolvido_por_id] as (string | null)[])
  )
  return { disponivel: true, estornos: linhas.map((l) => paraResumo(l, nomes)) }
}

/** Estornos pendentes que o usuário precisa corrigir (painel inicial, avisos). */
export async function contarEstornosPendentes(responsavelId?: string): Promise<number> {
  const admin = await createAdminClient()
  let q = admin
    .from("ordens_pagamento_estornos")
    .select("id", { count: "exact", head: true })
    .eq("emp_proprietaria_id", await tenantAtual())
    .is("resolvido_em", null)
  if (responsavelId) q = q.eq("responsavel_id", responsavelId)
  const { count, error } = await q
  return error ? 0 : (count ?? 0)
}

/** Estornos da ordem (o pendente primeiro), para a tela da ordem. */
export async function estornosDaOrdem(ordemId: string): Promise<ResumoEstorno[]> {
  const admin = await createAdminClient()
  const { data, error } = await admin
    .from("ordens_pagamento_estornos")
    .select(COLUNAS_RESUMO)
    .eq("ordem_id", ordemId)
    .eq("emp_proprietaria_id", await tenantAtual())
    .order("created_at", { ascending: false })
  if (error) return []
  const linhas = (data ?? []) as Record<string, unknown>[]
  const nomes = await nomesDe(
    linhas.flatMap((l) => [l.responsavel_id, l.registrado_por_id, l.resolvido_por_id] as (string | null)[])
  )
  return linhas.map((l) => paraResumo(l, nomes))
}

export type EstornoDetalhe = ResumoEstorno & {
  urlComunicado: string | null
  pagamento: {
    valor: number | null
    data: string | null
    pagoCom: string | null
    forma: string | null
    pixCodigo: string | null
    urlBoleto: string | null
    urlComprovante: string | null
  }
  ordem: {
    valorCobranca: number | null
    vencimento: string | null
    forma: string | null
    fornecedorId: string | null
    favorecido: string | null
    pagoComAtual: string | null
    pixCodigo: string | null
    urlBoleto: string | null
  }
  correcao: Record<string, unknown> | null
}

export async function obterEstorno(id: string): Promise<EstornoDetalhe | null> {
  const admin = await createAdminClient()
  const emp = await tenantAtual()
  const { data, error } = await admin
    .from("ordens_pagamento_estornos")
    .select(`${COLUNAS_RESUMO}, arquivo_comunicado, correcao`)
    .eq("id", id)
    .eq("emp_proprietaria_id", emp)
    .maybeSingle()
  if (error || !data) return null
  const l = data as Record<string, unknown>
  const { data: o } = await admin
    .from("ordens_pagamento")
    .select("*")
    .eq("id", String(l.ordem_id))
    .eq("emp_proprietaria_id", emp)
    .maybeSingle()
  if (!o) return null
  const fornecedorId = ((o.beneficiario_fornecedor_id ?? o.fornecedor_id) as string | null) ?? null
  const pg = (l.pagamento ?? {}) as Record<string, unknown>

  const [nomes, favorecido, pagoComAtual, urlComunicado, urlBoletoAtual, urlBoletoAntes, urlComprovante] =
    await Promise.all([
      nomesDe([l.responsavel_id, l.registrado_por_id, l.resolvido_por_id] as (string | null)[]),
      fornecedorId
        ? admin
            .from("empresa")
            .select("nome_fantasia, nome_razao")
            .eq("id", fornecedorId)
            .maybeSingle()
            .then(({ data: e }) => (e?.nome_fantasia || e?.nome_razao || null) as string | null)
        : Promise.resolve(null),
      descreverPagoCom(o).catch(() => null),
      urlArquivoOrdem(l.arquivo_comunicado),
      urlArquivoOrdem(o.arquivo_boleto),
      urlArquivoOrdem(pg.arquivo_boleto),
      urlArquivoOrdem(pg.arquivo_pagamento),
    ])

  return {
    ...paraResumo(l, nomes),
    urlComunicado,
    pagamento: {
      valor: pg.valor_pago === null || pg.valor_pago === undefined ? null : Number(pg.valor_pago),
      data: (pg.data_pagamento as string | null) ?? null,
      pagoCom: (pg.pago_com as string | null) ?? null,
      forma: (pg.forma_pagamento as string | null) ?? null,
      pixCodigo: (pg.pix_codigo as string | null) ?? null,
      urlBoleto: urlBoletoAntes,
      urlComprovante,
    },
    ordem: {
      valorCobranca: o.valor_inicial_cobranca === null ? null : Number(o.valor_inicial_cobranca),
      vencimento: (o.vencimento as string | null) ?? null,
      forma: (o.forma_pagamento as string | null) ?? null,
      fornecedorId,
      favorecido,
      pagoComAtual,
      pixCodigo: (o.pix_codigo as string | null) ?? null,
      urlBoleto: urlBoletoAtual,
    },
    correcao: (l.correcao as Record<string, unknown> | null) ?? null,
  }
}

// ── Corrigir e reencaminhar ─────────────────────────────────────────────────

/**
 * Quem lançou (ou o Financeiro) grava a forma e os dados de pagamento
 * conferidos e devolve a ordem para AUTORIZAÇÃO — sempre, mesmo a que nasceu
 * com autorização dispensada: o dinheiro vai por outro caminho.
 */
export async function corrigirEstorno(
  estornoId: string,
  usuarioId: string,
  dados: {
    forma: string
    detalhe: DetalhePagamento
    novoBoleto: string | null
    observacao: string
    vencimento: string | null
  }
): Promise<{ erro?: string; ordemId?: string }> {
  const observacao = dados.observacao.trim()
  if (observacao.length < 10) {
    return { erro: "Diga o que foi conferido ou corrigido (ex.: nova chave Pix confirmada com o fornecedor)." }
  }
  const admin = await createAdminClient()
  const emp = await tenantAtual()
  const { data: est } = await admin
    .from("ordens_pagamento_estornos")
    .select("id, ordem_id, resolvido_em")
    .eq("id", estornoId)
    .eq("emp_proprietaria_id", emp)
    .maybeSingle()
  if (!est) return { erro: "Estorno não encontrado." }
  if (est.resolvido_em) return { erro: "Este estorno já foi resolvido." }
  const ordemId = String(est.ordem_id)

  const { data: ordem } = await admin
    .from("ordens_pagamento")
    .select("*")
    .eq("id", ordemId)
    .eq("emp_proprietaria_id", emp)
    .maybeSingle()
  if (!ordem) return { erro: "Ordem não encontrada." }
  if (ordem.situacao !== SITUACAO_AGUARDANDO) {
    return { erro: `A ordem está "${ordem.situacao}" — não aguarda mais a correção do estorno.` }
  }

  const antes = {
    forma_pagamento: ordem.forma_pagamento ?? null,
    dados_bancarios_id: ordem.dados_bancarios_id ?? null,
    pix_codigo: ordem.pix_codigo ?? null,
    arquivo_boleto: ordem.arquivo_boleto ?? null,
    vencimento: ordem.vencimento ?? null,
  }
  const mudancas: Record<string, unknown> = {
    forma_pagamento: dados.forma,
    dados_bancarios_id: dados.detalhe.dados_bancarios_id,
    pix_codigo: dados.detalhe.pix_codigo,
    cartao_id: null,
    ...(dados.novoBoleto ? { arquivo_boleto: dados.novoBoleto } : {}),
    ...(dados.vencimento ? { vencimento: dados.vencimento } : {}),
  }

  const { data: atualizou, error } = await admin
    .from("ordens_pagamento")
    .update({
      ...mudancas,
      situacao: SITUACAO_EM_AUTORIZACAO,
      autorizacao_esta_autorizado: false,
      autorizacao_autorizador_id: null,
      autorizacao_data: null,
      autorizacao_observacao: null,
    })
    .eq("id", ordemId)
    .eq("situacao", SITUACAO_AGUARDANDO)
    .select("*")
  if (error) return { erro: `Não foi possível corrigir a ordem: ${error.message}` }
  const nova = (atualizou ?? [])[0] as Record<string, unknown> | undefined
  if (!nova) return { erro: "A ordem mudou de situação — recarregue a página." }

  const pagoCom = await descreverPagoCom(nova).catch(() => null)
  const correcao = {
    antes,
    depois: {
      forma_pagamento: dados.forma,
      dados_bancarios_id: dados.detalhe.dados_bancarios_id,
      pix_codigo: dados.detalhe.pix_codigo,
      arquivo_boleto: dados.novoBoleto ?? antes.arquivo_boleto,
      vencimento: dados.vencimento ?? antes.vencimento,
      pago_com: pagoCom,
    },
  }
  await admin
    .from("ordens_pagamento_estornos")
    .update({
      resolvido_em: new Date().toISOString(),
      resolvido_por_id: usuarioId,
      resolucao: observacao,
      correcao,
    })
    .eq("id", estornoId)
    .is("resolvido_em", null)

  await registrarEvento(ordemId, "estorno_corrigido", usuarioId, observacao, {
    estorno_id: estornoId,
    ...correcao,
  })
  return { ordemId }
}
