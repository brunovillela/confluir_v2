import { History } from "lucide-react"

import type { EventoDeliberacao } from "@/lib/db/deliberacoes"

const QUANDO = new Intl.DateTimeFormat("pt-BR", {
  timeZone: "America/Sao_Paulo",
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
})

const VERBO: Record<EventoDeliberacao["evento"], string> = {
  criada: "registrou",
  alterada: "alterou",
  excluida: "excluiu",
}

/**
 * Trilha de uma deliberação (ou das excluídas da ata): quem, quando e, nas
 * alterações, cada campo de → para. Recolhida por padrão.
 */
export function TrilhaDeliberacao({
  eventos,
  titulo = "Histórico",
  comAssunto = false,
}: {
  eventos: EventoDeliberacao[]
  titulo?: string
  /** Mostra o assunto em todo evento — na trilha das excluídas, que não estão mais na lista. */
  comAssunto?: boolean
}) {
  if (eventos.length === 0) return null
  return (
    <details className="mt-1.5 text-xs">
      <summary className="text-muted-foreground hover:text-foreground flex w-fit cursor-pointer items-center gap-1">
        <History className="size-3.5" />
        {titulo} ({eventos.length})
      </summary>
      <ol className="mt-1.5 grid gap-1.5 border-l pl-3">
        {eventos.map((e) => (
          <li key={e.id}>
            <span className="text-muted-foreground tabular-nums">{QUANDO.format(new Date(e.quando))}</span>
            {" — "}
            <span className="font-medium">{e.autorNome ?? "alguém"}</span> {VERBO[e.evento]}
            {(comAssunto || e.evento === "excluida") && e.assunto && <> “{e.assunto}”</>}
            {e.origem === "ia" && " (lida do PDF da ata)"}
            {e.evento === "alterada" && e.mudancas.length > 0 && (
              <ul className="text-muted-foreground mt-0.5 grid gap-0.5">
                {e.mudancas.map((m, i) => (
                  <li key={i}>
                    {m.campo}: <span className="line-through">{m.antes ?? "—"}</span> → {m.depois ?? "—"}
                  </li>
                ))}
              </ul>
            )}
          </li>
        ))}
      </ol>
    </details>
  )
}
