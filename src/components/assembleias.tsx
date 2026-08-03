import { Badge } from "@/components/ui/badge"
import { cn } from "@/lib/utils"
import {
  ROTULOS_MODALIDADE,
  type Modalidade,
} from "@/lib/assembleias-constantes"

const ESTILOS: Record<Modalidade, string> = {
  online: "border-info/40 text-info-fg",
  urna: "border-warning/40 text-warning-fg",
  reuniao: "border-success/40 text-success-fg",
}

export function ModalidadeBadge({ modalidade }: { modalidade: Modalidade }) {
  return (
    <Badge
      variant="outline"
      className={cn("whitespace-nowrap", ESTILOS[modalidade])}
    >
      {ROTULOS_MODALIDADE[modalidade]}
    </Badge>
  )
}

export function ApuracaoBadge({ encerrada }: { encerrada: boolean }) {
  return (
    <Badge variant={encerrada ? "secondary" : "info"} className="whitespace-nowrap">
      {encerrada ? "Apuração encerrada" : "Em andamento"}
    </Badge>
  )
}
