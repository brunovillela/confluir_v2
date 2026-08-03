import type { Metadata } from "next"
import Link from "next/link"
import { ArrowLeft } from "lucide-react"

import { Button } from "@/components/ui/button"
import { requirePermissao } from "@/lib/auth"

import { HotelForm } from "../hotel-form"

export const metadata: Metadata = { title: "Novo hotel parceiro — Confluir" }

export default async function NovoHotelPage() {
  await requirePermissao("filiacao_hospedagens_gestao")

  return (
    <>
      <div>
        <Button variant="ghost" size="sm" asChild className="-ml-2 mb-3">
          <Link href="/painel/hospedagem/hoteis">
            <ArrowLeft />
            Hotéis parceiros
          </Link>
        </Button>
        <h1 className="text-2xl font-semibold tracking-tight">Novo hotel parceiro</h1>
        <p className="text-muted-foreground mt-1 text-xs">
          Hotel conveniado que fica disponível para os associados. As tarifas são
          cadastradas depois, na página do hotel.
        </p>
      </div>
      <HotelForm />
    </>
  )
}
