import { Skeleton } from "@/components/ui/skeleton"

/**
 * Esqueleto padrão dos HUBS de módulo (título + grade de cartões de área).
 * Usado pelos `loading.tsx`: como as páginas do painel são dinâmicas (dependem
 * de sessão e permissão), sem um fallback o Next segura a tela antiga até o
 * servidor responder — e o clique parece não ter funcionado.
 */
export function EsqueletoHub({
  cartoes = 6,
  comIndicadores = false,
}: {
  cartoes?: number
  comIndicadores?: boolean
}) {
  return (
    <>
      <div className="space-y-2">
        <Skeleton className="h-7 w-52" />
        <Skeleton className="h-3.5 w-80 max-w-full" />
      </div>
      {comIndicadores && (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-24 w-full" />
          ))}
        </div>
      )}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: cartoes }).map((_, i) => (
          <Skeleton key={i} className="h-28 w-full" />
        ))}
      </div>
    </>
  )
}

/** Esqueleto de páginas de LISTA (cabeçalho, filtros e tabela). */
export function EsqueletoLista({ linhas = 8 }: { linhas?: number }) {
  return (
    <>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-2">
          <Skeleton className="h-7 w-44" />
          <Skeleton className="h-3.5 w-64 max-w-full" />
        </div>
        <Skeleton className="h-9 w-36" />
      </div>
      <Skeleton className="h-9 w-full max-w-md" />
      <div className="space-y-px rounded-lg border p-3">
        {Array.from({ length: linhas }).map((_, i) => (
          <Skeleton key={i} className="h-9 w-full" />
        ))}
      </div>
    </>
  )
}
