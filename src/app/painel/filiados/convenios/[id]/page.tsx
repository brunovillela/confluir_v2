import type { Metadata } from "next"
import Link from "next/link"
import { notFound } from "next/navigation"
import { ArrowLeft } from "lucide-react"

import { Alert, AlertDescription } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { requirePermissao } from "@/lib/auth"
import {
  listarCategoriasConvenio,
  listarConveniadores,
  obterConvenio,
} from "@/lib/db/filiacao-convenios-edicao"
import { ehDoBubble } from "@/lib/db/filiacao-documentos"

import { ConvenioForm } from "../convenio-form"
import { ArquivoConvenioCampo } from "./arquivos"
import { ExcluirConvenio } from "./excluir-convenio"
import { Unidades } from "./unidades"

export const metadata: Metadata = { title: "Convênio — Confluir" }

export default async function EditarConvenioPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ salvo?: string; erro?: string }>
}) {
  await requirePermissao("filiacao_convenios", ["filiacao_gestao"])
  const { id } = await params
  const { salvo, erro } = await searchParams
  const [convenio, categorias, conveniadores] = await Promise.all([
    obterConvenio(id),
    listarCategoriasConvenio(),
    listarConveniadores(),
  ])
  if (!convenio) notFound()

  const hoje = new Date().toISOString().slice(0, 10)
  const vigente = convenio.ativo && (!convenio.dataTermino || convenio.dataTermino >= hoje)

  return (
    <>
      <div>
        <Button asChild variant="ghost" size="sm" className="-ml-2 mb-3">
          <Link href="/painel/filiados/convenios">
            <ArrowLeft />
            Convênios
          </Link>
        </Button>
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="text-2xl font-semibold tracking-tight">
            {convenio.conveniador ?? "Convênio"}
          </h1>
          {vigente ? (
            <Badge variant="success">vigente</Badge>
          ) : convenio.ativo ? (
            <Badge variant="warning">vencido</Badge>
          ) : (
            <Badge variant="outline">inativo</Badge>
          )}
        </div>
        <p className="text-muted-foreground mt-1 text-sm">
          {vigente
            ? "O filiado vê este convênio no portal."
            : "Este convênio não aparece no portal."}
        </p>
      </div>

      {salvo && (
        <Alert>
          <AlertDescription>Convênio salvo.</AlertDescription>
        </Alert>
      )}
      {erro && (
        <Alert variant="destructive">
          <AlertDescription>{erro}</AlertDescription>
        </Alert>
      )}

      <ConvenioForm categorias={categorias} conveniadores={conveniadores} convenio={convenio} />

      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            Unidades de atendimento
            <span className="text-muted-foreground ml-2 text-sm font-normal">
              {convenio.unidades.length}
            </span>
          </CardTitle>
          <CardDescription>
            Onde o filiado é atendido: endereço, telefones, site e se atende online.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Unidades convenioId={convenio.id} unidades={convenio.unidades} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Arquivos</CardTitle>
          <CardDescription>
            O contrato vira o link “Regras do convênio” no portal; a foto ilustra o cartão.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3 md:grid-cols-2">
          <ArquivoConvenioCampo
            convenioId={convenio.id}
            tipo="contrato"
            url={convenio.arquivoUrl}
            noBubble={ehDoBubble(convenio.arquivoConvenio)}
          />
          <ArquivoConvenioCampo
            convenioId={convenio.id}
            tipo="foto"
            url={convenio.fotoUrl}
            noBubble={ehDoBubble(convenio.fotoPrincipal)}
          />
        </CardContent>
      </Card>

      <ExcluirConvenio
        convenioId={convenio.id}
        conveniador={convenio.conveniador}
        unidades={convenio.unidades.length}
        temArquivos={Boolean(convenio.arquivoConvenio || convenio.fotoPrincipal)}
      />
    </>
  )
}
