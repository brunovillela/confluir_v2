import { GuardaParte } from "@/components/portal/guarda-parte"
import { requireVisualizacaoPortal } from "@/lib/visualizacao-filiado"

/**
 * Meu cadastro na Área do associado (Filiados › Área do associado): não se
 * desabilita (é o canal de correção dos dados do titular), então a guarda só
 * põe a faixa da suspensão. A trava de verdade está nas actions
 * (bloqueioDaParte) — o layout não re-renderiza ao navegar.
 */
export default async function CadastroLayout({ children }: { children: React.ReactNode }) {
  await requireVisualizacaoPortal()
  return <GuardaParte parte="cadastro">{children}</GuardaParte>
}
