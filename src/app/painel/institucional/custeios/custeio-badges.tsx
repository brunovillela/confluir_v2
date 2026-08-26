import { Badge } from "@/components/ui/badge"
import {
  ROTULOS_SITUACAO_CUSTEIO,
  type SituacaoCusteio,
} from "@/lib/custeio-constantes"

const CLASSE: Record<string, string> = {
  rascunho: "",
  aguardando_autorizacao: "border-warning/40 text-warning-fg",
  autorizado: "border-success/40 text-success-fg",
  reprovado: "border-destructive/40 text-destructive",
  cancelado: "opacity-70",
}

/** Badge da situação interna do custeio (antes da alçada do Financeiro). */
export function SituacaoCusteioBadge({ situacao }: { situacao: string }) {
  const s = situacao as SituacaoCusteio
  const rotulo = ROTULOS_SITUACAO_CUSTEIO[s] ?? situacao
  return (
    <Badge variant="outline" className={CLASSE[s] ?? ""}>
      {rotulo}
    </Badge>
  )
}
