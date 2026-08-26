import type { Metadata } from "next"
import Link from "next/link"
import { ArrowLeft } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { requirePermissao } from "@/lib/auth"
import {
  listarConvidados,
  listarDiretoresParaCusteio,
  listarFinalidades,
} from "@/lib/db/custeio"
import { listarCentrosCusto } from "@/lib/db/financeiro"

import { CusteioForm } from "../custeio-form"

export const metadata: Metadata = { title: "Novo custeio — Confluir" }

export default async function NovoCusteioPage() {
  await requirePermissao("custeio_institucional_edicao")

  const [finalidades, centros, diretores, convidados] = await Promise.all([
    listarFinalidades(),
    listarCentrosCusto(),
    listarDiretoresParaCusteio(),
    listarConvidados(),
  ])

  return (
    <>
      <div>
        <Button variant="ghost" size="sm" asChild className="-ml-2 mb-3">
          <Link href="/painel/institucional/custeios">
            <ArrowLeft />
            Custeio institucional
          </Link>
        </Button>
        <h1 className="text-2xl font-semibold tracking-tight">Novo custeio</h1>
        <p className="text-muted-foreground mt-1 text-xs">
          Cadastra em rascunho. Depois de submeter, um autorizador libera e as
          ordens seguem para o Financeiro.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Dados do custeio</CardTitle>
        </CardHeader>
        <CardContent>
          <CusteioForm
            finalidades={finalidades.map((f) => ({
              id: f.id,
              nome: f.nome,
              tipo_beneficiario_sugerido: f.tipo_beneficiario_sugerido,
            }))}
            centrosCusto={centros.map((c) => ({
              id: c.id,
              nome: [c.acesso, c.nome_da_conta].filter(Boolean).join(" — "),
            }))}
            diretores={diretores.map((d) => ({
              id: d.id,
              nome: d.nome,
              detalhe: d.detalhe,
            }))}
            convidados={convidados.map((c) => ({ id: c.id, nome: c.nome }))}
            aoCancelarHref="/painel/institucional/custeios"
          />
        </CardContent>
      </Card>
    </>
  )
}
