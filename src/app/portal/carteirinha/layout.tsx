import { GuardaParte } from "@/components/portal/guarda-parte"
import { requireVisualizacaoPortal } from "@/lib/visualizacao-filiado"

/**
 * Carteirinha na Área do associado (Filiados › Área do associado):
 * desabilitada, a página vira "indisponível"; suspensa, ganha a faixa. A rota
 * da declaração em PDF tem a própria trava (layout não vale para route
 * handler). A verificação pública (/carteirinha/[codigo]) fica fora disto.
 */
export default async function CarteirinhaLayout({ children }: { children: React.ReactNode }) {
  await requireVisualizacaoPortal()
  return <GuardaParte parte="carteirinha">{children}</GuardaParte>
}
