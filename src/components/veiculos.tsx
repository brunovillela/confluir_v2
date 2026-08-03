import { Badge } from "@/components/ui/badge"
import { cn } from "@/lib/utils"
import {
  ROTULOS_SITUACAO_AGENDAMENTO,
  ROTULOS_SITUACAO_COBRANCA,
  type SituacaoAgendamento,
  type SituacaoCobranca,
} from "@/lib/veiculos-constantes"

const ESTILOS_AGENDAMENTO: Record<SituacaoAgendamento, string> = {
  solicitada: "border-warning/40 text-warning-fg",
  atendida: "border-info/40 text-info-fg",
  retirada: "border-info/40 text-info-fg",
  concluida: "border-success/40 text-success-fg",
  negada: "border-destructive/40 text-destructive",
  cancelada: "border-destructive/40 text-destructive",
  expirada: "text-muted-foreground",
}

export function SituacaoAgendamentoBadge({
  situacao,
}: {
  situacao: SituacaoAgendamento
}) {
  return (
    <Badge
      variant="outline"
      className={cn("whitespace-nowrap", ESTILOS_AGENDAMENTO[situacao])}
    >
      {ROTULOS_SITUACAO_AGENDAMENTO[situacao]}
    </Badge>
  )
}

const ESTILOS_COBRANCA: Record<SituacaoCobranca, string> = {
  pendente: "border-warning/40 text-warning-fg",
  baixada: "border-success/40 text-success-fg",
  isenta: "border-info/40 text-info-fg",
}

/** Situação da cobrança da multa ao infrator (null = legado sem gestão). */
export function CobrancaBadge({
  situacao,
}: {
  situacao: SituacaoCobranca | null
}) {
  if (!situacao) return <span className="text-muted-foreground">—</span>
  return (
    <Badge
      variant="outline"
      className={cn("whitespace-nowrap", ESTILOS_COBRANCA[situacao])}
    >
      {ROTULOS_SITUACAO_COBRANCA[situacao]}
    </Badge>
  )
}

/** Veículo na rua ou na garagem (null = rodar supabase/veiculos.sql). */
export function EmUsoBadge({ emUso }: { emUso: boolean | null }) {
  if (emUso === null) return <span className="text-muted-foreground">—</span>
  return (
    <Badge
      variant="outline"
      className={cn(
        "whitespace-nowrap",
        emUso ? "border-warning/40 text-warning-fg" : "border-success/40 text-success-fg"
      )}
    >
      {emUso ? "Em uso" : "Disponível"}
    </Badge>
  )
}
