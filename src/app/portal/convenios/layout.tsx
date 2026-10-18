import { GuardaParte } from "@/components/portal/guarda-parte"
import { requireVisualizacaoPortal } from "@/lib/visualizacao-filiado"

/**
 * Convênios conforme Filiados › Área do associado: desabilitada, a rota
 * mostra "indisponível"; suspensa, a faixa no topo e a lista continua (não há
 * nada que o associado grave aqui).
 */
export default async function ConveniosLayout({ children }: { children: React.ReactNode }) {
  await requireVisualizacaoPortal()
  return <GuardaParte parte="convenios">{children}</GuardaParte>
}
