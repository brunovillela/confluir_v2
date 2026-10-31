import { Lock } from "lucide-react"

import { Badge } from "@/components/ui/badge"
import {
  ROTULO_SIGILO_DELIBERACAO,
  ROTULO_SITUACAO_DELIBERACAO,
  type SigiloDeliberacao,
  type SituacaoDeliberacao,
} from "@/lib/deliberacoes-constantes"
import { cn } from "@/lib/utils"

const COR_SITUACAO: Record<SituacaoDeliberacao, string> = {
  a_cumprir: "border-warning/40 text-warning-fg",
  em_execucao: "border-info/40 text-info-fg",
  cumprida: "border-success/40 text-success-fg",
  cancelada: "border-muted-foreground/40 text-muted-foreground",
}

const COR_SIGILO: Record<SigiloDeliberacao, string> = {
  livre: "border-muted-foreground/30 text-muted-foreground",
  reservado: "border-warning/40 text-warning-fg",
  restrito: "border-destructive/40 text-destructive",
}

export function SeloSituacao({ situacao }: { situacao: SituacaoDeliberacao }) {
  return (
    <Badge variant="outline" className={cn("whitespace-nowrap", COR_SITUACAO[situacao])}>
      {ROTULO_SITUACAO_DELIBERACAO[situacao]}
    </Badge>
  )
}

export function SeloSigilo({ sigilo }: { sigilo: SigiloDeliberacao }) {
  return (
    <Badge variant="outline" className={cn("whitespace-nowrap", COR_SIGILO[sigilo])}>
      {sigilo !== "livre" && <Lock className="size-3" />}
      {ROTULO_SIGILO_DELIBERACAO[sigilo]}
    </Badge>
  )
}
