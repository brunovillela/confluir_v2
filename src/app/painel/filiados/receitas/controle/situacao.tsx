import Link from "next/link"

import { formatarData, formatarMoeda } from "@/lib/formato"
import type { CelulaRepasse } from "@/lib/db/repasse"
import { ROTULO_SITUACAO, rotuloCompetencia, type Tom } from "@/lib/repasse"
import { cn } from "@/lib/utils"

export const CLASSE_TOM: Record<Tom, string> = {
  perigo: "bg-destructive/10 text-destructive border-destructive/30",
  alerta: "bg-warning/15 text-warning-fg border-warning/40",
  sucesso: "bg-success/15 text-success-fg border-success/30",
  info: "bg-info/10 text-info-fg border-info/30",
  neutro: "bg-muted text-muted-foreground border-transparent",
}

/** Explicação da célula (title): situação, valores e prazos. */
export function dicaCelula(c: CelulaRepasse): string {
  const s = ROTULO_SITUACAO[c.situacao]
  const partes = [`${rotuloCompetencia(c.competencia)}: ${s.rotulo}`]
  if (c.lancamentos > 0) partes.push(`${c.lancamentos} desconto(s), ${formatarMoeda(c.valor)}`)
  if (c.deposito !== null) partes.push(`Depósito: ${formatarMoeda(c.deposito)}`)
  if (c.situacao !== "nao_se_aplica") partes.push(`Prazo da relação: ${formatarData(c.prazoEnvio)}`)
  return partes.join(" · ")
}

/** Uma célula do quadro (empresa × competência). */
export function CelulaSituacao({ celula, href, selecionada }: { celula: CelulaRepasse; href: string; selecionada?: boolean }) {
  const s = ROTULO_SITUACAO[celula.situacao]
  return (
    <Link
      href={href}
      title={dicaCelula(celula)}
      className={cn(
        "flex h-10 min-w-14 items-center justify-center rounded-md border px-1 text-center text-[11px] leading-tight font-medium transition-opacity hover:opacity-80",
        CLASSE_TOM[s.tom],
        selecionada && "ring-ring ring-2 ring-offset-1"
      )}
    >
      {s.curto}
    </Link>
  )
}

export function SeloSituacao({ situacao }: { situacao: CelulaRepasse["situacao"] }) {
  const s = ROTULO_SITUACAO[situacao]
  return (
    <span className={cn("inline-flex items-center rounded-md border px-2 py-0.5 text-xs font-medium", CLASSE_TOM[s.tom])}>
      {s.rotulo}
    </span>
  )
}
