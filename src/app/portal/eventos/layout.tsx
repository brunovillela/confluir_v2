import { GuardaParte } from "@/components/portal/guarda-parte"
import { requireVisualizacaoPortal } from "@/lib/visualizacao-filiado"

/**
 * Eventos no portal, no estado escolhido em Filiados › Área do associado:
 * suspensa, a faixa no topo; desabilitada, a página mostra o "indisponível"
 * ela mesma, com as inscrições futuras logo abaixo (cancelar solta a vaga e
 * nunca é bloqueado, salvo a opção de cancelar pelo portal desligada) — por
 * isso o layout não a substitui. Os recibos e lembretes já gravados no sino
 * apontam para #inscricao-<id>. A trava de inscrever e responder presença
 * fica nas actions (bloqueioDaParte). Os route handlers do calendário não
 * passam por layout: cada um confere a parte por si.
 *
 * A página pública de cada evento (/evento/<slug>) e a da inscrição
 * (/inscricao/<token>) continuam: servem também a quem não é filiado.
 */
export default async function EventosPortalLayout({ children }: { children: React.ReactNode }) {
  await requireVisualizacaoPortal()
  return (
    <GuardaParte parte="eventos" desabilitadaNaPagina>
      {children}
    </GuardaParte>
  )
}
