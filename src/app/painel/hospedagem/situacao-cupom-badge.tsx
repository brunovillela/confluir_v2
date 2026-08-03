import { Badge } from "@/components/ui/badge"

/**
 * Situação derivada do cupom: cancelado > reservado (vinculado a um serviço)
 * > aguardando. A retirada do cupom não garante reserva nem serviço — por
 * isso "aguardando" é o estado de emissão.
 */
export function SituacaoCupomBadge({
  cancelado,
  servicoId,
}: {
  cancelado: boolean | null
  servicoId: string | null
}) {
  if (cancelado === true) {
    return (
      <Badge variant="outline" className="border-error/40 text-error-fg">
        Cancelado
      </Badge>
    )
  }
  if (servicoId) {
    return (
      <Badge
        variant="outline"
        className="border-success/40 text-success-fg"
      >
        Reservado
      </Badge>
    )
  }
  return (
    <Badge variant="outline" className="border-warning/40 text-warning-fg">
      Aguardando
    </Badge>
  )
}
