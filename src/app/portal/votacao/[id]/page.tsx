import type { Metadata } from "next"
import Link from "next/link"
import { ArrowLeft, CalendarClock, Info } from "lucide-react"

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { requireVisualizacaoPortal } from "@/lib/visualizacao-filiado"
import { estadoVotacao } from "@/lib/assembleias-constantes"
import {
  elegibilidadeParaVotar,
  perguntasDaAssembleia,
} from "@/lib/db/votacao-portal"
import { formatarDataHora } from "@/lib/formato"

import { votarNaAssembleia } from "../actions"
import { CedulaForm } from "./cedula-form"

export const metadata: Metadata = { title: "Cédula — Confluir" }

export default async function CedulaPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { filiado, preview } = await requireVisualizacaoPortal()
  const { id } = await params

  const eleg = filiado.ativo ? await elegibilidadeParaVotar(filiado.cpf, id) : null
  // Mesma regra da lista e do banner do Início: a cédula só aparece quando dá
  // para votar AGORA. Antes ela abria antes da abertura e na carência, e o
  // bloqueio só chegava depois de a pessoa responder tudo (achado A89). As
  // travas do servidor (registrarVotoFiliado) continuam valendo.
  const estado = eleg ? estadoVotacao(eleg) : null
  const perguntas =
    estado?.chave === "votar" ? await perguntasDaAssembleia(id) : []

  return (
    <>
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
          {/* A instrução só vale quando as perguntas estão na tela. */}
          {estado?.chave === "votar" && perguntas.length > 0 && (
            <CardDescription>Escolha uma opção em cada pergunta.</CardDescription>
          )}
        </CardHeader>
        <CardContent className="grid gap-4">
          {preview && (
            <Alert variant="warning">
              <AlertDescription>
                Visualização da gestão — a cédula está aqui para você acompanhar
                o filiado, mas o voto só pode ser dado por ele, na conta dele.
              </AlertDescription>
            </Alert>
          )}
          {!eleg || !estado ? (
            <Alert variant="warning">
              <AlertDescription>
                Você não está apto a votar nesta assembleia, ou a votação não está
                aberta.
              </AlertDescription>
            </Alert>
          ) : estado.chave === "ja_votou" ? (
            <Alert variant="success">
              <AlertDescription>
                Você já votou nesta assembleia. Obrigado por participar.
              </AlertDescription>
            </Alert>
          ) : estado.chave === "presencial" ? (
            <>
              <Alert variant="warning">
                <AlertDescription>
                  Esta assembleia é só presencial — não há cédula online. Confira
                  as datas de cada encontro.
                </AlertDescription>
              </Alert>
              {eleg.rodadaId && (
                <Button variant="outline" size="sm" asChild className="w-fit">
                  <Link href={`/portal/votacao/rodada/${eleg.rodadaId}`}>
                    <CalendarClock />
                    Ver datas
                  </Link>
                </Button>
              )}
            </>
          ) : estado.chave === "nao_abriu" ? (
            // Sem contagem regressiva: o componente fala em "encerra em" e
            // "encerrada", o contrário do que se quer antes da abertura.
            <Alert variant="info">
              <AlertDescription>
                A votação ainda não começou. Ela abre em{" "}
                <strong>{formatarDataHora(eleg.abreEm)}</strong>. Volte a partir
                desse horário para votar.
              </AlertDescription>
            </Alert>
          ) : estado.chave === "carencia" ? (
            // Mesmo texto da lista (motivo + data de liberação).
            <Alert variant="warning">
              <AlertTitle>{estado.rotulo}</AlertTitle>
              <AlertDescription>{estado.detalhe}</AlertDescription>
            </Alert>
          ) : perguntas.length === 0 ? (
            <Alert variant="warning">
              <AlertDescription>
                A cédula desta assembleia ainda não tem perguntas.
              </AlertDescription>
            </Alert>
          ) : (
            <>
              {estado.detalhe && (
                <p className="text-muted-foreground flex items-start gap-1.5 text-xs">
                  <Info className="mt-0.5 size-3.5 shrink-0" />
                  {estado.detalhe}
                </p>
              )}
              <CedulaForm
                assembleiaId={id}
                perguntas={perguntas}
                acao={votarNaAssembleia}
                preview={preview}
              />
            </>
          )}
        </CardContent>
      </Card>
    </>
  )
}
