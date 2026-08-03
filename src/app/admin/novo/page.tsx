import type { Metadata } from "next"
import Link from "next/link"
import { ArrowLeft } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"

import { NovoTenantForm } from "../tenant-forms"

export const metadata: Metadata = { title: "Nova organização — Confluir Plataforma" }

export default function NovoTenantPage() {
  return (
    <>
      <div>
        <Button variant="ghost" size="sm" asChild className="-ml-2 mb-2">
          <Link href="/admin">
            <ArrowLeft />
            Organizações
          </Link>
        </Button>
        <h1 className="text-2xl font-semibold tracking-tight">
          Nova organização
        </h1>
        <p className="text-muted-foreground mt-1 text-xs">
          Cria o tenant e o seu administrador, que recebe o convite de acesso
        </p>
      </div>
      <Card>
        <CardContent>
          <NovoTenantForm />
        </CardContent>
      </Card>
    </>
  )
}
