import { GuardaParte } from "@/components/portal/guarda-parte"
import { requireVisualizacaoPortal } from "@/lib/visualizacao-filiado"

/**
 * "O sindicato" conforme Filiados › Área do associado: desabilitado, a seção
 * mostra "indisponível". Não se suspende — a página só lê.
 */
export default async function PortalSindicatoLayout({ children }: { children: React.ReactNode }) {
  await requireVisualizacaoPortal()
  return <GuardaParte parte="sindicato">{children}</GuardaParte>
}
