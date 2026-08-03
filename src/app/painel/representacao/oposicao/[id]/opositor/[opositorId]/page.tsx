import type { Metadata } from "next"
import Link from "next/link"
import { notFound } from "next/navigation"
import { ArrowLeft, Check } from "lucide-react"

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
import { requirePermissao } from "@/lib/auth"
import { obterOpositorDetalhe } from "@/lib/db/oposicao"
import { formatarDataHora } from "@/lib/formato"
import { mascaraCpf } from "@/lib/mascaras"
import { ROTULO_SITUACAO_OPOSITOR } from "@/lib/oposicao-constantes"

import { AvaliarForm } from "../../../oposicao-forms"

export const metadata: Metadata = { title: "Avaliar oposição — Confluir" }

export default async function OpositorPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string; opositorId: string }>
  searchParams: Promise<{ avaliado?: string }>
}) {
  await requirePermissao("oposicao")

  const { id, opositorId } = await params
  const { avaliado } = await searchParams
  const o = await obterOpositorDetalhe(opositorId)
  if (!o || o.campanhaId !== id) notFound()

  const avaliavel = ["nao_avaliada", "aprovada", "reprovada"].includes(
    o.situacao
  )

  return (
    <>
      <div>
        <Button variant="ghost" size="sm" asChild className="-ml-2 mb-3">
          <Link href={`/painel/representacao/oposicao/${id}`}>
            <ArrowLeft />
            Opositores
          </Link>
        </Button>
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-2xl font-semibold tracking-tight">
            {o.nome ?? "(sem nome)"}
          </h1>
          <Badge variant="secondary">
            {ROTULO_SITUACAO_OPOSITOR[o.situacao]}
          </Badge>
          <Badge variant="outline">
            {o.ehFiliado ? "Filiado" : "Não filiado"}
          </Badge>
        </div>
        <p className="text-muted-foreground mt-1 text-xs">
          Protocolo {o.protocolo ?? "—"} · registrada em{" "}
          {formatarDataHora(o.confirmado_em)}
        </p>
      </div>

      {avaliado === "1" && (
        <Alert className="border-success/40 text-success-fg">
          <AlertDescription>Avaliação registrada.</AlertDescription>
        </Alert>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Dados do opositor</CardTitle>
        </CardHeader>
        <CardContent>
          <dl className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <Campo rotulo="CPF" valor={o.cpf ? mascaraCpf(o.cpf) : null} />
            <Campo rotulo="Matrícula" valor={o.matricula} />
            <Campo rotulo="Fonte pagadora" valor={o.empregadorNome} />
            <Campo rotulo="E-mail" valor={o.email} />
            <Campo rotulo="Telefone" valor={o.telefone} />
            <Campo rotulo="Lotação" valor={o.lotacao} />
          </dl>
        </CardContent>
      </Card>

      {o.respostas.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Questionário</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-3">
            {o.respostas.map((r, i) => (
              <div key={i}>
                <dt className="text-muted-foreground text-xs">
                  {r.pergunta ?? "Pergunta"}
                </dt>
                <dd className="mt-0.5 text-sm whitespace-pre-wrap">
                  {r.resposta ?? "—"}
                </dd>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Avaliação da Filiação</CardTitle>
          <CardDescription>
            Confira os requisitos e decida sobre a oposição.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4">
          <ul className="grid gap-1.5 text-sm">
            <Requisito ok label="Registrada dentro do prazo da campanha" />
            <Requisito
              ok={Boolean(o.empregadorNome)}
              label={
                o.empregadorNome
                  ? `Vinculada à fonte ${o.empregadorNome}`
                  : "Sem fonte pagadora informada"
              }
            />
            <Requisito ok label="CPF único nesta campanha (sem duplicidade)" />
            <Requisito
              ok
              label={`Identificação: ${o.ehFiliado ? "filiado" : "não filiado"}`}
            />
          </ul>

          {o.situacao === "aprovada" || o.situacao === "reprovada" ? (
            <Alert
              className={
                o.situacao === "aprovada"
                  ? "border-success/40 text-success-fg"
                  : undefined
              }
              variant={o.situacao === "reprovada" ? "destructive" : undefined}
            >
              <AlertDescription>
                {o.situacao === "aprovada" ? "Aprovada" : "Reprovada"}
                {o.avaliadorNome && <> por {o.avaliadorNome}</>}
                {o.avaliacao_data && <> em {o.avaliacao_data}</>}.
                {o.reprovacao_motivo && <> Motivo: {o.reprovacao_motivo}</>}
              </AlertDescription>
            </Alert>
          ) : o.situacao === "desistente" ? (
            <p className="text-muted-foreground text-sm">
              O trabalhador desistiu — não há o que avaliar.
            </p>
          ) : o.situacao === "aguardando_documento" ? (
            <Alert variant="warning">
              <AlertDescription>
                Aguardando o envio do documento assinado pelo trabalhador.
              </AlertDescription>
            </Alert>
          ) : null}

          {avaliavel && (
            <div className="border-t pt-4">
              <AvaliarForm opositorId={o.id} campanhaId={id} />
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Trilha de auditoria</CardTitle>
          <CardDescription>Registros para eventual auditoria judicial.</CardDescription>
        </CardHeader>
        <CardContent>
          {o.eventos.length === 0 ? (
            <p className="text-muted-foreground text-sm">Sem eventos.</p>
          ) : (
            <ul className="grid gap-2 text-sm">
              {o.eventos.map((ev, i) => (
                <li key={i} className="flex flex-wrap gap-x-3 gap-y-0.5">
                  <span className="text-muted-foreground tabular-nums">
                    {formatarDataHora(ev.created_at)}
                  </span>
                  <span className="font-medium">{ev.evento}</span>
                  {ev.detalhe && (
                    <span className="text-muted-foreground">{ev.detalhe}</span>
                  )}
                  {ev.ip && (
                    <span className="text-muted-foreground">IP {ev.ip}</span>
                  )}
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </>
  )
}

function Campo({ rotulo, valor }: { rotulo: string; valor: string | null }) {
  return (
    <div>
      <dt className="text-muted-foreground text-xs">{rotulo}</dt>
      <dd className="mt-0.5 text-sm">{valor ?? "—"}</dd>
    </div>
  )
}

function Requisito({ ok, label }: { ok: boolean; label: string }) {
  return (
    <li className="flex items-center gap-2">
      <Check
        className={ok ? "text-success-fg size-4" : "text-muted-foreground size-4"}
      />
      <span className={ok ? "" : "text-muted-foreground"}>{label}</span>
    </li>
  )
}
