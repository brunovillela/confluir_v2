import Link from "next/link"
import type { LucideIcon } from "lucide-react"

import { cn } from "@/lib/utils"

/**
 * Abas de visão de uma tela (Lista, Quadro, Calendário…), como links: a
 * visão vai na URL e os filtros seguem junto.
 */
export function AbasVisao({
  abas,
  atual,
}: {
  abas: { id: string; rotulo: string; href: string; icone: LucideIcon }[]
  atual: string
}) {
  return (
    <nav aria-label="Visão" className="bg-muted inline-flex w-fit flex-wrap gap-1 rounded-lg p-1">
      {abas.map((a) => {
        const Icone = a.icone
        const ativa = a.id === atual
        return (
          <Link
            key={a.id}
            href={a.href}
            aria-current={ativa ? "page" : undefined}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm transition-colors",
              ativa ? "bg-background font-medium shadow-xs" : "text-muted-foreground hover:text-foreground"
            )}
          >
            <Icone className="size-4" />
            {a.rotulo}
          </Link>
        )
      })}
    </nav>
  )
}
