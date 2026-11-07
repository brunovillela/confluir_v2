import "server-only"

import { hojeSP } from "@/lib/db/comum"
import { debitarCaixaCompra, saldoCaixaAberta } from "@/lib/db/compras-pagamento"
import { listarCentrosDeDebito } from "@/lib/db/financeiro"
import { travaDoMesFechado } from "@/lib/db/meses-fechados"
import { caixaJaDebitado, registrarEvento, SITUACOES_PAGAVEIS } from "@/lib/db/ordens-ciclo"
import { formatarData as formatarDataBR } from "@/lib/formato"
import { createAdminClient } from "@/lib/supabase/admin"
import { tenantAtual } from "@/lib/tenant"

function somarDiasData(data: string, dias: number): string {
  const d = new Date(`${data}T12:00:00Z`)
  d.setUTCDate(d.getUTCDate() + dias)
  return d.toISOString().slice(0, 10)
}

/**
 * O registro do pagamento em si (travas de autorização, mês fechado, caixa e
 * conta de débito; débito do caixa; trilha; comprovante ao fornecedor). Serve
 * ao formulário da ordem e ao pagamento em lote do extrato.
 */
export async function registrarPagamentoDaOrdem({
  id,
  valor,
  dataPagamento,
  centroReceitaId,
  usuarioId,
  arquivo,
  conferiuDuplicidade = false,
}: {
  id: string
  valor: number
  dataPagamento: string
  centroReceitaId: string
  usuarioId: string
  arquivo: File | null
  /** Quem paga marcou que conferiu as ordens parecidas (só no formulário). */
  conferiuDuplicidade?: boolean
}): Promise<{ erro?: string }> {
  const admin = await createAdminClient()
  const { data: ordem } = await admin
    .from("ordens_pagamento")
    .select("id, codigo, descricao, situacao, arquivo_pagamento, data_pagamento, valor_pago, caixa_conta_id, centro_custo_receita_id, valor_inicial_cobranca, vencimento, beneficiario_fornecedor_id, fornecedor_id, beneficiario_usuario_id")
    .eq("id", id)
    .eq("emp_proprietaria_id", await tenantAtual())
    .maybeSingle()
  if (!ordem) return { erro: "Ordem não encontrada." }
  // Primeiro registro exige autorização; editar um pagamento já registrado
  // (ordem Paga) é permitido.
  const editando = ordem.situacao === "Paga"
  if (!editando && !SITUACOES_PAGAVEIS.includes(String(ordem.situacao))) {
    return {
      erro:
        ordem.situacao === "Em autorização" || ordem.situacao === "Aguardando informações"
          ? "A ordem ainda não foi autorizada — só ordem \"A pagar\" pode ser paga."
          : `Ordem "${ordem.situacao}" não pode ser paga.`,
    }
  }

  // Data digitada errada (ex.: 0206 no lugar de 2026) não entra.
  const hoje = hojeSP()
  if (dataPagamento < somarDiasData(hoje, -400) || dataPagamento > somarDiasData(hoje, 31)) {
    return { erro: `Data do pagamento fora do esperado (${formatarDataBR(dataPagamento)}). Confira o ano.` }
  }

  // Possível duplicidade (mesmo favorecido e valor, vencimento próximo): no
  // primeiro registro, só com a conferência marcada no formulário; o lote recusa.
  let notaDuplicidade: string | null = null
  if (!editando) {
    const { ordensParecidas, descreverParecidas } = await import("@/lib/db/ordens-duplicidade")
    const parecidas = (await ordensParecidas([ordem as never]).catch(() => new Map())).get(id) ?? []
    if (parecidas.length) {
      const lista = descreverParecidas(parecidas)
      if (!conferiuDuplicidade) return { erro: `Possível duplicidade com ${lista}. Confira e pague pela própria ordem, marcando que conferiu.` }
      notaDuplicidade = `Conferido que não é duplicidade de ${lista}.`
    }
  }

  // Mês fechado para a contabilidade: não entra pagamento nele, e o pagamento
  // que já está nele não muda de valor nem de data (o comprovante e a conta
  // de débito, que não vão para a planilha, podem mudar).
  const mudaLancamento =
    !editando ||
    String(ordem.data_pagamento ?? "").slice(0, 10) !== dataPagamento ||
    Math.round(Number(ordem.valor_pago ?? 0) * 100) !== Math.round(valor * 100)
  let avisoRpa: string | null = null
  if (mudaLancamento) {
    const trava = await travaDoMesFechado(
      [dataPagamento, editando ? (ordem.data_pagamento as string | null) : null],
      editando ? "mudar o valor ou a data do pagamento" : "registrar um pagamento nele"
    )
    if (trava) return { erro: trava }
    // Ordem de RPA: outros RPAs do prestador pagos no mês, ou mês diferente do
    // da apuração do IRRF. Só aviso, anotado na trilha da ordem.
    const { limiteMensalNoPagamentoDaOrdem } = await import("@/lib/db/compras-rpa")
    avisoRpa = await limiteMensalNoPagamentoDaOrdem(id, dataPagamento)
  }

  // O débito é uma conta de pagamento (caixa, banco) — ver listarCentrosDeDebito.
  const debitos = await listarCentrosDeDebito((ordem.centro_custo_receita_id as string | null) ?? null)
  if (!debitos.some((c) => c.id === centroReceitaId)) {
    return { erro: "Escolha uma conta de pagamento (caixa, banco) como centro de custo do débito." }
  }

  // Comprovante é opcional na edição (mantém o atual se nenhum for enviado).
  let arquivoPagamento: string | undefined
  if (arquivo) {
    if (arquivo.type !== "application/pdf") {
      return { erro: "O comprovante deve ser um arquivo PDF." }
    }
    if (arquivo.size > 3 * 1024 * 1024) {
      return { erro: "O comprovante deve ter no máximo 3 MB." }
    }
    const caminho = `ordens/${id}/${Date.now()}.pdf`
    const { error: erroUpload } = await admin.storage
      .from("comprovantes")
      .upload(caminho, arquivo, { contentType: "application/pdf" })
    if (erroUpload) {
      return { erro: `Falha ao subir o comprovante: ${erroUpload.message}` }
    }
    arquivoPagamento = caminho
  }

  // Forma "Dinheiro" de parcela de contrato: o caixa é debitado agora, no
  // pagamento (a compra direta já debitou no lançamento — não repete).
  const caixaId = ordem.caixa_conta_id ? String(ordem.caixa_conta_id) : null
  const debitarAgora = !editando && caixaId !== null && !(await caixaJaDebitado(id))
  if (debitarAgora) {
    // saldoCaixaAberta lança se a leitura falhar (soma todas as movimentações):
    // vira mensagem, não tela de erro — e nada é debitado.
    const saldo = await saldoCaixaAberta(caixaId!).catch(() => undefined)
    if (saldo === undefined) {
      return { erro: "Não foi possível conferir o saldo do caixa. Tente de novo." }
    }
    if (saldo === null) {
      return { erro: "A conta de caixa desta ordem não está aberta — peça ao responsável para reabri-la." }
    }
    if (saldo < valor) {
      return { erro: `Saldo insuficiente no caixa da ordem (${saldo.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}). Peça um aporte antes de pagar.` }
    }
  }

  const { error } = await admin
    .from("ordens_pagamento")
    .update({
      valor_pago: valor,
      data_pagamento: dataPagamento,
      centro_custo_receita_id: centroReceitaId,
      pagador_id: usuarioId,
      situacao: "Paga",
      ...(arquivoPagamento ? { arquivo_pagamento: arquivoPagamento } : {}),
    })
    .eq("id", id)
  if (error) return { erro: `Não foi possível salvar o pagamento: ${error.message}` }

  if (debitarAgora) {
    const { erro: erroCaixa } = await debitarCaixaCompra({
      contaId: caixaId!,
      valor,
      descricao: `Pagamento da ordem ${ordem.codigo ?? ""} — ${ordem.descricao ?? ""}`.slice(0, 500),
      usuarioId: usuarioId,
      ordemId: id,
    })
    if (erroCaixa) {
      // Sem o débito, o pagamento não vale: volta a ordem como estava.
      await admin
        .from("ordens_pagamento")
        .update({
          valor_pago: ordem.valor_pago,
          data_pagamento: ordem.data_pagamento,
          situacao: ordem.situacao,
          pagador_id: null,
        })
        .eq("id", id)
      return { erro: erroCaixa }
    }
  }

  await registrarEvento(
    id,
    "paga",
    usuarioId,
    [editando ? "Dados do pagamento alterados." : null, avisoRpa, notaDuplicidade].filter(Boolean).join(" ") || null,
    {
      valor_pago: valor,
      data_pagamento: dataPagamento,
      centro_custo_receita_id: centroReceitaId,
      comprovante: Boolean(arquivoPagamento ?? ordem.arquivo_pagamento),
      ...(editando
        ? { antes: { valor_pago: ordem.valor_pago, data_pagamento: ordem.data_pagamento } }
        : {}),
    }
  )
  // Comprovante anexado agora: vai sozinho ao fornecedor com o envio
  // automático ligado (contatos marcados para comprovantes). Não falha o pagamento.
  if (arquivoPagamento) {
    const { enviarComprovanteAutomatico } = await import("@/lib/db/comprovante-fornecedor")
    await enviarComprovanteAutomatico(id, usuarioId)
  }
  return {}
}
