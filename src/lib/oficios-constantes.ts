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

/** Motivo mínimo para cancelar um ofício — fica na trilha e na página pública de verificação. */
export const MOTIVO_CANCELAMENTO_MIN = 10

// A formatação do corpo (BBCode, inclusive a herdada do Bubble) é lida e
// desenhada por lib/oficio-formatacao.ts — não é mais apagada na exibição.

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

/** Assinantes de um ofício, contando o principal (vários assinam ao mesmo tempo). */
export const MAX_ASSINANTES_OFICIO = 6

/** Saudação e fecho quando o campo fica em branco (o padrão de sempre). */
export const SAUDACAO_PADRAO = "Prezados,"
export const FECHO_PADRAO = "Cordialmente,"

/** Sugestões dos campos (a pessoa pode escrever outra). */
export const SUGESTOES_SAUDACAO = [
  "Prezados,",
  "Prezado Senhor,",
  "Prezada Senhora,",
  "Senhor Diretor,",
  "Senhora Diretora,",
  "Senhor Superintendente,",
  "Excelentíssimo Senhor,",
  "Excelentíssima Senhora,",
]
export const SUGESTOES_FECHO = ["Cordialmente,", "Atenciosamente,", "Respeitosamente,", "Saudações sindicais,"]

/** "Aos cuidados" em até 3 linhas (nome, cargo, setor), sem linhas vazias. */
export const MAX_LINHAS_AOS_CUIDADOS = 3
export function normalizarAosCuidados(v: string | null | undefined): string | null {
  const linhas = String(v ?? "")
    .split(/\r?\n/)
    .map((l) => l.replace(/\s+/g, " ").trim())
    .filter(Boolean)
  if (!linhas.length) return null
  // Passou do limite: o excedente vai para a última linha, nada se perde.
  const cabe = linhas.slice(0, MAX_LINHAS_AOS_CUIDADOS - 1)
  const resto = linhas.slice(MAX_LINHAS_AOS_CUIDADOS - 1).join(" ")
  return [...cabe, ...(resto ? [resto] : [])].join("\n")
}
