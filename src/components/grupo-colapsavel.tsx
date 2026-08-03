import { ChevronDown } from "lucide-react"

/**
 * Grupo recolhido por padrão (details/summary nativo — funciona sem JS):
 * clique no cabeçalho expõe o conteúdo para preenchimento/edição.
 */
export function GrupoColapsavel({
  titulo,
  descricao,
  resumo,
  aberto = false,
  children,
}: {
  titulo: string
  descricao?: string
  /** Conteúdo à direita do cabeçalho (estado atual, contadores…). */
  resumo?: React.ReactNode
  aberto?: boolean
  children: React.ReactNode
}) {
  return (
    <details
      open={aberto}
      className="bg-card text-card-foreground group rounded-xl border shadow-sm"
    >
      <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-6 py-4 [&::-webkit-details-marker]:hidden">
        <span className="min-w-0">
          <span className="block leading-none font-semibold">{titulo}</span>
          {descricao && (
            <span className="text-muted-foreground mt-1.5 block text-sm">
              {descricao}
            </span>
          )}
        </span>
        <span className="flex shrink-0 items-center gap-3">
          {resumo}
          <ChevronDown className="text-muted-foreground size-4 transition-transform group-open:rotate-180" />
        </span>
      </summary>
      <div className="border-t px-6 py-4">{children}</div>
    </details>
  )
}
