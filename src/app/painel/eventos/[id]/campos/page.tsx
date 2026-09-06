import type { Metadata } from "next"
import Link from "next/link"
import { notFound } from "next/navigation"
import { ArrowLeft } from "lucide-react"

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
import { GrupoColapsavel } from "@/components/grupo-colapsavel"
import { requirePermissao } from "@/lib/auth"
import { obterEvento } from "@/lib/db/eventos"
import { listarCampos, TIPOS_CAMPO } from "@/lib/db/eventos-config"

import { AcoesCampo, CampoForm, NovoCampo } from "./formularios"

export const metadata: Metadata = { title: "Campos da inscrição — Confluir" }

const ROTULO_TIPO = new Map(TIPOS_CAMPO.map((t) => [t.valor, t.rotulo]))

export default async function CamposPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  await requirePermissao("eventos_gestao")
  const { id } = await params

  const evento = await obterEvento(id)
  if (!evento) notFound()
  const campos = await listarCampos(id)

  const ativos = campos.filter((c) => c.ativo)
  const inativos = campos.filter((c) => !c.ativo)

  return (
    <>
      <div>
        <Button asChild variant="ghost" size="sm" className="-ml-2 mb-3">
          <Link href={`/painel/eventos/${id}`}>
            <ArrowLeft />
            {evento.titulo ?? "Evento"}
          </Link>
        </Button>
        <h1 className="text-2xl font-semibold tracking-tight">
          Campos da inscrição
        </h1>
        <p className="text-muted-foreground mt-1 text-sm">
          Perguntas que este evento faz além de nome, CPF, e-mail e telefone.
        </p>
      </div>

      {evento.situacao === "publicado" && ativos.length > 0 && (
        <Alert variant="info">
          <AlertDescription>
            O evento já está publicado. Mudar as perguntas agora vale para quem
            se inscrever daqui em diante — quem já se inscreveu não volta para
            responder.
          </AlertDescription>
        </Alert>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Perguntas ativas</CardTitle>
          <CardDescription>
            {ativos.length === 0
              ? "Nenhuma pergunta extra — o formulário pede só o essencial."
              : `${ativos.length} pergunta(s) no formulário público.`}
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4">
          {ativos.map((c) => (
            <GrupoColapsavel
              key={c.id}
              titulo={c.rotulo}
              descricao={`${ROTULO_TIPO.get(c.tipo) ?? c.tipo}${c.obrigatorio ? " · obrigatória" : ""}`}
              resumo={
                c.respostas > 0 ? (
                  <Badge variant="secondary">{c.respostas} resposta(s)</Badge>
                ) : undefined
              }
            >
              <div className="grid gap-4 pt-2">
                <CampoForm eventoId={id} campo={c} />
                <div className="border-t pt-3">
                  <AcoesCampo eventoId={id} campo={c} />
                </div>
              </div>
            </GrupoColapsavel>
          ))}
          <NovoCampo eventoId={id} />
        </CardContent>
      </Card>

      {inativos.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Perguntas desativadas</CardTitle>
            <CardDescription>
              Saíram do formulário, mas as respostas já dadas continuam na ficha
              de quem se inscreveu.
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-3">
            {inativos.map((c) => (
              <div
                key={c.id}
                className="flex flex-wrap items-center justify-between gap-3 rounded-md border p-3"
              >
                <div>
                  <p className="text-sm font-medium">{c.rotulo}</p>
                  <p className="text-muted-foreground text-xs">
                    {ROTULO_TIPO.get(c.tipo) ?? c.tipo} · {c.respostas}{" "}
                    resposta(s)
                  </p>
                </div>
                <AcoesCampo eventoId={id} campo={c} />
              </div>
            ))}
          </CardContent>
        </Card>
      )}
    </>
  )
}
