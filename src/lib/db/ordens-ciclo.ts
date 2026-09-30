import "server-only"

import { getSessaoPainel } from "@/lib/auth"
import { esquemaAusente, hojeSP } from "@/lib/db/comum"
import { createAdminClient } from "@/lib/supabase/admin"
import { tenantAtual } from "@/lib/tenant"

/**
 * Ciclo de vida da ordem de pagamento (supabase/ordens-auditoria.sql):
 *
 *   Em autorização ──aprovar (alçada por VALOR, qualquer origem)──▶ A pagar ──pagar──▶ Paga
 *        │  ▲                                                        │
 *     devolver  reenviar                                        (sem pagamento)
 *        ▼  │                                                        ▼
 *   Aguardando informações                                   cancelar ▶ Cancelada
 *
 * Nascem JÁ AUTORIZADAS (autorização dispensada, com o motivo gravado) a folha
 * de pagamento e as parcelas ordinárias fixas de contrato — aprovadas na
 * assinatura. Compra paga em dinheiro sai do caixa no ato: ao ser autorizada,
 * a ordem é dada como paga pelo caixa (débito no centro de custo do caixa).
 * Paga com estorno do banco regride para Aguardando informações e volta pela
 * correção dos dados de pagamento (lib/db/ordens-estorno.ts).
 * Toda transição fica na trilha `ordens_pagamento_eventos`.
 */

export const SITUACAO_EM_AUTORIZACAO = "Em autorização"
export const SITUACAO_A_PAGAR = "A pagar"
export const SITUACAO_AGUARDANDO = "Aguardando informações"
/** Só estas podem receber o registro de pagamento. "Processando" é legado. */
export const SITUACOES_PAGAVEIS = [SITUACAO_A_PAGAR, "Processando"]
/** Encerradas: não se corrige nem se cancela. */
export const SITUACOES_ENCERRADAS = ["Paga", "Cancelada", "Estornado"]

export const MOTIVO_DISPENSA_FOLHA =
  "Autorização dispensada: folha de pagamento."

export function motivoDispensaContrato(codigo: string | null): string {
  return `Autorização dispensada: parcela ordinária de valor fixo prevista no contrato${
    codigo ? ` ${codigo}` : ""
  }, aprovado na assinatura.`
}

/**
 * Campos de autorização de uma ordem NOVA. Com `dispensa`, ela nasce "A pagar"
 * e o motivo fica registrado; sem, nasce "Em autorização" para a alçada.
 */
export function camposAutorizacaoInicial(dispensa: string | null) {
  if (!dispensa) return { situacao: SITUACAO_EM_AUTORIZACAO }
  return {
    situacao: SITUACAO_A_PAGAR,
    autorizacao_esta_autorizado: true,
    autorizacao_data: hojeSP(),
    autorizacao_observacao: dispensa,
    autorizacao_dispensada: true,
    autorizacao_dispensa_motivo: dispensa,
  }
}

/**
 * Usuário logado para a trilha — ou null fora de uma requisição do painel
 * (rotina agendada, script, portal do hotel): a trilha nunca derruba a origem.
 */
export async function usuarioDaTrilha(): Promise<string | null> {
  try {
    return (await getSessaoPainel())?.usuario.id ?? null
  } catch {
    return null
  }
}

// ── Trilha ──────────────────────────────────────────────────────────────────

export type TipoEvento =
  | "criada"
  | "verificada"
  | "autorizacao_dispensada"
  | "autorizada"
  | "devolvida"
  | "reenviada"
  | "paga"
  | "pagamento_removido"
  | "corrigida"
  | "cancelada"
  | "estornada"
  | "estorno_corrigido"

export const ROTULO_EVENTO: Record<TipoEvento, string> = {
  criada: "Criada",
  verificada: "Verificada pelas regras de auditoria",
  autorizacao_dispensada: "Autorização dispensada",
  autorizada: "Autorizada",
  devolvida: "Devolvida para informações",
  reenviada: "Reenviada para autorização",
  paga: "Pagamento registrado",
  pagamento_removido: "Pagamento removido",
  corrigida: "Corrigida",
  cancelada: "Cancelada",
  estornada: "Pagamento estornado",
  estorno_corrigido: "Dados de pagamento corrigidos após o estorno — reenviada para autorização",
}

/**
 * Grava eventos na trilha. Falha na trilha NUNCA desfaz a operação (só loga):
 * sem o SQL rodado, o sistema segue funcionando sem histórico.
 */
export async function registrarEvento(
  ordemIds: string | string[],
  tipo: TipoEvento,
  usuarioId: string | null,
  descricao: string | null,
  dados?: Record<string, unknown>
): Promise<void> {
  const ids = Array.isArray(ordemIds) ? ordemIds : [ordemIds]
  if (ids.length === 0) return
  const admin = await createAdminClient()
  const emp = await tenantAtual()
  const { error } = await admin.from("ordens_pagamento_eventos").insert(
    ids.map((ordem_id) => ({
      emp_proprietaria_id: emp,
      ordem_id,
      tipo,
      usuario_id: usuarioId,
      descricao,
      dados: dados ?? null,
    }))
  )
  if (error && !esquemaAusente(error)) {
    console.error("registrarEvento:", error.message)
  }
}

export type EventoOrdem = {
  id: string
  tipo: string
  rotulo: string
  usuario: string | null
  usuarioId: string | null
  descricao: string | null
  dados: Record<string, unknown> | null
  quando: string
}

export async function listarEventos(ordemId: string): Promise<EventoOrdem[]> {
  const admin = await createAdminClient()
  const { data, error } = await admin
    .from("ordens_pagamento_eventos")
    .select("id, tipo, usuario_id, descricao, dados, created_at")
    .eq("ordem_id", ordemId)
    .eq("emp_proprietaria_id", await tenantAtual())
    .order("created_at", { ascending: true })
  if (error) return []
  const linhas = (data ?? []) as Record<string, unknown>[]
  const ids = [...new Set(linhas.map((l) => l.usuario_id).filter(Boolean))] as string[]
  const nomes = new Map<string, string>()
  if (ids.length) {
    const { data: us } = await admin
      .from("usuarios")
      .select("id, nome_completo, nome_guerra")
      .in("id", ids)
    for (const u of us ?? []) {
      nomes.set(String(u.id), String(u.nome_completo ?? u.nome_guerra ?? "(sem nome)"))
    }
  }
  return linhas.map((l) => ({
    id: String(l.id),
    tipo: String(l.tipo),
    rotulo: ROTULO_EVENTO[l.tipo as TipoEvento] ?? String(l.tipo),
    usuarioId: (l.usuario_id as string | null) ?? null,
    usuario: l.usuario_id ? (nomes.get(String(l.usuario_id)) ?? null) : null,
    descricao: (l.descricao as string | null) ?? null,
    dados: (l.dados as Record<string, unknown> | null) ?? null,
    quando: String(l.created_at),
  }))
}

// ── Configuração do Financeiro ──────────────────────────────────────────────

export async function obterConfigFinanceiro(): Promise<{
  disponivel: boolean
  centroCustoCaixaId: string | null
}> {
  const admin = await createAdminClient()
  const { data, error } = await admin
    .from("financeiro_config")
    .select("centro_custo_caixa_id")
    .eq("emp_proprietaria_id", await tenantAtual())
    .maybeSingle()
  if (error) return { disponivel: false, centroCustoCaixaId: null }
  return {
    disponivel: true,
    centroCustoCaixaId: (data?.centro_custo_caixa_id as string | null) ?? null,
  }
}

export async function salvarConfigFinanceiro(
  centroCustoCaixaId: string | null
): Promise<{ erro?: string }> {
  const admin = await createAdminClient()
  const { error } = await admin.from("financeiro_config").upsert(
    {
      emp_proprietaria_id: await tenantAtual(),
      centro_custo_caixa_id: centroCustoCaixaId,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "emp_proprietaria_id" }
  )
  if (error) {
    if (esquemaAusente(error)) {
      return { erro: "Rode supabase/ordens-auditoria.sql antes de configurar." }
    }
    return { erro: `Não foi possível salvar: ${error.message}` }
  }
  return {}
}

// ── Avaliação (alçada por valor, qualquer origem) ──────────────────────────

/**
 * Aprova (→ A pagar) ou devolve (→ Aguardando informações) uma ordem Em
 * autorização. A alçada é pelo VALOR, independente da origem, e é reconferida
 * aqui. Compra paga em dinheiro: aprovada, é dada como paga pelo caixa.
 */
export async function avaliarOrdem(
  ordemId: string,
  avaliadorId: string,
  alcada: number,
  aprovar: boolean,
  observacao: string | null
): Promise<{ erro?: string }> {
  const admin = await createAdminClient()
  const emp = await tenantAtual()
  const { data: ordem } = await admin
    .from("ordens_pagamento")
    .select("id, situacao, valor_inicial_cobranca, caixa_conta_id, processo_compra_id")
    .eq("id", ordemId)
    .eq("emp_proprietaria_id", emp)
    .maybeSingle()
  if (!ordem) return { erro: "Ordem não encontrada." }
  if (ordem.situacao !== SITUACAO_EM_AUTORIZACAO) {
    return { erro: "A ordem não está em autorização." }
  }
  const valor = ordem.valor_inicial_cobranca as number | null
  if (aprovar && valor === null) {
    return {
      erro: "Esta ordem não tem valor definido — corrija o valor no Financeiro antes de aprovar.",
    }
  }
  if (aprovar && !(alcada > 0 && valor !== null && valor <= alcada)) {
    return { erro: "O valor desta ordem está acima da sua alçada de aprovação." }
  }
  if (!aprovar && !observacao?.trim()) {
    return { erro: "Informe o motivo da devolução." }
  }

  const { data, error } = await admin
    .from("ordens_pagamento")
    .update({
      situacao: aprovar ? SITUACAO_A_PAGAR : SITUACAO_AGUARDANDO,
      autorizacao_esta_autorizado: aprovar,
      autorizacao_autorizador_id: avaliadorId,
      // Coluna DATE no legado — gravar o dia de SP, não o ISO UTC.
      autorizacao_data: hojeSP(),
      autorizacao_observacao: observacao,
    })
    .eq("id", ordemId)
    .eq("situacao", SITUACAO_EM_AUTORIZACAO)
    .select("id")
  if (error) return { erro: `Não foi possível salvar a avaliação: ${error.message}` }
  if ((data ?? []).length === 0) {
    return { erro: "A ordem já foi avaliada por outra pessoa." }
  }
  await registrarEvento(
    ordemId,
    aprovar ? "autorizada" : "devolvida",
    avaliadorId,
    observacao,
    { valor, alcada }
  )

  if (aprovar && ordem.caixa_conta_id) {
    await pagarPeloCaixa(ordemId, valor as number, String(ordem.caixa_conta_id), ordem.processo_compra_id as string | null)
  }
  return {}
}

/**
 * Compra em dinheiro: o valor já saiu do caixa quando a compra foi lançada.
 * Autorizada, a ordem fecha como paga pelo caixa — nada sai do banco.
 */
async function pagarPeloCaixa(
  ordemId: string,
  valor: number,
  caixaId: string,
  processoId: string | null
): Promise<void> {
  const admin = await createAdminClient()
  const [{ centroCustoCaixaId }, processo, caixa] = await Promise.all([
    obterConfigFinanceiro(),
    processoId
      ? admin
          .from("compras_solicitacoes")
          .select("compra_data, comprado_por_id")
          .eq("id", processoId)
          .maybeSingle()
      : Promise.resolve({ data: null }),
    admin.from("caixa_contas").select("nome").eq("id", caixaId).maybeSingle(),
  ])
  const p = processo.data as { compra_data?: string | null; comprado_por_id?: string | null } | null
  const dataPagamento = p?.compra_data ?? hojeSP()
  const { error } = await admin
    .from("ordens_pagamento")
    .update({
      situacao: "Paga",
      valor_pago: valor,
      data_pagamento: dataPagamento,
      pagador_id: p?.comprado_por_id ?? null,
      centro_custo_receita_id: centroCustoCaixaId,
    })
    .eq("id", ordemId)
  if (error) {
    console.error("pagarPeloCaixa:", error.message)
    return
  }
  await registrarEvento(
    ordemId,
    "paga",
    null,
    `Paga em dinheiro pelo caixa "${caixa.data?.nome ?? "—"}" no ato da compra.`,
    { valor_pago: valor, data_pagamento: dataPagamento, caixa_conta_id: caixaId }
  )
}

/** Devolvida → volta para a fila de autorização, com o que foi complementado. */
export async function reenviarParaAutorizacao(
  ordemId: string,
  usuarioId: string,
  observacao: string
): Promise<{ erro?: string }> {
  if (!observacao.trim()) return { erro: "Diga o que foi complementado ou corrigido." }
  const admin = await createAdminClient()
  // Estornada: volta pela correção dos dados de pagamento, não por aqui.
  const { data: pendente } = await admin
    .from("ordens_pagamento_estornos")
    .select("id")
    .eq("ordem_id", ordemId)
    .is("resolvido_em", null)
    .maybeSingle()
  if (pendente) {
    return {
      erro: "O pagamento desta ordem foi estornado — confira os dados de pagamento pela tela do estorno, que reenvia para autorização.",
    }
  }
  const { data, error } = await admin
    .from("ordens_pagamento")
    .update({
      situacao: SITUACAO_EM_AUTORIZACAO,
      autorizacao_esta_autorizado: false,
      autorizacao_autorizador_id: null,
      autorizacao_data: null,
      autorizacao_observacao: null,
    })
    .eq("id", ordemId)
    .eq("emp_proprietaria_id", await tenantAtual())
    .eq("situacao", SITUACAO_AGUARDANDO)
    .select("id")
  if (error) return { erro: `Não foi possível reenviar: ${error.message}` }
  if ((data ?? []).length === 0) {
    return { erro: "A ordem não está aguardando informações." }
  }
  await registrarEvento(ordemId, "reenviada", usuarioId, observacao)
  return {}
}

/**
 * Cancela uma ordem ainda não paga. Compra em dinheiro: o débito do caixa é
 * cancelado junto (o saldo volta).
 */
export async function cancelarOrdem(
  ordemId: string,
  usuarioId: string,
  motivo: string
): Promise<{ erro?: string }> {
  if (!motivo.trim()) return { erro: "Informe o motivo do cancelamento." }
  const admin = await createAdminClient()
  const { data: ordem } = await admin
    .from("ordens_pagamento")
    .select("id, situacao, caixa_conta_id")
    .eq("id", ordemId)
    .eq("emp_proprietaria_id", await tenantAtual())
    .maybeSingle()
  if (!ordem) return { erro: "Ordem não encontrada." }
  if (SITUACOES_ENCERRADAS.includes(String(ordem.situacao))) {
    return {
      erro:
        ordem.situacao === "Paga"
          ? "A ordem está paga — remova o registro de pagamento antes de cancelar."
          : "A ordem já está encerrada.",
    }
  }
  const { error } = await admin
    .from("ordens_pagamento")
    .update({
      situacao: "Cancelada",
      cancelamento_motivo: motivo,
      cancelado_em: new Date().toISOString(),
      cancelado_por_id: usuarioId,
    })
    .eq("id", ordemId)
  if (error) {
    if (esquemaAusente(error)) {
      return { erro: "Rode supabase/ordens-auditoria.sql antes de cancelar ordens." }
    }
    return { erro: `Não foi possível cancelar: ${error.message}` }
  }
  let caixaEstornado = false
  if (ordem.caixa_conta_id) {
    const { data: movs } = await admin
      .from("caixa_movimentacoes")
      .update({ situacao: "cancelada" })
      .eq("ordem_pagamento_id", ordemId)
      .eq("situacao", "confirmada")
      .select("id")
    caixaEstornado = (movs ?? []).length > 0
  }
  // Estorno pendente se encerra com a ordem (ninguém mais precisa corrigir).
  await admin
    .from("ordens_pagamento_estornos")
    .update({
      resolvido_em: new Date().toISOString(),
      resolvido_por_id: usuarioId,
      resolucao: `Ordem cancelada: ${motivo}`,
    })
    .eq("ordem_id", ordemId)
    .is("resolvido_em", null)
  await registrarEvento(ordemId, "cancelada", usuarioId, motivo, {
    situacao_anterior: ordem.situacao,
    ...(caixaEstornado ? { debito_do_caixa: "cancelado" } : {}),
  })
  return {}
}

export type CorrecaoOrdem = {
  descricao: string | null
  valor: number | null
  vencimento: string | null
  centroCustoDespesaId: string | null
  formaPagamento: string | null
}

/**
 * Corrige dados de uma ordem ainda não paga, com motivo. Mudar o VALOR de uma
 * ordem autorizada (ou dispensada) a devolve para autorização — o que foi
 * aprovado era outro valor.
 */
export async function corrigirOrdem(
  ordemId: string,
  usuarioId: string,
  nova: CorrecaoOrdem,
  motivo: string
): Promise<{ erro?: string; voltouParaAutorizacao?: boolean }> {
  if (!motivo.trim()) return { erro: "Informe o motivo da correção." }
  const admin = await createAdminClient()
  const { data: o } = await admin
    .from("ordens_pagamento")
    .select(
      "id, situacao, descricao, valor_inicial_cobranca, vencimento, centro_custo_despesa_id, forma_pagamento, autorizacao_esta_autorizado, caixa_conta_id"
    )
    .eq("id", ordemId)
    .eq("emp_proprietaria_id", await tenantAtual())
    .maybeSingle()
  if (!o) return { erro: "Ordem não encontrada." }
  if (SITUACOES_ENCERRADAS.includes(String(o.situacao))) {
    return { erro: "Ordem paga ou encerrada não pode ser corrigida." }
  }
  if (nova.valor !== null && !(nova.valor > 0)) return { erro: "Valor inválido." }

  const antes: Record<string, unknown> = {}
  const depois: Record<string, unknown> = {}
  const mudancas: Record<string, unknown> = {}
  const campo = (coluna: string, atual: unknown, novo: unknown) => {
    if ((atual ?? null) === (novo ?? null)) return
    antes[coluna] = atual ?? null
    depois[coluna] = novo ?? null
    mudancas[coluna] = novo ?? null
  }
  campo("descricao", o.descricao, nova.descricao)
  campo("valor_inicial_cobranca", o.valor_inicial_cobranca === null ? null : Number(o.valor_inicial_cobranca), nova.valor)
  campo("vencimento", o.vencimento, nova.vencimento)
  campo("centro_custo_despesa_id", o.centro_custo_despesa_id, nova.centroCustoDespesaId)
  campo("forma_pagamento", o.forma_pagamento, nova.formaPagamento)
  if (Object.keys(mudancas).length === 0) return { erro: "Nada foi alterado." }

  const mudouValor = "valor_inicial_cobranca" in mudancas
  if (mudouValor && o.caixa_conta_id) {
    return {
      erro: "Compra paga em dinheiro: o valor saiu do caixa — corrija pelo cancelamento e novo lançamento.",
    }
  }
  const voltou =
    mudouValor && (o.autorizacao_esta_autorizado === true || o.situacao === SITUACAO_A_PAGAR)
  const { error } = await admin
    .from("ordens_pagamento")
    .update({
      ...mudancas,
      ...(voltou
        ? {
            situacao: SITUACAO_EM_AUTORIZACAO,
            autorizacao_esta_autorizado: false,
            autorizacao_autorizador_id: null,
            autorizacao_data: null,
            autorizacao_observacao: null,
            autorizacao_dispensada: false,
            autorizacao_dispensa_motivo: null,
          }
        : {}),
    })
    .eq("id", ordemId)
  if (error) return { erro: `Não foi possível corrigir: ${error.message}` }
  await registrarEvento(ordemId, "corrigida", usuarioId, motivo, {
    antes,
    depois,
    ...(voltou ? { voltou_para_autorizacao: true } : {}),
  })
  return { voltouParaAutorizacao: voltou }
}
