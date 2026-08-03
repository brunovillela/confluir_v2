import Link from "next/link"
import { Bell } from "lucide-react"

import { Button } from "@/components/ui/button"

/** Sino do header: contador de não lidas + atalho para o histórico. */
export function SinoNotificacoes({ naoLidas }: { naoLidas: number }) {
  return (
    <Button variant="ghost" size="icon" asChild className="relative">
      <Link href="/painel/notificacoes" aria-label="Notificações">
        <Bell />
        {naoLidas > 0 && (
          <span className="bg-primary text-primary-foreground absolute -top-0.5 -right-0.5 flex h-4 min-w-4 items-center justify-center rounded-full px-1 text-[10px] font-semibold tabular-nums">
            {naoLidas > 99 ? "99+" : naoLidas}
          </span>
        )}
      </Link>
    </Button>
  )
}
