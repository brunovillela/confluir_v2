import { Skeleton } from "@/components/ui/skeleton"

/** Esqueleto da Área do associado: cabeçalho, portal inteiro, resumo e cartões. */
export default function AreaDoAssociadoLoading() {
  return (
    <>
      <div className="space-y-2">
        <Skeleton className="h-7 w-24" />
        <Skeleton className="h-7 w-56" />
        <Skeleton className="h-3.5 w-full max-w-2xl" />
        <Skeleton className="h-3.5 w-3/4 max-w-xl" />
      </div>
      <Skeleton className="h-64 w-full" />
      <div className="grid gap-4 lg:grid-cols-2">
        <Skeleton className="h-36 w-full" />
        <Skeleton className="h-36 w-full" />
      </div>
      {Array.from({ length: 3 }).map((_, i) => (
        <div key={i} className="grid gap-4">
          <Skeleton className="h-6 w-40" />
          <Skeleton className="h-48 w-full" />
        </div>
      ))}
    </>
  )
}
