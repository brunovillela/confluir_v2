import { Badge } from "@/components/ui/badge"
import type { SituacaoReembolso } from "@/lib/db/reembolsos"

/** Badge de situação do reembolso de ACT (gestão e funcionário). */
export function SituacaoReembolsoBadge({
  situacao,
}: {
  situacao: SituacaoReembolso
}) {
  if (situacao === "pago") {
    return (
      <Badge variant="outline" className="border-success/40 text-success-fg">
        Pago
      </Badge>
    )
  }
  if (situacao === "aprovado") {
    return (
      <Badge variant="outline" className="border-info/40 text-info-fg">
        Aprovado
      </Badge>
    )
  }
  if (situacao === "aguardando") {
    return (
      <Badge variant="outline" className="border-warning/40 text-warning-fg">
        Aguardando
      </Badge>
    )
  }
  if (situacao === "reprovado") {
    return (
      <Badge
        variant="outline"
        className="border-destructive/40 text-destructive"
      >
        Reprovado
      </Badge>
    )
  }
  return (
    <Badge variant="outline" className="text-muted-foreground">
      Cancelado
    </Badge>
  )
}
