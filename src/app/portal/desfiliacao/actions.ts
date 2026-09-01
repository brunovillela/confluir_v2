"use server"

import { revalidatePath } from "next/cache"

import { type EstadoForm } from "@/lib/contas"
import { hojeSP } from "@/lib/db/comum"
import { CONDICAO_COLETIVA } from "@/lib/filiacao"
import { createAdminClient } from "@/lib/supabase/admin"
import { tenantAtual } from "@/lib/tenant"
import { requireVisualizacaoPortal } from "@/lib/visualizacao-filiado"

/**
 * Desistência da FILIAÇÃO COLETIVA pela área do filiado — só é permitida a
 * quem está na condição "Em processo de filiação coletiva" e DENTRO do prazo.
 * O pedido entra na trilha NORMAL de desfiliação (o empregador precisa ser
 * avisado para parar o desconto), não some do sistema.
 */
export async function desistirFiliacaoColetiva(
  _prev: EstadoForm,
  fd: FormData
): Promise<EstadoForm> {
  const { filiado, preview } = await requireVisualizacaoPortal()
  if (preview) {
    return { erro: "Visualização da gestão é somente leitura." }
  }
  if (String(fd.get("confirmacao") ?? "").trim() !== "CONFIRMO") {
    return { erro: "Digite CONFIRMO para concluir o pedido." }
  }

  const admin = await createAdminClient()
  const emp = await tenantAtual()
  const hoje = hojeSP()

  const { data: f } = await admin
    .from("filiacoes")
    .select("id, filiacao_condicao, filiacao_coletiva_prazo, filiacao_coletiva_id")
    .eq("id", filiado.filiacaoId)
    .eq("emp_proprietaria_id", emp)
    .maybeSingle()
  if (!f) return { erro: "Cadastro não encontrado." }
  if (f.filiacao_condicao !== CONDICAO_COLETIVA) {
    return {
      erro: "A desistência online vale apenas durante o processo de filiação coletiva.",
    }
  }
  const prazo = f.filiacao_coletiva_prazo as string | null
  if (prazo && prazo < hoje) {
    return {
      erro: `O prazo de desistência terminou em ${prazo.split("-").reverse().join("/")}. Procure o sindicato para a desfiliação.`,
    }
  }

  // entra na trilha normal de desfiliação (fonte precisa ser informada)
  const { error } = await admin
    .from("filiacoes")
    .update({
      filiacao_condicao: "Desfiliação não informada à fonte",
      condicao_desde: hoje,
      updated_at: new Date().toISOString(),
    })
    .eq("id", filiado.filiacaoId)
    .eq("emp_proprietaria_id", emp)
  if (error) {
    return { erro: `Não foi possível registrar o pedido: ${error.message}` }
  }

  // marca o item do lote e registra no prontuário
  await admin
    .from("filiacao_coletiva_itens")
    .update({
      resultado: "desistiu",
      desistencia_em: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("filiacao_id", filiado.filiacaoId)
    .is("desistencia_em", null)

  const agora = new Date().toISOString()
  await admin.from("filiacao_prontuario").insert({
    filiacao_id: filiado.filiacaoId,
    data: agora,
    tipo: "Desfiliação",
    descricao:
      "Desistência da filiação coletiva solicitada pelo próprio trabalhador na área do filiado, dentro do prazo.",
    diretor_funcionario_id: null,
    emp_proprietaria_id: emp,
    created_at: agora,
    modified_at: agora,
  })

  revalidatePath("/portal/desfiliacao")
  revalidatePath("/painel/filiados/coletivas")
  return {
    ok: "Pedido registrado. O sindicato vai comunicar o seu empregador para encerrar o desconto.",
  }
}
