import { GuardaParte } from "@/components/portal/guarda-parte"
import { requireVisualizacaoPortal } from "@/lib/visualizacao-filiado"

/**
 * Hospedagem conforme Filiados › Área do associado — vale também para a
 * página da reserva (/portal/hospedagem/reserva/[id]): suspensa, a faixa no
 * topo; desabilitada, cada página mostra o "indisponível" ela mesma, com o
 * que ainda se cancela (reservas futuras, cupons e lista de espera — cancelar
 * evita a falta e nunca é bloqueado), por isso o layout não a substitui.
 *
 * Layout e página renderizam em paralelo: a página confere de novo e, com a
 * parte desabilitada, só lê o que se cancela (pendenciasDaPessoa, que grava,
 * não roda). A trava das ações é a das actions (bloqueioDaParte).
 */
export default async function HospedagemLayout({ children }: { children: React.ReactNode }) {
  await requireVisualizacaoPortal()
  return (
    <GuardaParte parte="hospedagem" desabilitadaNaPagina>
      {children}
    </GuardaParte>
  )
}
