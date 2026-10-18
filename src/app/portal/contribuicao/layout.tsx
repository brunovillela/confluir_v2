import { GuardaParte } from "@/components/portal/guarda-parte"
import { requireVisualizacaoPortal } from "@/lib/visualizacao-filiado"

/**
 * Contribuição na Área do associado (Filiados › Área do associado):
 * desabilitada, a página vira "indisponível"; suspensa, ganha a faixa (o QR
 * das cobranças Pix continua — pagar o que já foi emitido não para). A rota
 * do extrato em PDF tem a própria trava (layout não vale para route handler).
 */
export default async function ContribuicaoLayout({ children }: { children: React.ReactNode }) {
  await requireVisualizacaoPortal()
  return <GuardaParte parte="contribuicao">{children}</GuardaParte>
}
