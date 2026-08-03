import { Badge } from "@/components/ui/badge"
import { cn } from "@/lib/utils"

/** Cores por condição da filiação (valores reais do banco — ver lib/filiacao.ts). */
const ESTILOS: Record<string, string> = {
  Ativo: "border-success/40 text-success-fg",
  Inativo: "text-muted-foreground",
  Falecido: "border-foreground/40 text-foreground",
  "Excluído(a) do quadro associativo": "border-destructive/40 text-destructive",
  "Aguarda ficha assinada":
    "border-warning/40 text-warning-fg",
  "Filiação aguarda fonte":
    "border-warning/40 text-warning-fg",
  "Desfiliação aguarda fonte":
    "border-warning bg-warning/10 text-warning-fg",
  "Desfiliação não informada à fonte":
    "border-warning bg-warning/10 text-warning-fg",
  "Filiação não informada à fonte":
    "border-warning bg-warning/10 text-warning-fg",
}

export function CondicaoBadge({ condicao }: { condicao: string | null }) {
  if (!condicao) {
    return (
      <Badge variant="outline" className="text-muted-foreground">
        Sem condição
      </Badge>
    )
  }
  return (
    <Badge
      variant="outline"
      className={cn("whitespace-nowrap", ESTILOS[condicao])}
    >
      {condicao}
    </Badge>
  )
}
