import type { Metadata } from "next"
import Link from "next/link"
import { notFound } from "next/navigation"
import { ArrowLeft, Check, Download, ExternalLink } from "lucide-react"

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
import {
  obterSolicitacaoDetalhe,
  ROTULO_SITUACAO_SOLICITACAO,
} from "@/lib/db/filiacao-publica"
import { formatarData, formatarDataHora } from "@/lib/formato"
import { mascaraCpf } from "@/lib/mascaras"

import { AvaliarFichaForm } from "../solicitacoes-forms"

export const metadata: Metadata = { title: "Avaliar ficha — Confluir" }

export default async function SolicitacaoDetalhePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ avaliado?: string }>
}) {
  await requirePermissao("filiacao_gestao")

  const { id } = await params
  const { avaliado } = await searchParams
  const s = await obterSolicitacaoDetalhe(id)
  if (!s) notFound()

  const avaliavel = ["nao_avaliada", "aprovada", "reprovada"].includes(
    s.situacao
  )
  const endereco =
    [
      [s.endereco_logradouro, s.endereco_numero].filter(Boolean).join(", "),
      s.endereco_complemento,
      s.endereco_bairro,
      [s.endereco_cidade, s.endereco_estado].filter(Boolean).join("/"),
      s.endereco_cep ? `CEP ${s.endereco_cep}` : null,
    ]
      .filter(Boolean)
      .join(" — ") || null

  return (
    <>
      <div>
        <Button variant="ghost" size="sm" asChild className="-ml-2 mb-3">
          <Link href="/painel/filiados/solicitacoes">
            <ArrowLeft />
            Fichas de filiação
          </Link>
        </Button>
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-2xl font-semibold tracking-tight">
            {s.nome ?? "(sem nome)"}
          </h1>
          <Badge variant="secondary">
            {ROTULO_SITUACAO_SOLICITACAO[s.situacao]}
          </Badge>
        </div>
        <p className="text-muted-foreground mt-1 text-xs">
          Protocolo {s.protocolo ?? "—"} · enviada em {formatarData(s.created_at)}
        </p>
      </div>

      {avaliado === "1" && (
        <Alert className="border-success/40 text-success-fg">
          <AlertDescription>Avaliação registrada.</AlertDescription>
        </Alert>
      )}

      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <CardTitle className="text-base">Dados da ficha</CardTitle>
            <Button variant="outline" size="sm" asChild>
              <a href={`/ficha/${s.token}/pdf`} target="_blank" rel="noreferrer">
                <Download />
                Ficha (PDF)
              </a>
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <dl className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {s.nome_social && <Campo rotulo="Nome social" valor={s.nome_social} />}
            <Campo rotulo="CPF" valor={s.cpf ? mascaraCpf(s.cpf) : null} />
            <Campo
              rotulo="Nascimento"
              valor={s.nascimento ? formatarData(s.nascimento) : null}
            />
            <Campo rotulo="Sexo" valor={s.sexo} />
            <Campo rotulo="E-mail" valor={s.email} />
            <Campo
              rotulo="Telefone"
              valor={
                s.telefone_1
                  ? `${s.telefone_1}${s.telefone_1_whatsapp ? " (WhatsApp)" : ""}`
                  : null
              }
            />
            <Campo rotulo="Telefone 2" valor={s.telefone_2} />
            <Campo rotulo="Empregador" valor={s.empregadorNome} />
            <Campo rotulo="Matrícula" valor={s.matricula} />
            <Campo rotulo="Cargo" valor={s.cargo} />
            <Campo rotulo="Lotação" valor={s.lotacao} />
            <div className="sm:col-span-2 lg:col-span-3">
              <Campo rotulo="Endereço" valor={endereco} />
            </div>
          </dl>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Avaliação da filiação</CardTitle>
          <CardDescription>
            Confira os requisitos e decida. Aprovar cria a filiação e o vínculo.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4">
          <ul className="grid gap-1.5 text-sm">
            <Requisito ok={s.emailVerificado} label="E-mail confirmado pelo aspirante" />
            <Requisito
              ok={s.documentoAssinado}
              label="Ficha assinada (gov.br) enviada"
            />
            <Requisito
              ok={Boolean(s.empregadorNome)}
              label={
                s.empregadorNome
                  ? `Empregador: ${s.empregadorNome}`
                  : "Sem empregador informado"
              }
            />
          </ul>

          {s.documentoAssinadoUrl && (
            <div>
              <Button variant="outline" size="sm" asChild>
                <a href={s.documentoAssinadoUrl} target="_blank" rel="noreferrer">
                  <ExternalLink />
                  Abrir ficha assinada
                </a>
              </Button>
            </div>
          )}

          {s.situacao === "aguardando_assinatura" && (
            <Alert variant="warning">
              <AlertDescription>
                Aguardando o aspirante enviar a ficha assinada.
              </AlertDescription>
            </Alert>
          )}

          {(s.situacao === "aprovada" || s.situacao === "reprovada") && (
            <Alert
              className={
                s.situacao === "aprovada"
                  ? "border-success/40 text-success-fg"
                  : undefined
              }
              variant={s.situacao === "reprovada" ? "destructive" : undefined}
            >
              <AlertDescription>
                {s.situacao === "aprovada" ? "Aprovada" : "Reprovada"}
                {s.avaliadorNome && <> por {s.avaliadorNome}</>}
                {s.avaliacao_data && <> em {formatarData(s.avaliacao_data)}</>}.
                {s.reprovacao_motivo && <> Motivo: {s.reprovacao_motivo}</>}
                {s.filiacaoId && (
                  <>
                    {" "}
                    <Link
                      href={`/painel/filiados/${s.filiacaoId}`}
                      className="font-medium underline underline-offset-4"
                    >
                      Ver a filiação criada
                    </Link>
                    .
                  </>
                )}
              </AlertDescription>
            </Alert>
          )}

          {avaliavel && (
            <div className="border-t pt-4">
              <AvaliarFichaForm id={s.id} />
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Trilha de auditoria</CardTitle>
          <CardDescription>Registros do processo de filiação.</CardDescription>
        </CardHeader>
        <CardContent>
          {s.eventos.length === 0 ? (
            <p className="text-muted-foreground text-sm">Sem eventos.</p>
          ) : (
            <ul className="grid gap-2 text-sm">
              {s.eventos.map((ev, i) => (
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
