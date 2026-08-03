import type { Metadata } from "next"
import Link from "next/link"
import { ArrowLeft } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { requirePermissao } from "@/lib/auth"

import { RegistroForm } from "../registro-form"

export const metadata: Metadata = { title: "Novo registro (MTE) — Confluir" }

export default async function NovoRegistroPage() {
  await requirePermissao("registro_mte")

  return (
    <>
      <div>
        <Button variant="ghost" size="sm" asChild className="-ml-2 mb-3">
          <Link href="/painel/institucional/registro-mte">
            <ArrowLeft />
            Registro sindical (MTE)
          </Link>
        </Button>
        <h1 className="text-2xl font-semibold tracking-tight">Novo registro</h1>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Dados do registro</CardTitle>
        </CardHeader>
        <CardContent>
          <RegistroForm aoCancelarHref="/painel/institucional/registro-mte" />
        </CardContent>
      </Card>
    </>
  )
}
