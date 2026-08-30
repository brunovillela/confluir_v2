import type { Metadata } from "next"
import Link from "next/link"
import { notFound } from "next/navigation"
import { ArrowLeft, Users, Vote } from "lucide-react"

import { ModalidadeBadge } from "@/components/assembleias"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { requirePermissao } from "@/lib/auth"
import { dadosApuracao } from "@/lib/db/assembleias"
import { acompanhamentoAssembleia } from "@/lib/db/votacao-mesarios"
import { formatarData } from "@/lib/formato"

import { ApuracaoForm } from "./apuracao-form"
import { EmSeparadoValidacao } from "./emseparado-validacao"

export const metadata: Metadata = { title: "Apuração — Confluir" }

export default async function ApuracaoPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  await requirePermissao("assembleias")
  const { id } = await params
  const dados = await dadosApuracao(id)
  if (!dados) notFound()
  const acomp = await acompanhamentoAssembleia(id)
  const emSeparado = acomp?.emSeparado ?? []

  const participacao =
    dados.aptos > 0 ? Math.round((dados.votantes / dados.aptos) * 100) : null

  return (
    <>
      <div>
        <Button variant="ghost" size="sm" asChild className="-ml-2 mb-2">
          <Link href="/painel/representacao/assembleias">
            <ArrowLeft />
            Assembleias
          </Link>
        </Button>
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-2xl font-semibold tracking-tight">
            Apuração — {dados.nome ?? "assembleia"}
          </h1>
          <ModalidadeBadge modalidade={dados.modalidade} />
        </div>
        <p className="text-muted-foreground mt-1 flex flex-wrap gap-x-4 text-xs">
          <span className="inline-flex items-center gap-1">
            <Users className="size-3.5" />
            {dados.aptos.toLocaleString("pt-BR")} aptos
          </span>
          <span className="inline-flex items-center gap-1">
            <Vote className="size-3.5" />
            {dados.votantes.toLocaleString("pt-BR")} votaram
            {participacao !== null && <> · {participacao}% de participação</>}
          </span>
        </p>
      </div>

      {!dados.online && (
        <Alert variant="warning">
          <AlertDescription>
            Assembleia presencial — não há cédula digital. Informe os números
            apurados na urna/reunião abaixo.
          </AlertDescription>
        </Alert>
      )}

      {dados.online && !dados.apuracaoDisponivel && (
        <Alert variant="warning">
          <AlertDescription>
            A apuração dos votos só fica disponível após o término da rodada
            {dados.rodadaTermino ? (
              <> (em {formatarData(dados.rodadaTermino)})</>
            ) : null}
            . Até lá, para preservar o sigilo, a contagem não é exibida — só o
            comparecimento acima.
          </AlertDescription>
        </Alert>
      )}

      {/* Contagem por pergunta (voto online) */}
      {dados.online && dados.apuracaoDisponivel && dados.perguntas.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Contagem por pergunta</CardTitle>
            <CardDescription>
              Apuração dos votos online registrados nesta assembleia.
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-5">
            {dados.perguntas.map((p, i) => (
              <div key={p.id} className="grid gap-2">
                <p className="text-sm font-medium">
                  {i + 1}. {p.pergunta ?? "Pergunta"}
                  <span className="text-muted-foreground ml-2 text-xs font-normal">
                    {p.totalVotos.toLocaleString("pt-BR")} voto
                    {p.totalVotos === 1 ? "" : "s"}
                  </span>
                </p>
                <div className="grid gap-1.5">
                  {p.opcoes.map((o) => {
                    const pct =
                      p.totalVotos > 0
                        ? Math.round((o.votos / p.totalVotos) * 100)
                        : 0
                    return (
                      <div
                        key={o.id}
                        className="grid grid-cols-[1fr_auto] items-center gap-2 text-sm"
                      >
                        <div className="min-w-0">
                          <div className="flex justify-between gap-2">
                            <span className="truncate">
                              {o.texto ?? "(opção)"}
                            </span>
                            <span className="text-muted-foreground tabular-nums">
                              {o.votos.toLocaleString("pt-BR")} · {pct}%
                            </span>
                          </div>
                          <div className="bg-muted mt-1 h-2 overflow-hidden rounded-full">
                            <div
                              className="bg-primary h-full rounded-full"
                              style={{ width: `${pct}%` }}
                            />
                          </div>
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {/* Votos em separado — deferir/indeferir */}
      {emSeparado.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">
              Votos em separado ({emSeparado.length})
            </CardTitle>
            <CardDescription>
              Defira os que têm direito (o voto entra na contagem) ou indefira
              (o voto é descartado). Nas urnas físicas, use como controle dos
              envelopes; nas digitais, a contagem acima já respeita a decisão.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <EmSeparadoValidacao assembleiaId={dados.id} registros={emSeparado} />
          </CardContent>
        </Card>
      )}

      {/* Resultado agregado + encerrar/reabrir */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Resultado e fechamento</CardTitle>
          <CardDescription>
            O resultado final só aparece ao filiado depois de encerrada a
            apuração.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ApuracaoForm
            assembleiaId={dados.id}
            resultado={dados.resultado}
            encerrada={dados.apuracaoEncerrada}
            disponivel={dados.apuracaoDisponivel}
          />
        </CardContent>
      </Card>
    </>
  )
}
