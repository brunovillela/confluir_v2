import { formatarData } from "@/lib/formato"
import type { SituacaoOpositor } from "@/lib/oposicao-constantes"

/**
 * A situação da oposição nas palavras do trabalhador (A15, A108). O painel
 * segue com ROTULO_SITUACAO_OPOSITOR ("Aprovada", "Não avaliada"…), que é o
 * vocabulário da fila da gestão; aqui o resultado é dito do ponto de vista de
 * quem se opôs. Mesmo texto na lista, no comprovante e no PDF.
 */
export const ROTULO_SITUACAO_PORTAL: Record<SituacaoOpositor, string> = {
  aguardando_documento: "Falta a carta assinada",
  nao_avaliada: "Em análise",
  aprovada: "Aceita",
  reprovada: "Não aceita",
  desistente: "Você optou por não se opor",
}

/** Cor do selo/alerta — sempre junto do rótulo e de um ícone, nunca sozinha. */
export const VARIANTE_SITUACAO_PORTAL: Record<
  SituacaoOpositor,
  "warning" | "info" | "success" | "error" | "secondary"
> = {
  aguardando_documento: "warning",
  nao_avaliada: "info",
  aprovada: "success",
  reprovada: "error",
  desistente: "secondary",
}

/**
 * O que acontece quando a oposição é aceita. Não promete o que o sistema não
 * controla (quem desconta é a fonte pagadora): diz o que a entidade faz e
 * qual é a saída se o desconto vier mesmo assim (ajuste de produto do A15).
 */
export const DEPOIS_DE_ACEITA =
  "A entidade informa a sua fonte pagadora para que a contribuição não seja descontada. Se o desconto acontecer mesmo assim, fale com a entidade."

/** Frase curta do resultado: a mesma no cartão da lista e no comprovante. */
export function fraseResultado(
  situacao: SituacaoOpositor,
  datas: { avaliadaEm?: string | null; registradaEm?: string | null; prazoFim?: string | null } = {}
): string {
  const em = (dia: string | null | undefined) => (dia ? ` em ${formatarData(dia)}` : "")
  switch (situacao) {
    case "aprovada":
      return `Oposição aceita${em(datas.avaliadaEm)}.`
    case "reprovada":
      return `Oposição não aceita${em(datas.avaliadaEm)}.`
    case "nao_avaliada":
      return `Oposição registrada${em(datas.registradaEm)}. Em análise pela entidade.`
    case "aguardando_documento":
      return `Oposição registrada${em(datas.registradaEm)}. Falta enviar a carta assinada${
        datas.prazoFim ? ` até ${formatarData(datas.prazoFim)}` : ""
      }.`
    case "desistente":
      return "Você optou por não se opor."
  }
}
