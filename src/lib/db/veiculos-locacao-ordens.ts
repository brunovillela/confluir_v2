import "server-only"
import { texto } from "@/lib/db/comum"
import { ordemMexivelPeloContrato } from "@/lib/db/contratos"
import { corrigirOrdem, registrarEvento, usuarioDaTrilha } from "@/lib/db/ordens-ciclo"
import { createAdminClient } from "@/lib/supabase/admin"
import { tenantAtual } from "@/lib/tenant"
import { TIPO_ORDEM_RPA } from "@/lib/rpa-calculo"

// Editar/excluir UMA cobrança pela tela do contrato de locação (Veículos), com
// as MESMAS travas do contrato de Compras (ordemMexivelPeloContrato): não paga,
// não em processamento bancário, não encerrada. Mora fora de veiculos.ts
// porque contratos.ts importa veiculos.ts.

async function ordemDaLocacao(contratoId: string, ordemId: string) {
  const admin = await createAdminClient()
  const { data: o, error } = await admin
    .from("ordens_pagamento")
    .select(
      "id, codigo, situacao, tipo, processo_compra_id, data_pagamento, contrato_aluguel_id, descricao, valor_inicial_cobranca, vencimento, centro_custo_despesa_id, forma_pagamento, autorizacao_esta_autorizado"
    )
    .eq("id", ordemId)
    .eq("emp_proprietaria_id", await tenantAtual())
    .not("excluido", "is", true)
    .maybeSingle()
  if (error) return { erro: `Falha ao carregar a ordem: ${error.message}` }
  if (!o || texto(o.contrato_aluguel_id) !== contratoId) {
    return { erro: "Ordem não encontrada neste contrato." }
  }
  if (!ordemMexivelPeloContrato(o as Parameters<typeof ordemMexivelPeloContrato>[0])) {
    return {
      erro: o.data_pagamento || o.situacao === "Paga"
        ? "A ordem já foi paga — ajustes só pelo Financeiro."
        : o.situacao === "Processando"
          ? "A ordem está em processamento bancário e não pode ser alterada."
          : o.processo_compra_id || o.tipo === TIPO_ORDEM_RPA
            ? "Esta ordem pertence a um processo de compra ou RPA — ajuste por lá."
            : "A ordem está encerrada.",
    }
  }
  return { ordem: o, admin }
}

/**
 * Edita descrição, valor e vencimento de uma cobrança da locação, com motivo,
 * pela correção do Financeiro (corrigirOrdem): o antes e o depois ficam no
 * histórico e mudar o valor de uma ordem já autorizada a devolve para
 * autorização.
 */
export async function editarOrdemAluguel(
  contratoId: string,
  ordemId: string,
  nova: { descricao: string | null; valor: number | null; vencimento: string | null },
  motivo: string
): Promise<{ erro?: string; voltouParaAutorizacao?: boolean }> {
  const r = await ordemDaLocacao(contratoId, ordemId)
  if ("erro" in r) return { erro: r.erro }
  const o = r.ordem
  const usuario = await usuarioDaTrilha()
  if (!usuario) return { erro: "Sessão expirada — entre de novo." }
  return corrigirOrdem(
    ordemId,
    usuario,
    {
      descricao: nova.descricao ?? texto(o.descricao) ?? null,
      valor:
        nova.valor ??
        (o.valor_inicial_cobranca === null || o.valor_inicial_cobranca === undefined
          ? null
          : Number(o.valor_inicial_cobranca)),
      vencimento: nova.vencimento ?? texto(o.vencimento)?.slice(0, 10) ?? null,
      centroCustoDespesaId: texto(o.centro_custo_despesa_id) ?? null,
      formaPagamento: texto(o.forma_pagamento) ?? null,
    },
    motivo
  )
}

/**
 * Exclui (marca `excluido`) UMA cobrança da locação ainda não paga nem em
 * processamento — inclusive já autorizada, caso em que o histórico registra
 * que a exclusão desfez uma autorização.
 */
export async function excluirOrdemAluguel(
  contratoId: string,
  ordemId: string
): Promise<{ erro?: string; codigo?: string | null }> {
  const r = await ordemDaLocacao(contratoId, ordemId)
  if ("erro" in r) return { erro: r.erro }
  const { ordem: o, admin } = r
  const { data, error } = await admin
    .from("ordens_pagamento")
    .update({ excluido: true })
    .eq("id", ordemId)
    .eq("situacao", String(o.situacao))
    .select("id")
  if (error) return { erro: `Não foi possível excluir: ${error.message}` }
  if ((data ?? []).length === 0) {
    return { erro: "A ordem mudou de situação enquanto você decidia — recarregue a página." }
  }
  await registrarEvento(
    ordemId,
    "excluida",
    await usuarioDaTrilha(),
    o.autorizacao_esta_autorizado === true || o.situacao === "A pagar"
      ? `Excluída pelo contrato de locação quando estava "${o.situacao}" (já autorizada).`
      : `Excluída pelo contrato de locação quando estava "${o.situacao}".`
  )
  return { codigo: texto(o.codigo) ?? null }
}
