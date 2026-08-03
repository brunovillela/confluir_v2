/**
 * Constantes de Ofícios seguras para o client (sem `server-only`).
 * Ver [[confluir-ferramentas-administrativas]].
 */

export const TIPOS_OFICIO = ["desfiliacao", "filiacao", "manual"] as const
export type TipoOficio = (typeof TIPOS_OFICIO)[number]

export const ROTULOS_TIPO_OFICIO: Record<TipoOficio, string> = {
  desfiliacao: "Desfiliação",
  filiacao: "Filiação",
  manual: "Manual",
}

/** Ofícios automáticos puxam a lista de pessoas dos vínculos. */
export function eAutomatico(tipo: string | null): tipo is "desfiliacao" | "filiacao" {
  return tipo === "desfiliacao" || tipo === "filiacao"
}

export const SITUACOES_OFICIO = ["Rascunho", "Emitido", "Cancelado"] as const
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

/** Assunto e corpo padrão por tipo (o corpo é editável). */
export const PADRAO_OFICIO: Record<
  TipoOficio,
  { assunto: string; corpo: string }
> = {
  desfiliacao: {
    assunto: "Desfiliação de trabalhadores",
    corpo:
      "Solicitamos a exclusão dos trabalhador(es) listado(s) abaixo como sócios do Sindipetro-NF.",
  },
  filiacao: {
    assunto: "Filiação de trabalhadores",
    corpo:
      "Solicitamos a inclusão dos trabalhador(es) listado(s) abaixo como sócios do Sindipetro-NF, com o respectivo desconto em folha da contribuição associativa.",
  },
  manual: { assunto: "", corpo: "" },
}
