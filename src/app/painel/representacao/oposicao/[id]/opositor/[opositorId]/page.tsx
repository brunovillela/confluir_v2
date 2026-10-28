import type { Metadata } from "next"
import Link from "next/link"
import { notFound } from "next/navigation"
import { ArrowLeft, Check, CircleHelp, ExternalLink, FileText, X } from "lucide-react"

import { SeloAssinatura } from "@/components/selo-assinatura"
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
import { formatarData, formatarDataHora } from "@/lib/formato"
import { mascaraCpf } from "@/lib/mascaras"
import { ROTULO_SITUACAO_OPOSITOR } from "@/lib/oposicao-constantes"

import { ReverificarAssinatura } from "../../../gestao-forms"
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
  const q = o.requisitos
  // A coluna guarda só o dia; a hora da decisão vem da trilha (M13).
  const decisaoEm =
    [...o.eventos].reverse().find((e) => e.evento === "aprovada" || e.evento === "reprovada")?.created_at ?? null
  const algumProblema =
    q.noPrazo === false ||
    q.cartaNoPrazo === false ||
    q.outrasDoCpf > 0 ||
    q.fonteNaCampanha === false ||
    !q.identificacao ||
    Boolean(o.problemaAssinatura)

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
        <div className="mt-3">
          <Button variant="outline" size="sm" asChild>
            <a href={`/painel/representacao/oposicao/${id}/opositor/${o.id}/dossie`} target="_blank" rel="noreferrer">
              <FileText />
              Dossiê em PDF
            </a>
          </Button>
        </div>
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

      {o.documentoAssinadoUrl && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Carta assinada</CardTitle>
            <CardDescription>
              {o.documentoEnviadoEm
                ? <>Recebida em {formatarDataHora(o.documentoEnviadoEm)}.</>
                : "Recebida (sem a data do envio — legado)."}{" "}
              Abra o PDF e confira antes de decidir.
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-3">
            {o.documentoLink ? (
              <div>
                <Button variant="outline" size="sm" asChild>
                  <a href={o.documentoLink} target="_blank" rel="noreferrer">
                    <ExternalLink />
                    Abrir o PDF assinado
                  </a>
                </Button>
              </div>
            ) : (
              <p className="text-muted-foreground text-sm">Não foi possível gerar o link do arquivo.</p>
            )}
            <SeloAssinatura validacao={o.validacao} />
            <ReverificarAssinatura opositorId={o.id} campanhaId={id} />
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
          {/* Requisitos conferidos de verdade (onda 0, 27/10/2026): antes os
              itens de prazo e de CPF único apareciam sempre como cumpridos. */}
          <ul className="grid gap-1.5 text-sm">
            <Requisito
              ok={q.noPrazo}
              label={
                q.noPrazo === null
                  ? "Prazo: sem registro da hora da oposição (legado)"
                  : q.noPrazo
                    ? `Registrada no prazo (em ${formatarData(q.diaConfirmacao)}, prazo até ${formatarData(q.prazoFim)})`
                    : `Registrada FORA do prazo (em ${formatarData(q.diaConfirmacao)}; o prazo terminou em ${formatarData(q.prazoFim)})`
              }
            />
            {q.cartaNoPrazo !== null && (
              <Requisito
                ok={q.cartaNoPrazo}
                label={
                  q.cartaNoPrazo
                    ? `Carta assinada recebida no prazo (em ${formatarData(q.diaCarta)})`
                    : `Carta assinada recebida DEPOIS do prazo (em ${formatarData(q.diaCarta)}; prazo até ${formatarData(q.prazoFim)})`
                }
              />
            )}
            <Requisito
              ok={q.fonteNaCampanha === null ? Boolean(o.empregadorNome) : q.fonteNaCampanha}
              label={
                !o.empregadorNome
                  ? "Sem fonte pagadora informada"
                  : q.fonteNaCampanha === false
                    ? `Fonte ${o.empregadorNome} NÃO está entre as fontes da campanha`
                    : `Vinculada à fonte ${o.empregadorNome}`
              }
            />
            <Requisito
              ok={q.outrasDoCpf === 0}
              label={
                q.outrasDoCpf === 0
                  ? "CPF único nesta campanha"
                  : `O mesmo CPF tem mais ${q.outrasDoCpf} oposição(ões) nesta campanha`
              }
            />
            {o.documentoAssinadoUrl && (
              <Requisito
                ok={!o.problemaAssinatura}
                label={o.problemaAssinatura ?? "Assinatura da carta conferida (válida ou com ressalva, CPF confere)"}
              />
            )}
            <Requisito
              ok={q.identificacao}
              label={
                q.identificacao
                  ? `Identificação: ${o.ehFiliado ? "filiado" : "não filiado"}, CPF válido`
                  : "Identificação incompleta: CPF inválido ou nome em branco"
              }
            />
          </ul>
          {algumProblema && avaliavel && (
            <Alert variant="warning">
              <AlertDescription>
                Há requisito não cumprido acima. Confira antes de decidir — se reprovar, informe o motivo.
              </AlertDescription>
            </Alert>
          )}

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
                {decisaoEm ? <> em {formatarDataHora(decisaoEm)}</> : o.avaliacao_data && <> em {formatarData(o.avaliacao_data)}</>}.
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
              <AvaliarForm
                opositorId={o.id}
                campanhaId={id}
                problemaAssinatura={o.problemaAssinatura}
                seguirPorPadrao={o.situacao === "nao_avaliada"}
              />
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
                  {ev.usuarioNome && <span>por {ev.usuarioNome}</span>}
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

/** ok: true = cumpre (✓ verde), false = não cumpre (✗ em destaque), null = sem como saber (?). */
function Requisito({ ok, label }: { ok: boolean | null; label: string }) {
  return (
    <li className="flex items-center gap-2">
      {ok === true ? (
        <Check className="text-success-fg size-4 shrink-0" />
      ) : ok === false ? (
        <X className="text-error-fg size-4 shrink-0" />
      ) : (
        <CircleHelp className="text-muted-foreground size-4 shrink-0" />
      )}
      <span className={ok === false ? "text-error-fg font-medium" : ok === null ? "text-muted-foreground" : ""}>
        {label}
      </span>
    </li>
  )
}
