import { Skeleton } from "@/components/ui/skeleton"

export default function Loading() {
  return (
    <div className="grid gap-4">
      <Skeleton className="h-8 w-64" />
      <Skeleton className="h-9 w-96" />
      <Skeleton className="h-96" />
    </div>
  )
}
