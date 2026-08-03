import type { Metadata } from "next"
import Link from "next/link"
import { Info } from "lucide-react"

import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { requirePermissao } from "@/lib/auth"
import { empresasParaSelecao } from "@/lib/db/cipa-apoio"

import { ReuniaoForm } from "../cipa-forms"

export const metadata: Metadata = { title: "Registrar convite — Confluir" }

export default async function NovaReuniaoCipaPage() {
  await requirePermissao("saude_cat", ["saude_atendimento", "saude_gestao"])
  const empresas = await empresasParaSelecao()

  return (
    <>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">
            Registrar convite
          </h1>
          <p className="text-muted-foreground mt-1 text-xs">
            Reunião de CIPA em empresa
          </p>
        </div>
        <Button variant="outline" asChild>
          <Link href="/painel/saude/cipa">Voltar à lista</Link>
        </Button>
      </div>

      <Alert>
        <Info />
        <AlertDescription>
          Registre o convite mesmo quando não houver representação. Recusa e
          ausência ficam gravadas — é o que permite responder “com que
          frequência somos chamados e com que frequência vamos”. Os
          representantes e a ata são adicionados depois, na página da reunião.
        </AlertDescription>
      </Alert>

      <ReuniaoForm empresas={empresas} />
    </>
  )
}
