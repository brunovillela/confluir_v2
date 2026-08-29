import type { Metadata } from "next"
import Link from "next/link"
import { ArrowLeft } from "lucide-react"

import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { requireVisualizacaoPortal } from "@/lib/visualizacao-filiado"
import {
  elegibilidadeParaVotar,
  perguntasDaAssembleia,
} from "@/lib/db/votacao-portal"

import { PortalShell } from "../../portal-shell"
import { votarNaAssembleia } from "../actions"
import { CedulaForm } from "./cedula-form"

export const metadata: Metadata = { title: "Cédula — Confluir" }

export default async function CedulaPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { filiado, preview, gestorNome } = await requireVisualizacaoPortal()
  const { id } = await params

  const eleg = filiado.ativo ? await elegibilidadeParaVotar(filiado.cpf, id) : null
  const perguntas = eleg?.online ? await perguntasDaAssembleia(id) : []

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
          {eleg?.nome ?? "Cédula de votação"}
        </h1>
        {eleg?.empregador && (
          <p className="text-muted-foreground mt-1 text-xs">{eleg.empregador}</p>
        )}
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Cédula</CardTitle>
          <CardDescription>Escolha uma opção em cada pergunta.</CardDescription>
        </CardHeader>
        <CardContent>
          {preview ? (
            <Alert variant="warning">
              <AlertDescription>
                Visualização da gestão — a votação só pode ser feita pelo próprio
                filiado, na conta dele.
              </AlertDescription>
            </Alert>
          ) : !eleg ? (
            <Alert variant="warning">
              <AlertDescription>
                Você não está apto a votar nesta assembleia, ou a votação não está
                aberta.
              </AlertDescription>
            </Alert>
          ) : !eleg.online ? (
            <Alert variant="warning">
              <AlertDescription>
                Esta assembleia é presencial — não há cédula online. Confira as
                datas na área de votação.
              </AlertDescription>
            </Alert>
          ) : eleg.jaVotou ? (
            <Alert className="border-success/40 text-success-fg">
              <AlertDescription>
                Você já votou nesta assembleia. Obrigado por participar.
              </AlertDescription>
            </Alert>
          ) : perguntas.length === 0 ? (
            <Alert variant="warning">
              <AlertDescription>
                A cédula desta assembleia ainda não tem perguntas.
              </AlertDescription>
            </Alert>
          ) : (
            <CedulaForm
              assembleiaId={id}
              perguntas={perguntas}
              acao={votarNaAssembleia}
            />
          )}
        </CardContent>
      </Card>
    </PortalShell>
  )
}
