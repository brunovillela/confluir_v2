/**
 * Constantes de Ofícios seguras para o client (sem `server-only`).
 * Ver [[confluir-ferramentas-administrativas]].
 */

export const TIPOS_OFICIO = ["filiacao", "desfiliacao", "manual"] as const
export type TipoOficio = (typeof TIPOS_OFICIO)[number]

export const ROTULOS_TIPO_OFICIO: Record<TipoOficio, string> = {
  desfiliacao: "Desfiliação",
  filiacao: "Filiação",
  manual: "Manual",
}

/** O que cada tipo faz, mostrado no formulário na hora de escolher. */
export const EXPLICACAO_TIPO_OFICIO: Record<TipoOficio, string> = {
  filiacao:
    "Pede à empresa (fonte pagadora) que passe a descontar em folha a contribuição de quem se filiou. Depois de salvar, o sistema lista os filiados dessa empresa que ainda não foram oficiados, para você marcar quem entra.",
  desfiliacao:
    "Pede à empresa (fonte pagadora) que pare de descontar a contribuição de quem se desfiliou. Depois de salvar, o sistema lista os desfiliados dessa empresa que ainda não foram oficiados, para você marcar quem entra.",
  manual:
    "Qualquer outro ofício: convite, solicitação, resposta, comunicado. Você escreve o texto, e o destinatário pode ser uma empresa cadastrada ou qualquer pessoa ou órgão.",
}

/** Ofícios automáticos puxam a lista de pessoas dos vínculos. */
export function eAutomatico(tipo: string | null): tipo is "desfiliacao" | "filiacao" {
  return tipo === "desfiliacao" || tipo === "filiacao"
}

export const SITUACOES_OFICIO = ["Rascunho", "Aguardando assinatura", "Emitido", "Cancelado"] as const
export type SituacaoOficio = (typeof SITUACOES_OFICIO)[number]

/**
 * Remove a marcação BBCode do editor de rich-text do Bubble ([b], [center],
 * [font="Arial"], [color=#111], …) que veio no corpo dos ofícios importados.
 * Só limpa para EXIBIÇÃO — o corpo cru é preservado no banco.
 */
export function limparFormatacaoBubble(texto: string | null): string {
  if (!texto) return ""
  return texto
    .replace(/\[\/?[a-z][^\]]*\]/gi, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim()
}

/**
 * Assunto e corpo padrão por tipo (o corpo é editável). `entidade` é o nome
 * da organização do tenant — nada de nome de sindicato fixo no código.
 */
export function padraoOficio(
  tipo: TipoOficio,
  entidade: string | null
): { assunto: string; corpo: string } {
  const socios = entidade ? `como sócios da entidade ${entidade}` : "como sócios desta entidade"
  switch (tipo) {
    case "desfiliacao":
      return {
        assunto: "Desfiliação de trabalhadores",
        corpo: `Solicitamos a exclusão dos trabalhador(es) listado(s) abaixo ${socios}.`,
      }
    case "filiacao":
      return {
        assunto: "Filiação de trabalhadores",
        corpo: `Solicitamos a inclusão dos trabalhador(es) listado(s) abaixo ${socios}, com o respectivo desconto em folha da contribuição associativa.`,
      }
    case "manual":
      return { assunto: "", corpo: "" }
  }
}
