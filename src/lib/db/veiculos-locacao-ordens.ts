import "server-only"
import { texto } from "@/lib/db/comum"
import { subirComprovanteCompras, subirPdfCompras } from "@/lib/db/compras"
import { ordemMexivelPeloContrato } from "@/lib/db/contratos"
import {
  corrigirOrdem,
  registrarEvento,
  SITUACAO_AGUARDANDO_DOCUMENTO,
  usuarioDaTrilha,
} from "@/lib/db/ordens-ciclo"
import { receberDocumentoFiscal } from "@/lib/db/ordens-documento"
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
      "id, codigo, situacao, tipo, processo_compra_id, data_pagamento, contrato_aluguel_id, descricao, valor_inicial_cobranca, vencimento, centro_custo_despesa_id, forma_pagamento, autorizacao_esta_autorizado, arquivo_nota_fiscal, arquivo_boleto",
    )
    .eq("id", ordemId)
    .eq("emp_proprietaria_id", await tenantAtual())
    .not("excluido", "is", true)
    .maybeSingle()
  if (error) return { erro: `Falha ao carregar a ordem: ${error.message}` }
  if (!o || texto(o.contrato_aluguel_id) !== contratoId) {
    return { erro: "Ordem não encontrada neste contrato." }
  }
  if (
    !ordemMexivelPeloContrato(
      o as Parameters<typeof ordemMexivelPeloContrato>[0],
    )
  ) {
    return {
      erro:
        o.data_pagamento || o.situacao === "Paga"
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
  nova: {
    descricao: string | null
    valor: number | null
    vencimento: string | null
  },
  motivo: string,
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
        (o.valor_inicial_cobranca === null ||
        o.valor_inicial_cobranca === undefined
          ? null
          : Number(o.valor_inicial_cobranca)),
      vencimento: nova.vencimento ?? texto(o.vencimento)?.slice(0, 10) ?? null,
      centroCustoDespesaId: texto(o.centro_custo_despesa_id) ?? null,
      formaPagamento: texto(o.forma_pagamento) ?? null,
    },
    motivo,
  )
}

/**
 * Exclui (marca `excluido`) UMA cobrança da locação ainda não paga nem em
 * processamento — inclusive já autorizada, caso em que o histórico registra
 * que a exclusão desfez uma autorização.
 */
export async function excluirOrdemAluguel(
  contratoId: string,
  ordemId: string,
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
    return {
      erro: "A ordem mudou de situação enquanto você decidia — recarregue a página.",
    }
  }
  await registrarEvento(
    ordemId,
    "excluida",
    await usuarioDaTrilha(),
    o.autorizacao_esta_autorizado === true || o.situacao === "A pagar"
      ? `Excluída pelo contrato de locação quando estava "${o.situacao}" (já autorizada).`
      : `Excluída pelo contrato de locação quando estava "${o.situacao}".`,
  )
  return { codigo: texto(o.codigo) ?? null }
}

/**
 * Fatura (documento fiscal da locação) e/ou boleto anexados ou substituídos
 * pela tela do contrato — as mesmas regras de "Documentos" na tela da ordem
 * (Financeiro): caminhos no bucket 'compras', boleto só em PDF, a situação
 * não muda e a troca fica na trilha da ordem. Ordem esperando o documento
 * fiscal anda pelo receberDocumentoFiscal, como no Financeiro.
 */
export async function anexarDocumentosOrdemAluguel(
  contratoId: string,
  ordemId: string,
  dados: { fatura: File | null; boleto: File | null },
): Promise<{ erro?: string; ok?: string }> {
  const r = await ordemDaLocacao(contratoId, ordemId)
  if ("erro" in r) return { erro: r.erro }
  const { ordem: o, admin } = r
  const { fatura, boleto } = dados
  if (!fatura && !boleto) return { erro: "Anexe a fatura e/ou o boleto." }

  let caminhoBoleto: string | null = null
  if (boleto) {
    const rb = await subirPdfCompras(`boletos/ordens/${ordemId}`, boleto)
    if (rb.erro || !rb.caminho) {
      return {
        erro:
          rb.erro === "O arquivo deve ser um PDF."
            ? "O boleto deve ser um arquivo PDF."
            : (rb.erro ?? "Falha ao subir o boleto."),
      }
    }
    caminhoBoleto = rb.caminho
  }

  if (fatura && o.situacao === SITUACAO_AGUARDANDO_DOCUMENTO) {
    if (caminhoBoleto) {
      await admin
        .from("ordens_pagamento")
        .update({ arquivo_boleto: caminhoBoleto })
        .eq("id", ordemId)
    }
    const rf = await receberDocumentoFiscal(ordemId, {
      arquivo: fatura,
      valor: null,
      onde: "pela tela do contrato de locação",
    })
    if (rf.erro) return { erro: rf.erro }
    return {
      ok: `Fatura recebida — a ordem foi para "${rf.situacao ?? "autorização"}".`,
    }
  }

  const mudancas: Record<string, string> = {}
  if (fatura) {
    const rf = await subirComprovanteCompras(`notas/ordens/${ordemId}`, fatura)
    if (rf.erro || !rf.caminho) {
      if (caminhoBoleto)
        await admin.storage.from("compras").remove([caminhoBoleto])
      return { erro: rf.erro ?? "Falha ao subir a fatura." }
    }
    mudancas.arquivo_nota_fiscal = rf.caminho
  }
  if (caminhoBoleto) mudancas.arquivo_boleto = caminhoBoleto

  const { error } = await admin
    .from("ordens_pagamento")
    .update(mudancas)
    .eq("id", ordemId)
  if (error) {
    await admin.storage.from("compras").remove(Object.values(mudancas))
    return { erro: `Não foi possível salvar os documentos: ${error.message}` }
  }
  const partes = [
    fatura
      ? `fatura ${o.arquivo_nota_fiscal ? "substituída" : "anexada"}`
      : null,
    boleto ? `boleto ${o.arquivo_boleto ? "substituído" : "anexado"}` : null,
  ].filter(Boolean)
  await registrarEvento(
    ordemId,
    "documento_fiscal",
    await usuarioDaTrilha(),
    `Pela tela do contrato de locação: ${partes.join(" e ")}.`,
    {
      ...(fatura
        ? {
            arquivo_nota_fiscal: mudancas.arquivo_nota_fiscal,
            nota_anterior: o.arquivo_nota_fiscal,
          }
        : {}),
      ...(boleto
        ? {
            arquivo_boleto: mudancas.arquivo_boleto,
            boleto_anterior: o.arquivo_boleto,
          }
        : {}),
    },
  )
  const texto1 = partes.join(" e ")
  return { ok: texto1.charAt(0).toUpperCase() + texto1.slice(1) + "." }
}
