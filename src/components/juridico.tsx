import { Badge } from "@/components/ui/badge"
import {
  ROTULOS_SITUACAO_REEMBOLSO,
  type SituacaoReembolsoExibida,
} from "@/lib/juridico-constantes"

const VARIANTE: Record<
  SituacaoReembolsoExibida,
  "secondary" | "outline" | "success" | "warning" | "destructive"
> = {
  aguardando: "warning",
  aprovado: "secondary",
  pago: "success",
  reprovado: "destructive",
}

export function SituacaoReembolsoBadge({
  situacao,
}: {
  situacao: SituacaoReembolsoExibida
}) {
  return (
    <Badge variant={VARIANTE[situacao]}>
      {ROTULOS_SITUACAO_REEMBOLSO[situacao]}
    </Badge>
  )
}
