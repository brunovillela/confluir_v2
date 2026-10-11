import type { LinhaContribuicao, MinhaContribuicao } from "@/lib/db/carteirinha"
import type { RegraInadimplencia } from "@/lib/filiacao-direitos-constantes"

/**
 * Situação da contribuição em uma palavra — a MESMA na página "Minha
 * contribuição" e no Início, para os dois nunca dizerem coisas diferentes.
 * Ordem: atraso pela regra > faltas recentes > não apurada > em dia.
 */
export type SituacaoContribuicao = {
  chave: "atraso" | "faltas" | "indisponivel" | "em_dia"
  rotulo: string
  variante: "error" | "warning" | "outline" | "success"
  /** Linha de apoio quando o rótulo sozinho não basta. */
  apoio?: string
}

export function situacaoContribuicao(c: Pick<MinhaContribuicao, "inadimplente" | "emFalta">): SituacaoContribuicao {
  if (c.inadimplente === true) return { chave: "atraso", rotulo: "Em atraso", variante: "error" }
  if (c.emFalta.length > 0) return { chave: "faltas", rotulo: "Com faltas recentes", variante: "warning" }
  if (c.inadimplente === null) {
    return {
      chave: "indisponivel",
      rotulo: "Situação indisponível",
      variante: "outline",
      apoio: "Não foi possível conferir agora. Tente de novo mais tarde.",
    }
  }
  return { chave: "em_dia", rotulo: "Em dia", variante: "success" }
}

/** A situação com os dois casos de quem ainda não tem NENHUMA contribuição registrada (A126). */
export type SituacaoSemHistorico = Omit<SituacaoContribuicao, "chave" | "variante"> & {
  chave: SituacaoContribuicao["chave"] | "aguardando" | "sem_registros"
  variante: SituacaoContribuicao["variante"] | "info"
}

/**
 * `situacaoContribuicao` sem o "Em dia" de quem não tem histórico nenhum —
 * badge "Em dia" ao lado de "nenhuma contribuição registrada" era
 * contraditório (A126). Recém-filiado: aguardando o primeiro desconto (ou
 * pagamento, no Pix); sem filiação recente: "Sem registros", que pede para
 * avisar o sindicato. Fora desses casos devolve exatamente a régua comum.
 */
export function situacaoSemHistorico(
  c: Pick<MinhaContribuicao, "inadimplente" | "emFalta" | "linhas" | "inicio" | "porPix">
): SituacaoSemHistorico {
  const base = situacaoContribuicao(c)
  if (base.chave !== "em_dia" || c.linhas.length > 0) return base
  if (c.inicio?.recente) {
    return {
      chave: "aguardando",
      rotulo: c.porPix ? "Aguardando o primeiro pagamento" : "Aguardando o primeiro desconto",
      variante: "info",
      apoio: `Primeiro mês esperado: ${c.inicio.primeiroMes}.`,
    }
  }
  return { chave: "sem_registros", rotulo: "Sem registros", variante: "outline", apoio: "Nenhuma contribuição registrada até agora." }
}

/**
 * A regra de atraso em uma linha, sem o "tolera até N" (com N faltas a
 * pessoa já entra na conta). Cada mês, a empresa manda ao sindicato a
 * relação de quem teve o desconto — é a "remessa" do financeiro, que o
 * associado não conhece por esse nome.
 */
export function fraseRegra(regra: Pick<RegraInadimplencia, "quantidade" | "exigirConsecutivas" | "janelaRemessas">): string {
  const faltas = `${regra.quantidade} ${regra.quantidade === 1 ? "falta" : regra.exigirConsecutivas ? "faltas seguidas" : "faltas"}`
  const janela = regra.janelaRemessas === 1 ? "na última relação mensal" : `nas últimas ${regra.janelaRemessas} relações mensais`
  return `A entidade considera a contribuição em atraso a partir de ${faltas} ${janela}.`
}

/**
 * Nome do tipo de remessa para quem paga (A161). A coluna recebe qualquer
 * tipo que a entidade use: os conhecidos ganham nome de gente, os outros
 * aparecem como vêm (a tela põe o original no `title`).
 */
export function rotuloTipoContribuicao(tipo: string | null): string {
  if (!tipo) return "Não informado"
  const rotulos: Record<string, string> = {
    Associativa: "Mensalidade",
    Assistencial: "Contribuição assistencial",
    Sindical: "Contribuição sindical",
  }
  return rotulos[tipo] ?? tipo
}

/** Quem pagou a linha: a fonte pagadora ou, sem ela, o pagamento direto do associado (A74). */
export function rotuloFonteDaLinha(l: Pick<LinhaContribuicao, "fonte" | "direta">): string {
  if (l.fonte) return l.fonte
  if (l.direta === "pix") return "Pix (pago por você)"
  if (l.direta === "boleto") return "Boleto (pago por você)"
  return "—"
}
