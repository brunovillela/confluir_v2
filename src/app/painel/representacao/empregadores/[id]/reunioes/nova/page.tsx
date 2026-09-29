import type { Metadata } from "next"
import Link from "next/link"
import { notFound } from "next/navigation"
import { ArrowLeft } from "lucide-react"

import { RotuloTrilha } from "@/components/layout/trilha-rotulos"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { requirePermissao } from "@/lib/auth"
import { buscarFontePagadora } from "@/lib/db/fontes"
import { listarUsuariosAtivos } from "@/lib/db/veiculos"
import { INFO_TIPO_REUNIAO, tipoReuniaoRep } from "@/lib/representacao-reunioes-constantes"

import { ReuniaoForm } from "../reuniao-form"

export const metadata: Metadata = { title: "Nova reunião — Confluir" }
// A leitura da ata pela IA roda na server action desta página.
export const maxDuration = 120

export default async function NovaReuniaoPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ tipo?: string }>
}) {
  await requirePermissao("empregadores")
  const { id } = await params
  const tipo = tipoReuniaoRep((await searchParams).tipo)
  const [fonte, usuarios] = await Promise.all([buscarFontePagadora(id), listarUsuariosAtivos()])
  if (!fonte) notFound()
  const nome = fonte.nome_fantasia ?? fonte.nome_razao ?? "(sem nome)"
  const info = INFO_TIPO_REUNIAO[tipo]
  const voltar = `/painel/representacao/empregadores/${id}?aba=${tipo === "setorial" ? "setoriais" : "reunioes"}`

  return (
    <>
      <RotuloTrilha valores={{ [id]: nome, reunioes: info.plural, nova: tipo === "setorial" ? "Nova setorial" : "Nova reunião" }} />
      <div>
        <Button variant="ghost" size="sm" asChild className="-ml-2 mb-3">
          <Link href={voltar}>
            <ArrowLeft />
            {nome}
          </Link>
        </Button>
        <h1 className="text-2xl font-semibold tracking-tight">{tipo === "setorial" ? "Nova setorial" : "Nova reunião com o empregador"}</h1>
      </div>
      <Card>
        <CardHeader>
          <CardTitle className="text-base">{info.rotulo}</CardTitle>
          <CardDescription>{info.explicacao}</CardDescription>
        </CardHeader>
        <CardContent>
          <ReuniaoForm empresaId={id} tipo={tipo} usuarios={usuarios} aoCancelarHref={voltar} />
        </CardContent>
      </Card>
    </>
  )
}
