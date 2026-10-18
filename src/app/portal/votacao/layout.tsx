import { GuardaParte } from "@/components/portal/guarda-parte"
import { requireVisualizacaoPortal } from "@/lib/visualizacao-filiado"

/**
 * Votação no portal (lista, cédula e datas da rodada), no estado escolhido em
 * Filiados › Área do associado: desabilitada, a seção inteira mostra
 * "indisponível" — e não 404, porque os avisos já gravados no sino apontam
 * para cá; suspensa, a faixa no topo. O layout não impede a página de rodar
 * nem se refaz ao navegar dentro da seção: cada página confere a parte de
 * novo, e a trava do voto e do e-mail de votação fica nas actions
 * (bloqueioDaParte).
 *
 * Vale só para o portal: /votar, /urna e /comprovante são portas da própria
 * assembleia e não passam por aqui.
 */
export default async function VotacaoPortalLayout({ children }: { children: React.ReactNode }) {
  await requireVisualizacaoPortal()
  return <GuardaParte parte="votacao">{children}</GuardaParte>
}
