import "server-only"

import { pixCodigoValido } from "@/lib/compras-constantes"
import { SITUACOES_SEM_VALOR, valorDaCompraSuspeito } from "@/lib/compras-valor-regras"
import { registrarEvento, SITUACOES_ENCERRADAS } from "@/lib/db/ordens-ciclo"
import { createAdminClient } from "@/lib/supabase/admin"
import { tenantAtual } from "@/lib/tenant"

/**
 * Ajustes do pagamento de um processo de compra, depois de gerada a ordem:
 *  - NOVO CÓDIGO PIX: o copia e cola (QR Code) expira; troca-se o da ordem
 *    enquanto ela não foi paga.
 *  - NOTA FISCAL DA COMPRA (do fornecimento) e NOTA DO PAGAMENTO (da ordem,
 *    ex.: uma cobrança à parte): incluir ou trocar, mesmo com a ordem paga —
 *    a nota costuma chegar depois.
 * Tudo fica na trilha da ordem (evento "corrigida", com o que mudou).
 */

const FORMA_QR = "Pix (QR Code)"

type OrdemDoAjuste = {
  id: string
  situacao: string | null
  forma_pagamento: string | null
  arquivo_nota_fiscal: string | null
  processo_compra_id: string | null
}

/** A ordem existe, é do tenant e é deste processo de compra. */
async function ordemDoProcesso(ordemId: string, processoId: string): Promise<OrdemDoAjuste | null> {
  const admin = await createAdminClient()
  const { data } = await admin
    .from("ordens_pagamento")
    .select("id, situacao, forma_pagamento, arquivo_nota_fiscal, processo_compra_id")
    .eq("id", ordemId)
    .eq("emp_proprietaria_id", await tenantAtual())
    .not("excluido", "is", true)
    .maybeSingle()
  if (!data || data.processo_compra_id !== processoId) return null
  return data as OrdemDoAjuste
}

/** Substitui o código Pix copia e cola de uma ordem ainda não paga. */
export async function trocarCodigoPix(
  processoId: string,
  ordemId: string,
  codigoBruto: string,
  usuarioId: string
): Promise<{ erro?: string }> {
  const codigo = codigoBruto.replace(/\s/g, "")
  if (!pixCodigoValido(codigo)) {
    return { erro: "Cole o código Pix copia e cola completo (começa com 000201)." }
  }
  const ordem = await ordemDoProcesso(ordemId, processoId)
  if (!ordem) return { erro: "Ordem não encontrada neste processo." }
  if (SITUACOES_ENCERRADAS.includes(String(ordem.situacao))) {
    return { erro: `A ordem está "${ordem.situacao}" — não há pagamento a fazer com um código novo.` }
  }
  if (ordem.forma_pagamento !== FORMA_QR) {
    return { erro: `A forma de pagamento desta ordem é "${ordem.forma_pagamento ?? "—"}", não Pix por código (QR Code).` }
  }
  const admin = await createAdminClient()
  const { error } = await admin
    .from("ordens_pagamento")
    .update({ pix_codigo: codigo })
    .eq("id", ordemId)
    .not("situacao", "in", `(${SITUACOES_ENCERRADAS.map((s) => `"${s}"`).join(",")})`)
  if (error) return { erro: `Não foi possível salvar o código: ${error.message}` }
  await registrarEvento(ordemId, "corrigida", usuarioId, "Novo código Pix (o anterior expirou ou foi substituído).", {
    campo: "pix_codigo",
  })
  return {}
}

/** Inclui ou troca a nota fiscal da ORDEM (a do pagamento). */
export async function trocarNotaDaOrdem(
  processoId: string,
  ordemId: string,
  caminho: string,
  usuarioId: string
): Promise<{ erro?: string }> {
  const ordem = await ordemDoProcesso(ordemId, processoId)
  if (!ordem) return { erro: "Ordem não encontrada neste processo." }
  const admin = await createAdminClient()
  const { error } = await admin.from("ordens_pagamento").update({ arquivo_nota_fiscal: caminho }).eq("id", ordemId)
  if (error) return { erro: `Não foi possível salvar a nota: ${error.message}` }
  await registrarEvento(
    ordemId,
    "corrigida",
    usuarioId,
    ordem.arquivo_nota_fiscal ? "Nota fiscal do pagamento substituída." : "Nota fiscal do pagamento incluída.",
    { campo: "arquivo_nota_fiscal", antes: ordem.arquivo_nota_fiscal, depois: caminho }
  )
  return {}
}

/**
 * Inclui ou troca a nota fiscal da COMPRA (do fornecimento). A ordem do
 * fornecimento acompanha quando usava a mesma nota (ou nenhuma) — é o padrão
 * da compra; se a ordem tem nota própria, fica com a dela.
 */
export async function trocarNotaDaCompra(
  processoId: string,
  fornecimentoId: string,
  caminho: string,
  usuarioId: string
): Promise<{ erro?: string }> {
  const admin = await createAdminClient()
  const { data: f } = await admin
    .from("compras_fornecimentos")
    .select("id, processo_id, nota_fiscal_url, ordem_pagamento_id")
    .eq("id", fornecimentoId)
    .maybeSingle()
  if (!f || f.processo_id !== processoId) return { erro: "Fornecimento não encontrado neste processo." }
  const anterior = (f.nota_fiscal_url as string | null) ?? null

  const { error } = await admin
    .from("compras_fornecimentos")
    // Compra em marketplace: com a nota, sai de Notas a receber.
    .update({ nota_fiscal_url: caminho, nota_a_receber: false, updated_at: new Date().toISOString() })
    .eq("id", fornecimentoId)
  if (error) return { erro: `Não foi possível salvar a nota: ${error.message}` }

  // Aquisição direta guarda a mesma nota como comprovante do processo.
  await admin
    .from("compras_solicitacoes")
    .update({ comprovante_url: caminho })
    .eq("id", processoId)
    .eq("comprado", true)
    .or(anterior ? `comprovante_url.is.null,comprovante_url.eq."${anterior}"` : "comprovante_url.is.null")

  if (f.ordem_pagamento_id) {
    const ordem = await ordemDoProcesso(String(f.ordem_pagamento_id), processoId)
    if (ordem && (!ordem.arquivo_nota_fiscal || ordem.arquivo_nota_fiscal === anterior)) {
      await admin.from("ordens_pagamento").update({ arquivo_nota_fiscal: caminho }).eq("id", ordem.id)
      await registrarEvento(
        ordem.id,
        "corrigida",
        usuarioId,
        anterior ? "Nota fiscal da compra substituída." : "Nota fiscal da compra incluída.",
        { campo: "arquivo_nota_fiscal", antes: anterior, depois: caminho }
      )
    }
  }
  return {}
}

// ── Valor da compra fora da escala (23/11/2026) ──────────────────────────────

/**
 * Valor das ordens válidas (sem canceladas, estornadas e excluídas) de um
 * processo de compra, e o motivo para desconfiar do valor da compra (null:
 * está na escala).
 */
export async function valorDaCompraFrenteAsOrdens(
  processoId: string
): Promise<{ valorCompra: number; valorOrdens: number; ordemIds: string[]; motivo: string | null } | null> {
  const admin = await createAdminClient()
  const emp = await tenantAtual()
  const [{ data: proc }, { data: ordens }] = await Promise.all([
    admin.from("compras_solicitacoes").select("id, compra_valor").eq("id", processoId).eq("emp_proprietaria_id", emp).maybeSingle(),
    admin
      .from("ordens_pagamento")
      .select("id, valor_inicial_cobranca, situacao")
      .eq("processo_compra_id", processoId)
      .eq("emp_proprietaria_id", emp)
      .not("excluido", "is", true),
  ])
  if (!proc) return null
  const validas = (ordens ?? []).filter((o) => !SITUACOES_SEM_VALOR.includes(String(o.situacao ?? "")))
  const valorCompra = Number(proc.compra_valor ?? 0)
  const valorOrdens = Math.round(validas.reduce((s, o) => s + Number(o.valor_inicial_cobranca ?? 0), 0) * 100) / 100
  return {
    valorCompra,
    valorOrdens,
    ordemIds: validas.map((o) => String(o.id)),
    motivo: valorDaCompraSuspeito(valorCompra, valorOrdens),
  }
}

/**
 * O Financeiro corrigiu o valor de uma ordem da compra (Corrigir ordem,
 * 24/11/2026): a compra, a proposta escolhida e o fornecimento da ordem andam
 * a mesma diferença — senão os indicadores de Aquisição seguem com o valor
 * digitado errado. Só mexe no que batia com o valor antigo (proposta) ou que
 * tem valor (compra, fornecimento); a trilha fica na ordem (evento da correção).
 */
export async function refletirValorDaOrdemNaCompra(dados: {
  processoId: string
  fornecimentoId: string | null
  antes: number
  depois: number
}): Promise<void> {
  const diferenca = Math.round((dados.depois - dados.antes) * 100) / 100
  if (!diferenca) return
  const admin = await createAdminClient()
  const emp = await tenantAtual()
  const somar = (v: unknown) => Math.round((Number(v) + diferenca) * 100) / 100
  const { data: proc } = await admin
    .from("compras_solicitacoes")
    .select("compra_valor, cotacao_proposta_id")
    .eq("id", dados.processoId)
    .eq("emp_proprietaria_id", emp)
    .maybeSingle()
  if (!proc) return
  const compraAntes = proc.compra_valor === null ? null : Number(proc.compra_valor)
  if (compraAntes !== null && somar(compraAntes) > 0) {
    await admin
      .from("compras_solicitacoes")
      .update({ compra_valor: somar(compraAntes), updated_at: new Date().toISOString() })
      .eq("id", dados.processoId)
      .eq("compra_valor", compraAntes)
    if (proc.cotacao_proposta_id) {
      await admin
        .from("compras_propostas")
        .update({ valor_proposta: somar(compraAntes) })
        .eq("id", proc.cotacao_proposta_id)
        .eq("valor_proposta", compraAntes)
    }
  }
  if (dados.fornecimentoId) {
    const { data: f } = await admin.from("compras_fornecimentos").select("valor").eq("id", dados.fornecimentoId).maybeSingle()
    if (f?.valor !== null && f?.valor !== undefined && somar(f.valor) > 0) {
      await admin
        .from("compras_fornecimentos")
        .update({ valor: somar(f.valor) })
        .eq("id", dados.fornecimentoId)
        .eq("valor", f.valor)
    }
  }
}

/**
 * Corrige o valor da compra (e da proposta escolhida e do fornecimento único,
 * quando repetem o valor errado) para o valor das ordens — o que de fato foi
 * pago ou está a pagar. Só quando a conta acusa o valor fora da escala; fica
 * na trilha das ordens.
 */
export async function usarValorDasOrdens(processoId: string, usuarioId: string): Promise<{ erro?: string; valor?: number }> {
  const conta = await valorDaCompraFrenteAsOrdens(processoId)
  if (!conta) return { erro: "Compra não encontrada." }
  if (!conta.motivo) return { erro: "O valor da compra já está na escala das ordens — nada a corrigir." }
  const admin = await createAdminClient()
  const emp = await tenantAtual()
  const { valorCompra: antes, valorOrdens: depois } = conta

  const { data: proc } = await admin
    .from("compras_solicitacoes")
    .select("cotacao_proposta_id")
    .eq("id", processoId)
    .eq("emp_proprietaria_id", emp)
    .maybeSingle()
  if (proc?.cotacao_proposta_id) {
    await admin
      .from("compras_propostas")
      .update({ valor_proposta: depois })
      .eq("id", proc.cotacao_proposta_id)
      .eq("valor_proposta", antes)
  }
  const { data: fornecimentos } = await admin
    .from("compras_fornecimentos")
    .select("id, valor")
    .eq("processo_id", processoId)
    .eq("emp_proprietaria_id", emp)
  if ((fornecimentos ?? []).length === 1 && Number(fornecimentos![0].valor ?? 0) === antes) {
    await admin.from("compras_fornecimentos").update({ valor: depois }).eq("id", fornecimentos![0].id)
  }
  const { data: gravada, error } = await admin
    .from("compras_solicitacoes")
    .update({ compra_valor: depois, updated_at: new Date().toISOString() })
    .eq("id", processoId)
    .eq("emp_proprietaria_id", emp)
    .eq("compra_valor", antes)
    .select("id")
  if (error) return { erro: `Não foi possível corrigir: ${error.message}` }
  if (!gravada?.length) return { erro: "O valor da compra mudou enquanto você olhava — recarregue a página." }

  const brl = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })
  await registrarEvento(
    conta.ordemIds,
    "corrigida",
    usuarioId,
    `Valor da compra corrigido de ${brl(antes)} para ${brl(depois)}, o das ordens (estava fora da escala).`,
    // A ordem não mudou: nada a reavaliar na auditoria.
    { compra_valor: { antes, depois }, reavaliada: true }
  )
  return { valor: depois }
}
