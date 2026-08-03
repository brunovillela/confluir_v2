import { Skeleton } from "@/components/ui/skeleton"

export default function PessoalLoading() {
  return (
    <>
      <div className="space-y-2">
        <Skeleton className="h-7 w-32" />
        <Skeleton className="h-4 w-64" />
      </div>
      <div className="flex items-center gap-3">
        <Skeleton className="h-9 w-full max-w-sm" />
        <Skeleton className="h-9 w-20" />
        <div className="ml-auto flex gap-1.5">
          <Skeleton className="h-8 w-16" />
          <Skeleton className="h-8 w-24" />
          <Skeleton className="h-8 w-16" />
        </div>
      </div>
      <div className="space-y-px overflow-hidden rounded-xl border p-1">
        <Skeleton className="h-10 w-full" />
        {Array.from({ length: 12 }).map((_, i) => (
          <Skeleton key={i} className="h-11 w-full opacity-70" />
        ))}
      </div>
    </>
  )
}
