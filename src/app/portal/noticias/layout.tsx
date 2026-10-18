import { GuardaParte } from "@/components/portal/guarda-parte"
import { requireVisualizacaoPortal } from "@/lib/visualizacao-filiado"

/**
 * Notícias no portal, no estado escolhido em Filiados › Área do associado.
 * Desabilitada, lista e notícia mostram "indisponível" — e não 404: o link
 * /portal/noticias/<id> circula compartilhado fora do portal e está nos
 * avisos do sino. Não há o que travar: o associado só lê (marcar o aviso
 * como lido é dos Avisos e continua). O layout não impede a página de rodar:
 * cada página confere a parte de novo antes de ler a notícia.
 */
export default async function NoticiasPortalLayout({ children }: { children: React.ReactNode }) {
  await requireVisualizacaoPortal()
  return <GuardaParte parte="noticias">{children}</GuardaParte>
}
