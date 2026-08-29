import type { Metadata } from "next"
import Link from "next/link"
import { ArrowLeft, CalendarClock, MapPin } from "lucide-react"

import { Alert, AlertDescription } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { requireVisualizacaoPortal } from "@/lib/visualizacao-filiado"
import { ROTULOS_MODALIDADE } from "@/lib/assembleias-constantes"
import { datasDaRodada } from "@/lib/db/votacao-portal"
import { formatarData, formatarDataHora } from "@/lib/formato"

import { PortalShell } from "../../../portal-shell"

export const metadata: Metadata = { title: "Datas da rodada — Confluir" }

export default async function DatasRodadaPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { filiado, preview, gestorNome } = await requireVisualizacaoPortal()
  const { id } = await params
  const dados = filiado.ativo ? await datasDaRodada(filiado.cpf, id) : null

  return (
    <PortalShell
      preview={preview ? { filiadoNome: filiado.nome_completo, gestorNome } : undefined}
    >
      <div>
        <Button variant="ghost" size="sm" asChild className="-ml-2 mb-2">
          <Link href="/portal/votacao">
            <ArrowLeft />
            Votação
          </Link>
        </Button>
        <h1 className="text-2xl font-semibold tracking-tight">
          {dados?.nome ?? dados?.tema ?? "Datas da rodada"}
        </h1>
        <p className="text-muted-foreground mt-1 text-xs">
          {[dados?.empregador, dados?.tema].filter(Boolean).join(" · ") ||
            "Confira as datas das assembleias desta rodada."}
        </p>
      </div>

      {!dados ? (
        <Alert variant="warning">
          <AlertDescription>
            Não encontramos esta rodada entre as suas, ou você não está apto
            nela.
          </AlertDescription>
        </Alert>
      ) : dados.assembleias.length === 0 ? (
        <Alert>
          <AlertDescription>
            Ainda não há assembleias com datas nesta rodada.
          </AlertDescription>
        </Alert>
      ) : (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Assembleias desta rodada</CardTitle>
            <CardDescription>
              As datas e a modalidade de cada encontro.
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-3">
            {dados.assembleias.map((a) => (
              <div key={a.id} className="rounded-lg border p-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-sm font-medium">
                    {a.nome ?? "Assembleia"}
                  </p>
                  <Badge variant="outline">
                    {ROTULOS_MODALIDADE[a.modalidade]}
                  </Badge>
                </div>
                <p className="text-muted-foreground mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
                  <span className="inline-flex items-center gap-1">
                    <CalendarClock className="size-3.5" />
                    {a.dataRealizacao
                      ? formatarDataHora(a.dataRealizacao)
                      : a.dataInicio
                        ? formatarData(a.dataInicio)
                        : "data a definir"}
                    {a.dataTermino && <> até {formatarData(a.dataTermino)}</>}
                  </span>
                </p>
                {a.descricao && (
                  <p className="text-muted-foreground mt-1 flex items-start gap-1 text-xs">
                    <MapPin className="mt-0.5 size-3.5 shrink-0" />
                    {a.descricao}
                  </p>
                )}
              </div>
            ))}
          </CardContent>
        </Card>
      )}
    </PortalShell>
  )
}
