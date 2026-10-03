import Link from "next/link"
import { Inbox } from "lucide-react"

import { Button } from "@/components/ui/button"

/** Contador da caixa de entrada no cabeçalho (ao lado do sino). */
export function PendenciasIndicador({ total }: { total: number }) {
  return (
    <Button variant="ghost" size="icon" asChild className="relative">
      <Link href="/painel#caixa-entrada" aria-label={`Caixa de entrada: ${total} pendência${total === 1 ? "" : "s"}`}>
        <Inbox />
        {total > 0 && (
          <span className="bg-primary text-primary-foreground absolute -top-0.5 -right-0.5 flex h-4 min-w-4 items-center justify-center rounded-full px-1 text-[10px] leading-none font-semibold tabular-nums">
            {total > 99 ? "99+" : total}
          </span>
        )}
      </Link>
    </Button>
  )
}
