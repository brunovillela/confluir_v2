import { Badge } from "@/components/ui/badge"
import { ROTULOS_NIVEL_PROJETO, type NivelProjeto } from "@/lib/projetos-constantes"

const CORES: Record<NivelProjeto, string> = {
  atrasado: "border-destructive/40 text-destructive",
  atencao: "border-warning/40 text-warning-fg",
  no_prazo: "border-success/40 text-success-fg",
  finalizado: "text-muted-foreground",
}

/** Selo da situação calculada do projeto (carteira); os motivos vão no title. */
export function SeloSituacaoProjeto({ nivel, motivos = [] }: { nivel: NivelProjeto; motivos?: string[] }) {
  return (
    <Badge variant="outline" className={CORES[nivel]} title={motivos.length ? motivos.join(" · ") : undefined}>
      {ROTULOS_NIVEL_PROJETO[nivel]}
    </Badge>
  )
}
