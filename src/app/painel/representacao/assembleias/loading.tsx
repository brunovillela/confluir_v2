import { Skeleton } from "@/components/ui/skeleton"

export default function AssembleiasLoading() {
  return (
    <>
      <div className="space-y-2">
        <Skeleton className="h-7 w-40" />
        <Skeleton className="h-4 w-72" />
      </div>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-24 w-full" />
        ))}
      </div>
      <Skeleton className="h-9 w-full max-w-xl" />
      <Skeleton className="h-96 w-full" />
    </>
  )
}
