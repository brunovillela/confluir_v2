import { Video } from "lucide-react"

import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import { diaCurto, hojeEmBrasilia, type SalaVirtual } from "@/lib/assembleias-constantes"

/** "hoje às 14:00", "12/10 às 14:00" — ou só o que houver. */
function quandoDaSala(sala: SalaVirtual): string | null {
  const dia = sala.data ? (sala.data === hojeEmBrasilia() ? "hoje" : diaCurto(sala.data)) : null
  if (dia && sala.hora) return `${dia} às ${sala.hora}`
  return dia ?? (sala.hora ? `às ${sala.hora}` : null)
}

/**
 * Link da sala da assembleia virtual (reunião online), para quem está apto
 * (achado A47). Ele ia só no e-mail do aviso e no WhatsApp: quem apagou o
 * e-mail ou foi avisado só pelo sino entrava no portal no dia e não achava a
 * reunião. O link só chega aqui enquanto a data da sala não passou
 * (salaDaLinha em lib/db/votacao-portal.ts).
 */
export function SalaVirtualAviso({
  sala,
  className,
}: {
  sala: SalaVirtual
  className?: string
}) {
  const quando = quandoDaSala(sala)
  return (
    <div
      className={cn(
        "flex flex-wrap items-center justify-between gap-x-3 gap-y-2 rounded-lg border p-3",
        className
      )}
    >
      <p className="flex min-w-0 items-start gap-2 text-sm">
        <Video className="text-muted-foreground mt-0.5 size-4 shrink-0" />
        <span>
          <span className="font-medium">Assembleia virtual</span>
          {quando && (
            <>
              {" "}
              {quando}{" "}
              <span className="text-muted-foreground">(horário de Brasília)</span>
            </>
          )}
        </span>
      </p>
      {/* Reunião é de fora do Confluir (Meet, Zoom, Teams): abre à parte. */}
      <Button variant="outline" asChild>
        <a href={sala.link} target="_blank" rel="noopener noreferrer">
          <Video />
          Entrar na sala
          <span className="sr-only"> (abre em nova aba)</span>
        </a>
      </Button>
    </div>
  )
}
