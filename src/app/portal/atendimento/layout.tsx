import { GuardaParte } from "@/components/portal/guarda-parte"
import { requireVisualizacaoPortal } from "@/lib/visualizacao-filiado"

/**
 * Atendimento conforme Filiados › Área do associado: desabilitado, a seção
 * mostra "indisponível"; suspenso, a faixa no topo — as páginas trocam os
 * formulários pelo aviso e as actions recusam (bloqueioDaParte). O anexo
 * (route handler, fora deste layout) confere por conta própria.
 *
 * Sem sessão, a entrada antes da guarda: quem chega por um link de fora
 * (?assunto=&titulo=, a desistência da coletiva) entra e volta para cá.
 */
export default async function PortalAtendimentoLayout({ children }: { children: React.ReactNode }) {
  await requireVisualizacaoPortal()
  return <GuardaParte parte="atendimento">{children}</GuardaParte>
}
