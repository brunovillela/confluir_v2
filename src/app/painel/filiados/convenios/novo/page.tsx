import type { Metadata } from "next"
import Link from "next/link"
import { ArrowLeft } from "lucide-react"

import { Button } from "@/components/ui/button"
import { requirePermissao } from "@/lib/auth"
import {
  listarCategoriasConvenio,
  listarConveniadores,
} from "@/lib/db/filiacao-convenios-edicao"

import { ConvenioForm } from "../convenio-form"

export const metadata: Metadata = { title: "Novo convênio — Confluir" }

export default async function NovoConvenioPage() {
  await requirePermissao("filiacao_convenios", ["filiacao_gestao"])
  const [categorias, conveniadores] = await Promise.all([
    listarCategoriasConvenio(),
    listarConveniadores(),
  ])

  return (
    <>
      <div>
        <Button asChild variant="ghost" size="sm" className="-ml-2 mb-3">
          <Link href="/painel/filiados/convenios">
            <ArrowLeft />
            Convênios
          </Link>
        </Button>
        <h1 className="text-2xl font-semibold tracking-tight">Novo convênio</h1>
        <p className="text-muted-foreground mt-1 text-sm">
          Depois de criar, você adiciona as unidades de atendimento e anexa o contrato.
        </p>
      </div>
      <ConvenioForm categorias={categorias} conveniadores={conveniadores} />
    </>
  )
}
