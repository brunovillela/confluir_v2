import type { Metadata } from "next"
import Link from "next/link"
import { notFound } from "next/navigation"
import { ArrowLeft, Smartphone } from "lucide-react"

import { RotuloTrilha } from "@/components/layout/trilha-rotulos"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { requirePermissao } from "@/lib/auth"
import {
  listarLinhasInstitucionais,
  opcoesResponsaveisLinha,
} from "@/lib/db/linhas-institucionais"
import { formatarTelefone } from "@/lib/formato"

import { AbrirFormulario } from "../../organizacao/abrir-formulario"
import { BotaoExcluirLinha, EditarLinha } from "../linhas-forms"

export const metadata: Metadata = { title: "Linha institucional — Confluir" }

function Dado({ rotulo, valor, mono }: { rotulo: string; valor: string | null; mono?: boolean }) {
  return (
    <div className="min-w-0">
      <dt className="text-muted-foreground text-xs">{rotulo}</dt>
      <dd className={mono ? "truncate font-mono text-sm" : "truncate"}>{valor || "—"}</dd>
    </div>
  )
}

/** Uma linha institucional: os dados, com Editar linha e a exclusão. */
export default async function LinhaInstitucionalPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  await requirePermissao("ferramentas_linhas_telefone", ["configuracoes"])
  const { id } = await params
  const todas = await listarLinhasInstitucionais()
  const linha = todas.find((l) => l.id === id)
  if (!linha) notFound()
  const responsaveis = await opcoesResponsaveisLinha(todas)
  const numero = formatarTelefone(linha.numero)

  return (
    <>
      <RotuloTrilha valores={{ [id]: numero }} />
      <div>
        <Button variant="ghost" size="sm" asChild className="-ml-2 mb-3">
          <Link href="/painel/institucional/linhas">
            <ArrowLeft />
            Linhas institucionais
          </Link>
        </Button>
        <div className="flex flex-wrap items-center gap-2">
          <Smartphone className="text-muted-foreground size-5" />
          <h1 className="text-2xl font-semibold tracking-tight">{numero}</h1>
          {linha.usuarioId ? (
            <Badge variant="outline">Em uso</Badge>
          ) : (
            <Badge variant="outline" className="border-success/40 text-success-fg">
              Disponível
            </Badge>
          )}
        </div>
        <p className="text-muted-foreground mt-1 text-xs">
          {linha.usuarioId
            ? `Com ${linha.responsavelNome ?? "(sem nome)"}`
            : "Sem responsável — a linha está com a entidade"}
        </p>
      </div>

      <Card>
        <CardContent>
          <AbrirFormulario
            rotulo="Editar linha"
            resumo={
              <dl className="grid gap-x-6 gap-y-3 text-sm sm:grid-cols-2 lg:grid-cols-3">
                <Dado rotulo="Número" valor={numero} />
                <Dado rotulo="Operadora" valor={linha.operadora} />
                <Dado rotulo="Chip (ICCID)" valor={linha.chip} mono />
                <Dado rotulo="Com quem está" valor={linha.responsavelNome ?? (linha.usuarioId ? "(sem nome)" : "Na entidade")} />
                <Dado rotulo="Observação" valor={linha.observacao} />
              </dl>
            }
          >
            <EditarLinha linha={linha} responsaveis={responsaveis} />
          </AbrirFormulario>
        </CardContent>
      </Card>

      <div className="flex flex-wrap items-center gap-2">
        <BotaoExcluirLinha id={linha.id} numero={linha.numero} comRotulo />
        <span className="text-muted-foreground text-xs">
          Para uma linha cancelada ou devolvida à operadora.
        </span>
      </div>
    </>
  )
}
