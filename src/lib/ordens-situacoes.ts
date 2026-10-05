/**
 * Situações para as quais o Financeiro pode levar uma ordem ainda não paga,
 * pela tela da ordem, e o que acontece com ela em cada destino. Seguro para o
 * client (o formulário mostra o destino na confirmação); a regra de transição
 * fica em lib/db/ordens-ciclo.ts (alterarSituacaoOrdem).
 */
export type DestinoSituacao = {
  valor: string
  /** Para onde a ordem vai depois da troca — texto da confirmação. */
  destino: string
  /** Só ordens geradas por contrato podem voltar a esperar a nota. */
  exigeContrato?: boolean
}

export const DESTINOS_SITUACAO: DestinoSituacao[] = [
  {
    valor: "Em autorização",
    destino:
      "A ordem entra na fila de avaliação por alçada (Aquisição › Avaliações de ordens). Se já estava autorizada, a autorização é desfeita.",
  },
  {
    valor: "A pagar",
    destino:
      "A ordem passa a constar como autorizada por você e vai para a fila de pagamento do Financeiro, sem passar pela alçada.",
  },
  {
    valor: "Aguardando informações",
    destino:
      "A ordem é devolvida a quem a lançou, que a complementa e a reenvia para autorização. Ela sai da fila de pagamento.",
  },
  {
    valor: "Aguardando documento fiscal",
    destino:
      "A ordem volta ao contrato de origem e fica esperando a nota fiscal da competência; com a nota, segue para autorização.",
    exigeContrato: true,
  },
]

export function destinoDaSituacao(valor: string): string | null {
  return DESTINOS_SITUACAO.find((d) => d.valor === valor)?.destino ?? null
}
