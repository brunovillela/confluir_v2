import Link from "next/link"
import { LinkIcon } from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { semLinkUrgente, type RodadaSemLink } from "@/lib/db/votacao-sem-link"

/**
 * Selo "N sem link" nas listas (campanhas e rodadas): aptos que ainda não
 * votaram e estão sem o link pessoal, numa votação pela internet por abrir ou
 * aberta. Âmbar com até 48 h para abrir ou aberta; neutro antes disso.
 */
export function SeloSemLink({ itens, href }: { itens: RodadaSemLink[]; href: string }) {
  if (itens.length === 0) return null
  const total = itens.reduce((s, r) => s + r.semLink, 0)
  const urgente = itens.some((r) => semLinkUrgente(r))
  return (
    <Badge
      variant="outline"
      className={urgente ? "border-warning/50 bg-warning/10 text-warning-fg" : "text-muted-foreground"}
      title="Aptos que ainda não votaram e estão sem o link pessoal de voto — dependem do código por e-mail."
      asChild
    >
      <Link href={href}>
        <LinkIcon />
        {total.toLocaleString("pt-BR")} sem link
      </Link>
    </Badge>
  )
}
