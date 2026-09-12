import "server-only"

import { buscarFiliadoPorCpf } from "@/lib/contas"
import {
  CONDICOES_HOSPEDAGEM_PADRAO,
  avaliarCondicoesHospedagem,
  contarCondicoesAtivas,
  descreverCondicoesHospedagem,
  janelaDoPeriodo,
  type CondicoesHospedagem,
} from "@/lib/hospedagem-condicoes-constantes"
import { createAdminClient } from "@/lib/supabase/admin"
import { tenantAtual } from "@/lib/tenant"

/**
 * Condições de uso da hospedagem definidas pela entidade (fonte, regime,
 * quantidade por período, lista de beneficiários). Configuradas em
 * Filiação → Configurações de filiação; conferidas ao solicitar cupom no
 * portal e ao emitir pelo painel; mostradas ao associado em Hospedagem.
 *
 * SQL: supabase/hospedagem-condicoes.sql
 */

type ErroSupabase = { code?: string; message: string }

function faltaTabela(e: ErroSupabase): boolean {
  return e.code === "PGRST205" || e.code === "42P01"
}

const AVISO_SQL =
  "As tabelas das condições da hospedagem ainda não existem — rode supabase/hospedagem-condicoes.sql no SQL Editor."

// ── Configuração ─────────────────────────────────────────────────────────────

export async function lerCondicoesHospedagem(): Promise<CondicoesHospedagem> {
  const admin = await createAdminClient()
  const { data, error } = await admin
    .from("hospedagem_condicoes")
    .select(
      "restringir_fontes, fontes_ids, limitar_quantidade, quantidade_maxima, quantidade_periodo, restringir_regimes, regimes, somente_beneficiarios, observacao"
    )
    .eq("emp_proprietaria_id", await tenantAtual())
    .maybeSingle()
  // Sem tabela (SQL ainda não rodado) ou sem linha: nenhuma condição.
  if (error || !data) return { ...CONDICOES_HOSPEDAGEM_PADRAO }
  return {
    restringirFontes: data.restringir_fontes === true,
    fontesIds: (data.fontes_ids as string[] | null) ?? [],
    limitarQuantidade: data.limitar_quantidade === true,
    quantidadeMaxima: Number(data.quantidade_maxima ?? 1),
    quantidadePeriodo: data.quantidade_periodo === "ano" ? "ano" : "mes",
    restringirRegimes: data.restringir_regimes === true,
    regimes: (data.regimes as string[] | null) ?? [],
    somenteBeneficiarios: data.somente_beneficiarios === true,
    observacao: (data.observacao as string | null) ?? null,
  }
}

export async function salvarCondicoesHospedagem(
  c: CondicoesHospedagem,
  usuarioId: string
): Promise<{ erro?: string }> {
  const admin = await createAdminClient()
  const { error } = await admin.from("hospedagem_condicoes").upsert(
    {
      emp_proprietaria_id: await tenantAtual(),
      restringir_fontes: c.restringirFontes,
      fontes_ids: c.fontesIds,
      limitar_quantidade: c.limitarQuantidade,
      quantidade_maxima: c.quantidadeMaxima,
      quantidade_periodo: c.quantidadePeriodo,
      restringir_regimes: c.restringirRegimes,
      regimes: c.regimes,
      somente_beneficiarios: c.somenteBeneficiarios,
      observacao: c.observacao,
      atualizada_por: usuarioId,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "emp_proprietaria_id" }
  )
  if (error) return { erro: faltaTabela(error) ? AVISO_SQL : error.message }
  return {}
}

async function nomesDasFontes(ids: string[]): Promise<Map<string, string>> {
  if (ids.length === 0) return new Map()
  const admin = await createAdminClient()
  const { data } = await admin
    .from("empresa")
    .select("id, nome_fantasia, nome_razao")
    .in("id", ids)
  return new Map(
    (data ?? []).map((e) => [
      e.id as string,
      (e.nome_fantasia as string | null) ??
        (e.nome_razao as string | null) ??
        "fonte sem nome",
    ])
  )
}

// ── Lista de beneficiários ───────────────────────────────────────────────────

export type BeneficiarioHospedagem = {
  id: string
  cpf: string
  nome: string | null
  observacao: string | null
  criadoEm: string
}

export async function listarBeneficiariosHospedagem(): Promise<
  BeneficiarioHospedagem[]
> {
  const admin = await createAdminClient()
  const { data, error } = await admin
    .from("hospedagem_beneficiarios")
    .select("id, cpf, nome, observacao, created_at")
    .eq("emp_proprietaria_id", await tenantAtual())
    .order("nome", { ascending: true, nullsFirst: false })
  if (error) return []
  return (data ?? []).map((b) => ({
    id: b.id as string,
    cpf: b.cpf as string,
    nome: (b.nome as string | null) ?? null,
    observacao: (b.observacao as string | null) ?? null,
    criadoEm: b.created_at as string,
  }))
}

export async function incluirBeneficiarioHospedagem(dados: {
  cpf: string
  observacao: string | null
  usuarioId: string
}): Promise<{ erro?: string; nome?: string | null }> {
  const filiado = await buscarFiliadoPorCpf(dados.cpf)
  if (!filiado) {
    return { erro: "CPF não encontrado entre os filiados desta entidade." }
  }
  const admin = await createAdminClient()
  const { error } = await admin.from("hospedagem_beneficiarios").insert({
    emp_proprietaria_id: await tenantAtual(),
    cpf: dados.cpf,
    nome: filiado.nome_completo,
    observacao: dados.observacao,
    incluido_por: dados.usuarioId,
  })
  if (error) {
    if (error.code === "23505") return { erro: "Esta pessoa já está na lista." }
    return { erro: faltaTabela(error) ? AVISO_SQL : error.message }
  }
  return { nome: filiado.nome_completo }
}

export async function removerBeneficiarioHospedagem(
  id: string
): Promise<{ erro?: string }> {
  const admin = await createAdminClient()
  const { error } = await admin
    .from("hospedagem_beneficiarios")
    .delete()
    .eq("id", id)
    .eq("emp_proprietaria_id", await tenantAtual())
  return error ? { erro: error.message } : {}
}

// ── Conferência e exibição ───────────────────────────────────────────────────

/**
 * Confere as condições da entidade para um cupom. `registros` são todos os
 * registros de filiação da pessoa (um por vínculo): vínculos e cupons contam
 * por PESSOA, não por registro.
 */
export async function conferirCondicoesHospedagem(p: {
  cpf: string | null
  registros: string[]
  checkIn: string
}): Promise<{ erro?: string }> {
  const c = await lerCondicoesHospedagem()
  if (contarCondicoesAtivas(c) === 0) return {}

  const admin = await createAdminClient()
  const emp = await tenantAtual()
  const registros = p.registros

  const lerVinculosAbertos = async () => {
    if (!(c.restringirFontes || c.restringirRegimes) || registros.length === 0) {
      return []
    }
    const { data } = await admin
      .from("filiacao_vinculos")
      .select("fonte_pagadora_id, regime_trabalho")
      .in("filiado_id", registros)
      .eq("emp_proprietaria_id", emp)
      .is("data_desfiliacao", null)
      .is("filiacao_data_saida", null)
    return (data ?? []).map((v) => ({
      fonteId: (v.fonte_pagadora_id as string | null) ?? null,
      regime: (v.regime_trabalho as string | null) ?? null,
    }))
  }

  const contarCuponsNoPeriodo = async () => {
    if (!c.limitarQuantidade || registros.length === 0) return 0
    const janela = janelaDoPeriodo(p.checkIn, c.quantidadePeriodo)
    const { count } = await admin
      .from("hospedagem_cupom")
      .select("id", { count: "exact", head: true })
      .in("filiado_id", registros)
      .eq("cancelado", false)
      .gte("check_in", janela.inicio)
      .lt("check_in", janela.fim)
    return count ?? 0
  }

  const estaNaLista = async () => {
    if (!c.somenteBeneficiarios || !p.cpf) return false
    const { data } = await admin
      .from("hospedagem_beneficiarios")
      .select("id")
      .eq("emp_proprietaria_id", emp)
      .eq("cpf", p.cpf)
      .limit(1)
      .maybeSingle()
    return Boolean(data)
  }

  const [vinculosAbertos, cuponsNoPeriodo, naListaDeBeneficiarios, nomes] =
    await Promise.all([
      lerVinculosAbertos(),
      contarCuponsNoPeriodo(),
      estaNaLista(),
      nomesDasFontes(c.restringirFontes ? c.fontesIds : []),
    ])

  const resultado = avaliarCondicoesHospedagem(
    c,
    { vinculosAbertos, cuponsNoPeriodo, naListaDeBeneficiarios },
    (id) => nomes.get(id) ?? "fonte sem nome"
  )
  return resultado.ok ? {} : { erro: resultado.motivo }
}

/** Regras configuradas, em frases, para o portal (Hospedagem). */
export async function regrasDeUtilizacaoHospedagem(): Promise<{
  configuradas: string[]
  observacao: string | null
}> {
  const c = await lerCondicoesHospedagem()
  const nomes = await nomesDasFontes(c.restringirFontes ? c.fontesIds : [])
  return {
    configuradas: descreverCondicoesHospedagem(
      c,
      (id) => nomes.get(id) ?? "fonte sem nome"
    ),
    observacao: c.observacao,
  }
}
