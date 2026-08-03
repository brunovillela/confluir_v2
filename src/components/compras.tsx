import { Badge } from "@/components/ui/badge"
import { cn } from "@/lib/utils"
import {
  ROTULOS_SITUACAO_PROCESSO,
  type SituacaoProcesso,
} from "@/lib/compras-constantes"
import { TIPOS_CONTRATO, type Vigencia } from "@/lib/contratos-constantes"

const ESTILOS: Record<SituacaoProcesso, string> = {
  solicitada: "border-info/40 text-info-fg",
  em_cotacao: "border-warning/40 text-warning-fg",
  cotada: "border-warning/40 text-warning-fg",
  comprada: "border-info/40 text-info-fg",
  recebida: "border-success/40 text-success-fg",
  cancelada: "border-destructive/40 text-destructive",
}

export function SituacaoProcessoBadge({
  situacao,
}: {
  situacao: SituacaoProcesso
}) {
  return (
    <Badge
      variant="outline"
      className={cn("whitespace-nowrap", ESTILOS[situacao])}
    >
      {ROTULOS_SITUACAO_PROCESSO[situacao]}
    </Badge>
  )
}

/** Modalidade do processo: direta × via setor de compras (null = legado). */
export function AquisicaoBadge({ direta }: { direta: boolean | null }) {
  if (direta === null) {
    return <span className="text-muted-foreground">—</span>
  }
  return (
    <Badge variant="outline" className="whitespace-nowrap">
      {direta ? "Direta" : "Via Compras"}
    </Badge>
  )
}

const ESTILO_VIGENCIA: Record<Vigencia, string> = {
  vigente: "border-success/40 text-success-fg",
  vencendo: "border-warning/40 text-warning-fg",
  vencido: "border-destructive/40 text-destructive",
  sem_termo: "text-muted-foreground",
}

const ROTULO_VIGENCIA: Record<Vigencia, string> = {
  vigente: "Vigente",
  vencendo: "Vencendo",
  vencido: "Vencido",
  sem_termo: "Sem termo",
}

/** Situação de vigência do contrato, derivada das datas. */
export function VigenciaContratoBadge({ vigencia }: { vigencia: Vigencia }) {
  return (
    <Badge
      variant="outline"
      className={cn("whitespace-nowrap", ESTILO_VIGENCIA[vigencia])}
    >
      {ROTULO_VIGENCIA[vigencia]}
    </Badge>
  )
}

/** Tipos do contrato (booleanos independentes) como badges lado a lado. */
export function TiposContratoBadges({
  aditivo,
  sob_demanda,
  apoio_institucional,
}: {
  aditivo: boolean
  sob_demanda: boolean
  apoio_institucional: boolean
}) {
  const ativos = { aditivo, sob_demanda, apoio_institucional }
  const rotulos = TIPOS_CONTRATO.filter((t) => ativos[t.chave])
  if (rotulos.length === 0) return <span className="text-muted-foreground">—</span>
  return (
    <span className="flex flex-wrap gap-1">
      {rotulos.map((t) => (
        <Badge key={t.chave} variant="secondary" className="whitespace-nowrap">
          {t.rotulo}
        </Badge>
      ))}
    </span>
  )
}
