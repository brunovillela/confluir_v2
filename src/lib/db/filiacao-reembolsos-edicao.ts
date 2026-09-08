import "server-only"

import { gerarCodigoProcesso } from "@/lib/db/compras"
import { hojeSP, texto } from "@/lib/db/comum"
import { invalidarCacheProntuarios } from "@/lib/db/prontuario"
import { formatarMoeda } from "@/lib/formato"
import { createAdminClient } from "@/lib/supabase/admin"
import { tenantAtual } from "@/lib/tenant"

/**
 * Lançamento de reembolsos a filiados — o reembolso por participação
 * (reunião, ato, assembleia) que a entidade paga ao associado.
 *
 * Cada lançamento gera, no mesmo ato, a ordem de pagamento no Financeiro
 * (tipo "Reembolso", "Em autorização" — a autorização é sempre humana, pela
 * alçada) e um apontamento no prontuário do filiado. O valor vem da
 * configuração; o centro de custo também. Quando a entidade liga o teto
 * mensal, o lançamento que estoura o teto é recusado.
 *
 * Leitura no perfil do filiado: `filiacao-reembolsos.ts`.
 */

export type ReembolsoLinha = {
  id: string
  data: string | null
  justificativa: string | null
  valor: number | null
  filiadoId: string | null
  filiadoNome: string | null
  filiadoCpf: string | null
  projetoId: string | null
  projeto: string | null
  prontuarioId: string | null
  ordem: {
    id: string
    codigo: string | null
    situacao: string | null
    valor_pago: number | null
    data_pagamento: string | null
    excluido: boolean | null
  } | null
}

export type FiltroReembolsos = {
  busca?: string
  de?: string
  ate?: string
  situacao?: "pendentes" | "pagos" | "todos"
  filiadoId?: string
  pagina?: number
}

export type ConfigReembolsoCompleta = {
  valorReembolso: number | null
  centroCustoId: string | null
  orcamentoLimite: boolean
  orcamentoMensal: number | null
}

export type DadosReembolso = {
  filiadoId: string
  data: string
  justificativa: string
  projetoId: string | null
  valor: number
}

type Resultado = { ok: true; id: string } | { erro: string }

export const POR_PAGINA = 50

const SELECT_LINHA =
  "id, data, justificativa, valor, filiado_id, projeto_id, prontuario_id, filiado:filiado_id(nome_completo, cpf), projeto:projeto_id(descricao_sumaria, descricao), ordem:ordem_pagamento_id(id, codigo, situacao, valor_pago, data_pagamento, excluido)"

const um = <T,>(v: T | T[] | null): T | null => (Array.isArray(v) ? (v[0] ?? null) : v)

function paraLinha(r: Record<string, unknown>): ReembolsoLinha {
  const filiado = um(r.filiado as Record<string, string | null> | Record<string, string | null>[] | null)
  const projeto = um(r.projeto as Record<string, string | null> | Record<string, string | null>[] | null)
  const ordem = um(r.ordem as ReembolsoLinha["ordem"] | ReembolsoLinha["ordem"][] | null)
  return {
    id: r.id as string,
    data: (r.data as string | null) ?? null,
    justificativa: (r.justificativa as string | null) ?? null,
    valor: typeof r.valor === "number" ? r.valor : r.valor ? Number(r.valor) : null,
    filiadoId: (r.filiado_id as string | null) ?? null,
    filiadoNome: filiado?.nome_completo ?? null,
    filiadoCpf: filiado?.cpf ?? null,
    projetoId: (r.projeto_id as string | null) ?? null,
    projeto: projeto?.descricao_sumaria ?? projeto?.descricao ?? null,
    prontuarioId: (r.prontuario_id as string | null) ?? null,
    ordem: ordem ?? null,
  }
}

// ── Leitura ────────────────────────────────────────────────────────────────

export async function listarReembolsos(
  filtro: FiltroReembolsos = {}
): Promise<{ linhas: ReembolsoLinha[]; total: number }> {
  const admin = await createAdminClient()
  const emp = await tenantAtual()
  const pagina = Math.max(1, filtro.pagina ?? 1)

  let q = admin
    .from("filiacao_reembolsos")
    .select(SELECT_LINHA, { count: "exact" })
    .eq("emp_proprietaria_id", emp)
  if (filtro.filiadoId) q = q.eq("filiado_id", filtro.filiadoId)
  if (filtro.de) q = q.gte("data", filtro.de)
  if (filtro.ate) q = q.lte("data", filtro.ate)
  if (filtro.situacao === "pagos") q = q.eq("ordem.situacao", "Paga")
  if (filtro.situacao === "pendentes") q = q.neq("ordem.situacao", "Paga")

  const busca = (filtro.busca ?? "").trim()
  if (busca) {
    const digitos = busca.replace(/\D/g, "")
    q = digitos.length >= 3
      ? q.or(`cpf.ilike.%${digitos}%,nome_completo.ilike.%${busca}%`, { referencedTable: "filiado" })
      : q.ilike("filiado.nome_completo", `%${busca}%`)
    q = q.not("filiado", "is", null)
  }
  if (filtro.situacao === "pagos" || filtro.situacao === "pendentes") q = q.not("ordem", "is", null)

  const { data, error, count } = await q
    .order("data", { ascending: false, nullsFirst: false })
    .order("created_at", { ascending: false })
    .range((pagina - 1) * POR_PAGINA, pagina * POR_PAGINA - 1)
  if (error) {
    if (/does not exist|schema cache/i.test(error.message)) return { linhas: [], total: 0 }
    throw new Error(`Falha ao listar reembolsos: ${error.message}`)
  }
  return { linhas: (data ?? []).map((r) => paraLinha(r as Record<string, unknown>)), total: count ?? 0 }
}

export async function obterReembolso(id: string): Promise<ReembolsoLinha | null> {
  const admin = await createAdminClient()
  const emp = await tenantAtual()
  const { data } = await admin
    .from("filiacao_reembolsos")
    .select(SELECT_LINHA)
    .eq("emp_proprietaria_id", emp)
    .eq("id", id)
    .maybeSingle()
  return data ? paraLinha(data as Record<string, unknown>) : null
}

export async function configReembolsoCompleta(): Promise<ConfigReembolsoCompleta> {
  const admin = await createAdminClient()
  const emp = await tenantAtual()
  const { data } = await admin
    .from("filiacao_reembolsos_config")
    .select("valor_reembolso, centro_custo_id, orcamento_limite, orcamento_mensal")
    .eq("emp_proprietaria_id", emp)
    .maybeSingle()
  return {
    valorReembolso: data?.valor_reembolso != null ? Number(data.valor_reembolso) : null,
    centroCustoId: (data?.centro_custo_id as string | null) ?? null,
    orcamentoLimite: data?.orcamento_limite === true,
    orcamentoMensal: data?.orcamento_mensal != null ? Number(data.orcamento_mensal) : null,
  }
}

/** Quanto já foi lançado no mês da data (para o teto mensal e para o resumo da tela). */
export async function lancadoNoMes(dataRef: string): Promise<{ total: number; quantidade: number }> {
  const admin = await createAdminClient()
  const emp = await tenantAtual()
  const [ano, mes] = dataRef.slice(0, 7).split("-").map(Number)
  const inicio = `${ano}-${String(mes).padStart(2, "0")}-01`
  const fimDate = new Date(Date.UTC(ano, mes, 0))
  const fim = fimDate.toISOString().slice(0, 10)
  const { data } = await admin
    .from("filiacao_reembolsos")
    .select("valor")
    .eq("emp_proprietaria_id", emp)
    .gte("data", inicio)
    .lte("data", fim)
  let total = 0
  for (const r of data ?? []) total += Number(r.valor ?? 0)
  return { total, quantidade: (data ?? []).length }
}

// ── Lançamento ─────────────────────────────────────────────────────────────

export async function criarReembolso(dados: DadosReembolso, atorId: string): Promise<Resultado> {
  const admin = await createAdminClient()
  const emp = await tenantAtual()

  const { data: filiado } = await admin
    .from("filiacoes")
    .select("id, nome_completo, cpf")
    .eq("emp_proprietaria_id", emp)
    .eq("id", dados.filiadoId)
    .maybeSingle()
  if (!filiado) return { erro: "Filiado não encontrado." }
  const nome = texto(filiado.nome_completo) ?? "Filiado"
  const cpf = (texto(filiado.cpf) ?? "").replace(/\D/g, "") || null

  const config = await configReembolsoCompleta()
  if (config.orcamentoLimite && config.orcamentoMensal != null) {
    const { total } = await lancadoNoMes(dados.data)
    if (total + dados.valor > config.orcamentoMensal) {
      return {
        erro: `O teto mensal de ${formatarMoeda(config.orcamentoMensal)} seria ultrapassado: já há ${formatarMoeda(total)} lançados neste mês.`,
      }
    }
  }

  // Favorecido: quem tem login entra pela conta; senão, avulso por nome e CPF.
  let usuarioId: string | null = null
  if (cpf) {
    const { data: u } = await admin
      .from("usuarios")
      .select("id")
      .eq("emp_proprietaria_id", emp)
      .eq("cpf", cpf)
      .limit(1)
      .maybeSingle()
    usuarioId = u ? String(u.id) : null
  }

  // Pix do filiado, se a entidade guarda: já vai na ordem, para o Financeiro
  // não pedir de novo.
  const { data: bancos } = await admin
    .from("dados_bancarios")
    .select("pix, favorito, prefere_pix")
    .eq("emp_proprietaria_id", emp)
    .eq("filiado_id", filiado.id)
    .not("pix", "is", null)
    .order("favorito", { ascending: false })
    .limit(1)
  const pix = texto(bancos?.[0]?.pix)

  const descricaoOrdem = `Reembolso de participação — ${nome} — ${dados.justificativa}`
  const { data: ordem, error: erroOrdem } = await admin
    .from("ordens_pagamento")
    .insert({
      codigo: gerarCodigoProcesso(),
      tipo: "Reembolso",
      descricao: descricaoOrdem,
      situacao: "Em autorização",
      valor_inicial_cobranca: dados.valor,
      vencimento: hojeSP(),
      forma_pagamento: pix ? "Pix" : null,
      pix_codigo: pix,
      beneficiario_usuario_id: usuarioId,
      beneficiario_nome_avulso: usuarioId ? null : nome,
      beneficiario_doc_avulso: usuarioId ? null : cpf,
      centro_custo_despesa_id: config.centroCustoId,
      projeto_id: dados.projetoId,
      excluido: false,
      emp_proprietaria_id: emp,
    })
    .select("id")
    .single()
  if (erroOrdem || !ordem) {
    return { erro: `Não foi possível gerar a ordem de pagamento: ${erroOrdem?.message}` }
  }

  const agora = new Date().toISOString()
  const { data: apontamento } = await admin
    .from("filiacao_prontuario")
    .insert({
      filiacao_id: filiado.id,
      data: `${dados.data}T12:00:00-03:00`,
      tipo: "Reembolso",
      descricao: `Reembolso de participação de ${formatarMoeda(dados.valor)} — ${dados.justificativa}`,
      diretor_funcionario_id: atorId,
      emp_proprietaria_id: emp,
      created_at: agora,
      modified_at: agora,
    })
    .select("id")
    .maybeSingle()

  const { data, error } = await admin
    .from("filiacao_reembolsos")
    .insert({
      filiado_id: filiado.id,
      data: dados.data,
      justificativa: dados.justificativa,
      valor: dados.valor,
      ordem_pagamento_id: ordem.id,
      projeto_id: dados.projetoId,
      prontuario_id: apontamento?.id ?? null,
      criado_por: atorId,
      emp_proprietaria_id: emp,
    })
    .select("id")
    .single()
  if (error || !data) {
    // Sem o reembolso, a ordem e o apontamento seriam órfãos.
    await admin.from("ordens_pagamento").delete().eq("id", ordem.id).eq("emp_proprietaria_id", emp)
    if (apontamento?.id) {
      await admin.from("filiacao_prontuario").delete().eq("id", apontamento.id).eq("emp_proprietaria_id", emp)
    }
    return { erro: `Não foi possível lançar o reembolso: ${error?.message}` }
  }
  invalidarCacheProntuarios()
  return { ok: true, id: data.id as string }
}

/**
 * Edita data, justificativa, projeto e valor. Com a ordem já paga, só
 * justificativa e projeto mudam — o dinheiro saiu, o valor e a data ficam.
 */
export async function atualizarReembolso(
  id: string,
  dados: Omit<DadosReembolso, "filiadoId">
): Promise<Resultado> {
  const admin = await createAdminClient()
  const emp = await tenantAtual()
  const atual = await obterReembolso(id)
  if (!atual) return { erro: "Reembolso não encontrado." }
  const paga = atual.ordem?.situacao === "Paga"

  const registro: Record<string, unknown> = {
    justificativa: dados.justificativa,
    projeto_id: dados.projetoId,
    updated_at: new Date().toISOString(),
  }
  if (!paga) {
    registro.data = dados.data
    registro.valor = dados.valor
  }
  const { error } = await admin
    .from("filiacao_reembolsos")
    .update(registro)
    .eq("emp_proprietaria_id", emp)
    .eq("id", id)
  if (error) return { erro: `Não foi possível salvar: ${error.message}` }

  if (atual.ordem && !atual.ordem.excluido) {
    const ordem: Record<string, unknown> = {
      descricao: `Reembolso de participação — ${atual.filiadoNome ?? "Filiado"} — ${dados.justificativa}`,
      projeto_id: dados.projetoId,
    }
    if (!paga) ordem.valor_inicial_cobranca = dados.valor
    await admin.from("ordens_pagamento").update(ordem).eq("emp_proprietaria_id", emp).eq("id", atual.ordem.id)
  }
  if (atual.prontuarioId) {
    await admin
      .from("filiacao_prontuario")
      .update({
        descricao: `Reembolso de participação de ${formatarMoeda(paga ? (atual.valor ?? dados.valor) : dados.valor)} — ${dados.justificativa}`,
        modified_at: new Date().toISOString(),
      })
      .eq("emp_proprietaria_id", emp)
      .eq("id", atual.prontuarioId)
    invalidarCacheProntuarios()
  }
  return { ok: true, id }
}

/** Desfaz um lançamento: a ordem é marcada excluída e o apontamento some. Ordem paga não se desfaz. */
export async function excluirReembolso(id: string): Promise<{ erro?: string }> {
  const admin = await createAdminClient()
  const emp = await tenantAtual()
  const atual = await obterReembolso(id)
  if (!atual) return { erro: "Reembolso não encontrado." }
  if (atual.ordem?.situacao === "Paga") {
    return { erro: "A ordem deste reembolso já foi paga. Um pagamento indevido se trata no Financeiro, não apagando o registro." }
  }
  const { error } = await admin
    .from("filiacao_reembolsos")
    .delete()
    .eq("emp_proprietaria_id", emp)
    .eq("id", id)
  if (error) return { erro: `Não foi possível excluir: ${error.message}` }
  if (atual.ordem && !atual.ordem.excluido) {
    await admin
      .from("ordens_pagamento")
      .update({ excluido: true })
      .eq("emp_proprietaria_id", emp)
      .eq("id", atual.ordem.id)
  }
  if (atual.prontuarioId) {
    await admin.from("filiacao_prontuario").delete().eq("emp_proprietaria_id", emp).eq("id", atual.prontuarioId)
    invalidarCacheProntuarios()
  }
  return {}
}

// ── Configuração ───────────────────────────────────────────────────────────

export async function salvarConfigReembolso(
  dados: ConfigReembolsoCompleta,
  atorId: string
): Promise<{ erro?: string }> {
  const admin = await createAdminClient()
  const emp = await tenantAtual()
  if (dados.centroCustoId) {
    const { data: cc } = await admin
      .from("centros_de_custo")
      .select("id")
      .eq("emp_proprietaria_id", emp)
      .eq("id", dados.centroCustoId)
      .maybeSingle()
    if (!cc) return { erro: "Centro de custo não encontrado." }
  }
  const { error } = await admin.from("filiacao_reembolsos_config").upsert(
    {
      emp_proprietaria_id: emp,
      valor_reembolso: dados.valorReembolso,
      centro_custo_id: dados.centroCustoId,
      orcamento_limite: dados.orcamentoLimite,
      orcamento_mensal: dados.orcamentoMensal,
      atualizada_por: atorId,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "emp_proprietaria_id" }
  )
  if (error) return { erro: `Não foi possível salvar: ${error.message}` }
  return {}
}
