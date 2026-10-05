import "server-only"

import type { Apontamento } from "@/lib/auditoria-confirmacao"
import { avisarOrdensEmAutorizacao, depoisDaResposta } from "@/lib/db/avisos"
import { texto } from "@/lib/db/comum"
import { subirComprovanteCompras } from "@/lib/db/compras"
import {
  camposAutorizacaoInicial,
  motivoDispensaContrato,
  registrarEvento,
  SITUACAO_A_PAGAR,
  SITUACAO_AGUARDANDO_DOCUMENTO,
  SITUACAO_EM_AUTORIZACAO,
  usuarioDaTrilha,
} from "@/lib/db/ordens-ciclo"
import { reverificarOrdem, type Confirmacao } from "@/lib/db/ordens-verificacao"
import { createAdminClient } from "@/lib/supabase/admin"
import { tenantAtual } from "@/lib/tenant"

/**
 * DOCUMENTO FISCAL de uma ordem "Aguardando documento fiscal" (parcela
 * recorrente de contrato ou custeio). Vale pela tela do contrato, do custeio
 * e pela da própria ordem (Financeiro → Documentos).
 *
 * - Ordem que nasceu AUTORIZADA (regra de 05/10): nota no mesmo valor → "A
 *   pagar"; valor diferente → a autorização é desfeita e a ordem vai para a
 *   autorização pontual (o que foi autorizado era outro valor).
 * - Ordem anterior à regra (sem autorização): a regra antiga — parcela
 *   ordinária de valor fixo do contrato dispensa a alçada; o resto vai para
 *   autorização.
 */
export async function receberDocumentoFiscal(
  ordemId: string,
  dados: {
    arquivo: File
    /** Valor da nota; null = o da parcela. */
    valor: number | null
    /** Tela com confirmação da auditoria; sem ela, alertas são aceitos e registrados. */
    confirmacao?: Confirmacao
    /** Onde o arquivo foi recebido (vai para a trilha). */
    onde: string
  }
): Promise<{ erro?: string; situacao?: string; apontamentos?: Apontamento[] }> {
  const empId = await tenantAtual()
  const admin = await createAdminClient()
  const { data: o } = await admin
    .from("ordens_pagamento")
    .select("id, situacao, valor_inicial_cobranca, contrato_id, custeio_id, autorizacao_esta_autorizado")
    .eq("id", ordemId)
    .eq("emp_proprietaria_id", empId)
    .not("excluido", "is", true)
    .maybeSingle()
  if (!o) return { erro: "Ordem não encontrada." }
  if (o.situacao !== SITUACAO_AGUARDANDO_DOCUMENTO) {
    return { erro: `Esta ordem já está "${o.situacao}" — o documento fiscal já foi recebido.` }
  }
  const valorAnterior = Number(o.valor_inicial_cobranca ?? 0)
  const valor = dados.valor ?? valorAnterior
  if (!(valor > 0)) return { erro: "Informe o valor do documento fiscal." }
  const mesmoValor = Math.abs(valor - valorAnterior) < 0.005

  let campos: Record<string, unknown>
  let dispensa: string | null = null
  if (o.autorizacao_esta_autorizado === true) {
    campos = mesmoValor
      ? { situacao: SITUACAO_A_PAGAR }
      : {
          situacao: SITUACAO_EM_AUTORIZACAO,
          autorizacao_esta_autorizado: false,
          autorizacao_autorizador_id: null,
          autorizacao_data: null,
          autorizacao_observacao: null,
          autorizacao_dispensada: false,
          autorizacao_dispensa_motivo: null,
        }
  } else {
    // Regra antiga: só parcela de contrato com valor fixo dispensa a alçada.
    if (o.contrato_id) {
      const { data: c } = await admin
        .from("contratos")
        .select("codigo, valor, sob_demanda")
        .eq("id", String(o.contrato_id))
        .maybeSingle()
      const valorContrato = c?.valor === null || c?.valor === undefined ? null : Number(c.valor)
      const fixa = c && c.sob_demanda !== true && valorContrato !== null && Math.abs(valorContrato - valor) < 0.005
      dispensa = fixa ? motivoDispensaContrato(texto(c.codigo)) : null
    }
    campos = camposAutorizacaoInicial(dispensa)
  }

  const up = await subirComprovanteCompras(`notas/ordens/${ordemId}`, dados.arquivo)
  if (up.erro || !up.caminho) return { erro: up.erro ?? "Falha ao subir o documento fiscal." }
  const novos = { ...campos, arquivo_nota_fiscal: up.caminho, valor_inicial_cobranca: valor }

  // A análise roda de novo sobre a ordem como ficará (com a nota e o valor).
  let analise = await reverificarOrdem(ordemId, novos, {
    notaFiscal: up.caminho,
    confirmacao: dados.confirmacao ?? { codigos: [] },
  })
  if (analise.apontamentos && !dados.confirmacao) {
    // Sem tela de confirmação: alerta é aceito (fica na trilha); bloqueio não.
    const bloqueios = analise.apontamentos.filter((a) => a.bloqueia)
    if (bloqueios.length) {
      await admin.storage.from("compras").remove([up.caminho])
      return { erro: `A auditoria bloqueou o documento: ${bloqueios.map((b) => b.titulo).join("; ")}.` }
    }
    analise = await reverificarOrdem(ordemId, novos, {
      notaFiscal: up.caminho,
      confirmacao: { codigos: analise.apontamentos.map((a) => a.codigo) },
    })
  }
  if (analise.apontamentos) {
    await admin.storage.from("compras").remove([up.caminho])
    return { apontamentos: analise.apontamentos }
  }

  // A situação no filtro garante que duas pessoas não recebam a mesma nota.
  const { data: atualizadas, error } = await admin
    .from("ordens_pagamento")
    .update(novos)
    .eq("id", ordemId)
    .eq("situacao", SITUACAO_AGUARDANDO_DOCUMENTO)
    .select("id")
  if (error || !(atualizadas ?? []).length) {
    await admin.storage.from("compras").remove([up.caminho])
    return {
      erro: error
        ? `Não foi possível registrar o documento: ${error.message}`
        : "A ordem mudou enquanto você enviava — recarregue a página.",
    }
  }

  const situacao = String(campos.situacao)
  const usuario = await usuarioDaTrilha()
  await registrarEvento(
    ordemId,
    "documento_fiscal",
    usuario,
    situacao === SITUACAO_A_PAGAR
      ? `Documento fiscal recebido ${dados.onde} — seguiu para pagamento.`
      : `Documento fiscal recebido ${dados.onde} — seguiu para autorização${!mesmoValor && o.autorizacao_esta_autorizado ? " (valor diferente do autorizado)" : ""}.`,
    {
      arquivo_nota_fiscal: up.caminho,
      ...(!mesmoValor ? { valor_antes: valorAnterior, valor } : {}),
    }
  )
  await analise.registrar(`no recebimento do documento fiscal ${dados.onde}`)
  if (dispensa) await registrarEvento(ordemId, "autorizacao_dispensada", usuario, dispensa)
  if (situacao === SITUACAO_EM_AUTORIZACAO) depoisDaResposta(() => avisarOrdensEmAutorizacao([ordemId]))
  return { situacao }
}
