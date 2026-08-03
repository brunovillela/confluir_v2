import type { Metadata } from "next"
import { Building2 } from "lucide-react"

export const metadata: Metadata = { title: "Organização não encontrada — Confluir" }

export default function TenantInexistentePage() {
  return (
    <main className="bg-muted/30 grid min-h-screen place-items-center p-6">
      <div className="bg-background w-full max-w-md rounded-xl border p-8 text-center shadow-sm">
        <Building2 className="text-muted-foreground mx-auto mb-4 size-8" />
        <h1 className="text-xl font-semibold tracking-tight">
          Organização não encontrada
        </h1>
        <p className="text-muted-foreground mt-2 text-sm">
          O endereço acessado não corresponde a nenhuma organização ativa no
          Confluir. Confira o subdomínio ou fale com quem passou o link.
        </p>
      </div>
    </main>
  )
}
