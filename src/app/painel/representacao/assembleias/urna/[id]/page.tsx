import type { Metadata } from "next"
import Link from "next/link"
import { notFound } from "next/navigation"
import { ArrowLeft, CheckCircle2, Search, Vote } from "lucide-react"

import { CedulaForm } from "@/app/portal/votacao/[id]/cedula-form"
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
import { Input } from "@/components/ui/input"
import { requirePermissao } from "@/lib/auth"
import { aptoUrna, dadosUrna } from "@/lib/db/votacao-portal"
import { formatarCpf } from "@/lib/cpf"

import { votarNaUrnaAction } from "./actions"

export const metadata: Metadata = { title: "Urna — Confluir" }

export default async function UrnaPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ busca?: string; apto?: string; votou?: string }>
}) {
  await requirePermissao("assembleias")
  const { id } = await params
  const { busca, apto, votou } = await searchParams
  const dados = await dadosUrna(id, busca ?? "")
  if (!dados) notFound()

  const voltar = (
    <Button variant="ghost" size="sm" asChild className="-ml-2 mb-2">
      <Link href="/painel/representacao/assembleias">
        <ArrowLeft />
        Assembleias
      </Link>
    </Button>
  )

  // ── Modo cédula: registrar o voto de um apto ──
  if (apto) {
    const info = await aptoUrna(id, apto)
    return (
      <>
        <div>
          <Button variant="ghost" size="sm" asChild className="-ml-2 mb-2">
            <Link href={`/painel/representacao/assembleias/urna/${id}`}>
              <ArrowLeft />
              Voltar à urna
            </Link>
          </Button>
          <h1 className="text-2xl font-semibold tracking-tight">
            {info?.nome ?? "Eleitor"}
          </h1>
          <p className="text-muted-foreground mt-1 text-xs">
            {dados.nome ?? "Urna"} · registre o voto do eleitor
          </p>
        </div>
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Cédula</CardTitle>
            <CardDescription>
              O voto é secreto — deixe o eleitor escolher e confirme.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {!info ? (
              <Alert variant="warning">
                <AlertDescription>Eleitor não encontrado.</AlertDescription>
              </Alert>
            ) : info.jaVotou ? (
              <Alert className="border-success/40 text-success-fg">
                <AlertDescription>Este eleitor já votou.</AlertDescription>
              </Alert>
            ) : !dados.aberta ? (
              <Alert variant="warning">
                <AlertDescription>A urna está fechada.</AlertDescription>
              </Alert>
            ) : dados.perguntas.length === 0 ? (
              <Alert variant="warning">
                <AlertDescription>
                  A cédula ainda não tem perguntas.
                </AlertDescription>
              </Alert>
            ) : (
              <CedulaForm
                assembleiaId={id}
                perguntas={dados.perguntas}
                acao={votarNaUrnaAction}
                camposOcultos={{ apto_id: apto }}
              />
            )}
          </CardContent>
        </Card>
      </>
    )
  }

  // ── Modo lista: buscar e escolher o eleitor ──
  return (
    <>
      <div>
        {voltar}
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-2xl font-semibold tracking-tight">
            Urna — {dados.nome ?? "assembleia"}
          </h1>
          {dados.aberta ? (
            <Badge variant="outline" className="border-success/40 text-success-fg">
              Aberta
            </Badge>
          ) : (
            <Badge variant="outline" className="text-muted-foreground">
              Fechada
            </Badge>
          )}
        </div>
        <p className="text-muted-foreground mt-1 text-xs">
          {dados.empregador && <>{dados.empregador} · </>}
          {dados.votaram.toLocaleString("pt-BR")} de{" "}
          {dados.totalAptos.toLocaleString("pt-BR")} aptos já votaram
        </p>
      </div>

      {votou === "1" && (
        <Alert className="border-success/40 text-success-fg">
          <CheckCircle2 className="size-4" />
          <AlertDescription>Voto registrado. Próximo eleitor.</AlertDescription>
        </Alert>
      )}
      {!dados.aberta && (
        <Alert variant="warning">
          <AlertDescription>
            Esta urna está fechada (não é urna, apuração encerrada ou período
            terminado).
          </AlertDescription>
        </Alert>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Eleitores aptos</CardTitle>
          <CardDescription>
            Busque pelo nome, CPF ou matrícula e registre o voto.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3">
          <form className="flex gap-2" action="">
            <div className="relative flex-1 sm:max-w-sm">
              <Search className="text-muted-foreground pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2" />
              <Input
                name="busca"
                defaultValue={busca ?? ""}
                placeholder="Nome, CPF ou matrícula"
                className="pl-8"
              />
            </div>
            <Button type="submit" variant="secondary">
              Buscar
            </Button>
          </form>

          {dados.aptos.length === 0 ? (
            <p className="text-muted-foreground py-4 text-center text-sm">
              Nenhum eleitor encontrado.
            </p>
          ) : (
            <div className="grid gap-2">
              {dados.aptos.map((a) => (
                <div
                  key={a.id}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-lg border p-2.5 text-sm"
                >
                  <div className="min-w-0">
                    <p className="font-medium">{a.nome ?? "(sem nome)"}</p>
                    <p className="text-muted-foreground font-mono text-xs">
                      {a.cpf ? formatarCpf(a.cpf) : a.matricula ? `mat. ${a.matricula}` : "—"}
                    </p>
                  </div>
                  {a.jaVotou ? (
                    <Badge variant="outline" className="border-success/40 text-success-fg">
                      Votou
                    </Badge>
                  ) : dados.aberta ? (
                    <Button size="sm" variant="outline" asChild>
                      <Link href={`/painel/representacao/assembleias/urna/${id}?apto=${a.id}`}>
                        <Vote />
                        Registrar voto
                      </Link>
                    </Button>
                  ) : null}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </>
  )
}
