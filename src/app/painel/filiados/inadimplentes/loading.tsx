import { EsqueletoHub } from "@/components/layout/esqueleto-hub"

/**
 * A apuração percorre as remessas da janela — dezenas de milhares de
 * lançamentos. Sem este esqueleto a tela ficaria em branco enquanto isso.
 */
export default function Carregando() {
  return <EsqueletoHub />
}
