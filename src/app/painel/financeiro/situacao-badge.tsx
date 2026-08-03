import { Badge } from "@/components/ui/badge"
import { cn } from "@/lib/utils"

/** Cores por situação da ordem de pagamento (valores reais do banco). */
const ESTILOS: Record<string, string> = {
  Paga: "border-success/40 text-success-fg",
  "A pagar": "border-info/40 text-info-fg",
  Processando: "border-warning/40 text-warning-fg",
  "Em autorização": "border-warning/40 text-warning-fg",
  "Aguardando informações":
    "border-muted-foreground/40 text-muted-foreground",
  Cancelada: "border-destructive/40 text-destructive",
}

export function SituacaoBadge({ situacao }: { situacao: string | null }) {
  if (!situacao) return <span className="text-muted-foreground">—</span>
  return (
    <Badge variant="outline" className={cn("whitespace-nowrap", ESTILOS[situacao])}>
      {situacao}
    </Badge>
  )
}
