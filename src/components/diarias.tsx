import { Badge } from "@/components/ui/badge"
import type { SituacaoDiaria } from "@/lib/db/diarias"

/** Badge de situação da solicitação de diária (gestão e funcionário). */
export function SituacaoDiariaBadge({
  situacao,
}: {
  situacao: SituacaoDiaria
}) {
  if (situacao === "aprovada") {
    return (
      <Badge variant="outline" className="border-success/40 text-success-fg">
        Aprovada
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
  if (situacao === "reprovada") {
    return (
      <Badge
        variant="outline"
        className="border-destructive/40 text-destructive"
      >
        Reprovada
      </Badge>
    )
  }
  return (
    <Badge variant="outline" className="text-muted-foreground">
      Cancelada
    </Badge>
  )
}
