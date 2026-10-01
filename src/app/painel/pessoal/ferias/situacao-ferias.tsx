import { Badge } from "@/components/ui/badge"
import {
  ROTULO_SITUACAO,
  type ChaveSituacao,
  type SituacaoFuncionario,
} from "@/lib/ferias-painel"
import { formatarData } from "@/lib/formato"

/** Status sempre com rótulo (nunca só a cor). */
const CLASSE: Record<ChaveSituacao, string> = {
  vencido: "border-destructive/40 text-destructive",
  vencendo: "border-warning/40 text-warning-fg",
  em_ferias: "border-info/40 text-info-fg",
  marcadas: "border-success/40 text-success-fg",
  sem_periodo: "text-muted-foreground",
  em_dia: "text-muted-foreground",
}

export function BadgeSituacao({ chave }: { chave: ChaveSituacao }) {
  return (
    <Badge variant="outline" className={CLASSE[chave]}>
      {ROTULO_SITUACAO[chave]}
    </Badge>
  )
}

/** "até 10/10", "a partir de 05/11", "vence em 32 dias", "venceu em 30/09". */
export function DetalheSituacao({ situacao }: { situacao: SituacaoFuncionario }) {
  const d = situacao.detalhe
  if (!d) return null
  switch (d.tipo) {
    case "ate":
      return <>até {formatarData(String(d.valor))}</>
    case "desde":
      return <>a partir de {formatarData(String(d.valor))}</>
    case "em_dias":
      return <>vence em {d.valor} dia{d.valor === 1 ? "" : "s"}</>
    case "venceu_em":
      return <>venceu em {formatarData(String(d.valor))}</>
  }
}
