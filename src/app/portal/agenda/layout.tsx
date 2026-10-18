import { GuardaParte } from "@/components/portal/guarda-parte"
import { requireVisualizacaoPortal } from "@/lib/visualizacao-filiado"

/**
 * Agenda de atividades, no estado escolhido em Filiados › Área do associado:
 * desabilitada, /portal/agenda mostra "indisponível" em vez de levar à seção
 * da página de Eventos (que também some). A agenda não se suspende: não há
 * nada que o associado grave nela. A página confere a parte de novo (ver
 * page.tsx).
 */
export default async function AgendaPortalLayout({ children }: { children: React.ReactNode }) {
  await requireVisualizacaoPortal()
  return <GuardaParte parte="agenda">{children}</GuardaParte>
}
