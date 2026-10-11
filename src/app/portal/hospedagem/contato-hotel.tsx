import { MapPin, Phone } from "lucide-react"

import type { ContatoHotel } from "@/lib/db/filiado-portal"
import { formatarTelefone } from "@/lib/formato"
import { cn } from "@/lib/utils"

/**
 * Endereço (abre o mapa) e telefone (liga com um toque) do hotel — no
 * formulário, depois de escolher o hotel, e na página da reserva (achado
 * A40). Cada linha é um link de 44 px no toque. Sem contato cadastrado, nada.
 */
export function ContatoDoHotel({
  contato,
  className,
}: {
  contato: ContatoHotel | null | undefined
  className?: string
}) {
  if (!contato || (!contato.endereco && !contato.telefone)) return null
  const link =
    "inline-flex items-start gap-2 rounded-md text-sm underline-offset-3 hover:underline focus-visible:ring-3 focus-visible:ring-ring/50 outline-none pointer-coarse:min-h-11 pointer-coarse:items-center"
  return (
    <div className={cn("grid gap-1", className)}>
      {contato.endereco &&
        (contato.mapa ? (
          <a href={contato.mapa} target="_blank" rel="noreferrer" className={link}>
            <MapPin aria-hidden className="text-muted-foreground mt-0.5 size-4 shrink-0" />
            <span>
              {contato.endereco}
              <span className="sr-only"> (abre o mapa)</span>
            </span>
          </a>
        ) : (
          <p className="flex items-start gap-2 text-sm">
            <MapPin aria-hidden className="text-muted-foreground mt-0.5 size-4 shrink-0" />
            {contato.endereco}
          </p>
        ))}
      {contato.telefone &&
        (contato.tel ? (
          <a href={contato.tel} className={link}>
            <Phone aria-hidden className="text-muted-foreground mt-0.5 size-4 shrink-0" />
            {formatarTelefone(contato.telefone)}
          </a>
        ) : (
          <p className="flex items-start gap-2 text-sm">
            <Phone aria-hidden className="text-muted-foreground mt-0.5 size-4 shrink-0" />
            {contato.telefone}
          </p>
        ))}
    </div>
  )
}
