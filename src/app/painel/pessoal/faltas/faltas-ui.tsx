import { Badge } from "@/components/ui/badge"
import { urlArquivoPessoal } from "@/lib/db/pessoal"
import { ROTULO_SITUACAO_FALTA, type SituacaoFalta } from "@/lib/faltas-constantes"

const CLASSE_SITUACAO: Record<SituacaoFalta, string> = {
  aguardando: "border-warning/40 text-warning-fg",
  autorizada: "border-success/40 text-success-fg",
  recusada: "border-destructive/40 text-destructive",
}

export function BadgeFalta({ situacao }: { situacao: SituacaoFalta }) {
  return (
    <Badge variant="outline" className={`whitespace-nowrap ${CLASSE_SITUACAO[situacao]}`}>
      {ROTULO_SITUACAO_FALTA[situacao]}
    </Badge>
  )
}

export async function LinkComprovacao({ caminho }: { caminho: string | null }) {
  const url = await urlArquivoPessoal(caminho)
  if (!url) return <span className="text-muted-foreground">—</span>
  return (
    <a href={url} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">
      Abrir
    </a>
  )
}
