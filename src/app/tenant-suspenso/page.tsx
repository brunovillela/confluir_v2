import type { Metadata } from "next"
import { PauseCircle } from "lucide-react"

export const metadata: Metadata = { title: "Organização suspensa — Confluir" }

export default function TenantSuspensoPage() {
  return (
    <main className="bg-muted/30 grid min-h-screen place-items-center p-6">
      <div className="bg-background w-full max-w-md rounded-xl border p-8 text-center shadow-sm">
        <PauseCircle className="text-warning-fg mx-auto mb-4 size-8" />
        <h1 className="text-xl font-semibold tracking-tight">
          Organização suspensa
        </h1>
        <p className="text-muted-foreground mt-2 text-sm">
          O acesso a esta organização está temporariamente suspenso. Fale com o
          responsável pela conta para regularizar.
        </p>
      </div>
    </main>
  )
}
