import { Badge } from "@/components/ui/badge"
import { PROCESSANDO_VENCIDA, situacaoExibida } from "@/lib/ordens-situacoes"
import { cn } from "@/lib/utils"

/** Cores por situação da ordem de pagamento (valores reais do banco). */
const ESTILOS: Record<string, string> = {
  Paga: "border-success/40 text-success-fg",
  "A pagar": "border-info/40 text-info-fg",
  Processando: "border-warning/40 text-warning-fg",
  // Agendada e já vencida: o débito saiu e falta registrar o pagamento.
  [PROCESSANDO_VENCIDA]: "border-destructive/40 text-destructive",
  // Compra no cartão de crédito: quitada pela ordem da fatura.
  "Na fatura": "border-success/40 text-success-fg",
  "Em autorização": "border-warning/40 text-warning-fg",
  "Aguardando documento fiscal": "border-muted-foreground/40 text-muted-foreground",
  "Aguardando informações":
    "border-muted-foreground/40 text-muted-foreground",
  Cancelada: "border-destructive/40 text-destructive",
  // Legado do Bubble: o banco devolveu o pagamento.
  Estornado: "border-destructive/40 text-destructive",
}

/** Com o vencimento, "Processando" já vencida aparece como "Processando (vencida)". */
export function SituacaoBadge({ situacao, vencimento }: { situacao: string | null; vencimento?: string | null }) {
  const exibida = situacaoExibida(situacao, vencimento)
  if (!exibida) return <span className="text-muted-foreground">—</span>
  return (
    <Badge variant="outline" className={cn("whitespace-nowrap", ESTILOS[exibida])}>
      {exibida}
    </Badge>
  )
}
