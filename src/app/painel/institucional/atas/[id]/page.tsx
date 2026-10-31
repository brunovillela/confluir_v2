import type { Metadata } from "next"
import Link from "next/link"
import { notFound } from "next/navigation"
import { ArrowLeft, FileText, Pencil, Plus } from "lucide-react"

import { Alert, AlertDescription } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { requirePermissao } from "@/lib/auth"
import { obterAta, opcoesMandatos } from "@/lib/db/atas"
import { assuntosUsados, deliberacoesDaAta, eventosDaAta, responsaveisPossiveis } from "@/lib/db/deliberacoes"
import {
  nivelSigilo,
  ROTULO_NIVEL_SIGILO,
  ROTULO_SIGILO_DELIBERACAO,
  sigilosVisiveis,
} from "@/lib/deliberacoes-constantes"
import { formatarData } from "@/lib/formato"
import { podeAcessar } from "@/lib/permissoes"
import { ROTULO_TIPO_REUNIAO } from "@/lib/atas-constantes"

import { SeloSigilo, SeloSituacao } from "../../deliberacoes/selos"
import { TrilhaDeliberacao } from "../../deliberacoes/trilha"
import { AtaForm, BotaoExcluirAta } from "../ata-form"
import { BotaoExcluirDeliberacao, DeliberacaoForm } from "../deliberacao-form"

export const metadata: Metadata = { title: "Ata de reunião — Confluir" }

function Campo({ rotulo, valor }: { rotulo: string; valor: string | null }) {
  return (
    <div>
      <dt className="text-muted-foreground text-xs">{rotulo}</dt>
      <dd className="mt-0.5 text-sm whitespace-pre-wrap">{valor ?? "—"}</dd>
    </div>
  )
}

export default async function AtaPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{
    editar?: string
    salvo?: string
    deliberacao?: string
    nova_deliberacao?: string
    deliberacao_salva?: string
    deliberacao_excluida?: string
  }>
}) {
  const sessao = await requirePermissao("diretoria_reunioes", ["diretoria_atas_consulta"])
  const podeEditar = podeAcessar(sessao.permissoes, "diretoria_reunioes")
  const { id } = await params
  const sp = await searchParams
  const { editar, salvo } = sp
  // Deliberações e PDF da ata só até o nível de sigilo do usuário (nenhum = não vê nenhuma).
  const nivel = nivelSigilo(sessao.permissoes)
  const sigilos = sigilosVisiveis(nivel)
  const a = await obterAta(id, sigilos)
  if (!a) notFound()
  const podeLancar = podeEditar && sigilos.length > 0
  const editandoDeliberacao = podeLancar ? (sp.deliberacao ?? null) : null
  const novaDeliberacao = podeLancar && sp.nova_deliberacao === "1"
  const comForm = Boolean(editandoDeliberacao) || novaDeliberacao
  const [{ visiveis: deliberacoes, ocultas }, assuntos, responsaveis, eventos] = await Promise.all([
    deliberacoesDaAta(id, sigilos),
    comForm ? assuntosUsados(sigilos) : Promise.resolve([]),
    comForm ? responsaveisPossiveis() : Promise.resolve([]),
    eventosDaAta(id, sigilos),
  ])
  // Trilha das excluídas: os eventos ficam sem o vínculo com a deliberação.
  const eventosExcluidas = eventos.filter((e) => !e.deliberacaoId)

  const editando = podeEditar && editar === "1"
  const mandatos = editando ? await opcoesMandatos() : []
  const aqui = `/painel/institucional/atas/${id}`
  const voltarHref = a.mandatoId
    ? `/painel/institucional/diretoria/${a.mandatoId}`
    : "/painel/institucional/atas"

  return (
    <>
      <div>
        <Button variant="ghost" size="sm" asChild className="-ml-2 mb-3">
          <Link href={voltarHref}>
            <ArrowLeft />
            {a.mandatoId ? "Mandato" : "Atas de reunião"}
          </Link>
        </Button>
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-2xl font-semibold tracking-tight text-balance">
            {a.titulo ?? "(sem título)"}
          </h1>
          <Badge variant="secondary">{ROTULO_TIPO_REUNIAO[a.tipo]}</Badge>
        </div>
        <p className="text-muted-foreground mt-1 text-xs">
          {a.data ? formatarData(a.data) : "sem data"}
          {a.mandatoNome && <> · {a.mandatoNome}</>}
          {a.orgao && <> · {a.orgao}</>}
        </p>
      </div>

      {salvo === "1" && (
        <Alert className="border-success/40 text-success-fg">
          <AlertDescription>Ata salva.</AlertDescription>
        </Alert>
      )}

      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <CardTitle className="flex items-center gap-2 text-base">
              Ata da reunião
              <SeloSigilo sigilo={a.sigiloDocumento} />
            </CardTitle>
            {podeEditar && !editando && (
              <div className="flex gap-2">
                <Button variant="outline" size="sm" asChild>
                  <Link href={`${aqui}?editar=1`}>
                    <Pencil />
                    Editar
                  </Link>
                </Button>
                <BotaoExcluirAta ataId={id} mandatoId={a.mandatoId} />
              </div>
            )}
          </div>
        </CardHeader>
        <CardContent>
          {editando ? (
            <AtaForm
              ata={a}
              mandatos={mandatos}
              aoCancelarHref={aqui}
              temDeliberacoes={deliberacoes.length + ocultas > 0}
              sigilos={sigilos}
            />
          ) : (
            <dl className="grid gap-4">
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                <Campo rotulo="Data" valor={a.data ? formatarData(a.data) : null} />
                <Campo rotulo="Hora" valor={a.hora} />
                <Campo rotulo="Local" valor={a.local} />
                <Campo rotulo="Tipo" valor={ROTULO_TIPO_REUNIAO[a.tipo]} />
              </div>
              {(
                [
                  ["Pauta", a.pauta, a.ocultos.pauta],
                  ["Resumo da reunião", a.resumo, a.ocultos.resumo],
                ] as const
              ).map(([rotulo, valor, oculto]) =>
                oculto ? (
                  <div key={rotulo}>
                    <dt className="text-muted-foreground text-xs">{rotulo}</dt>
                    <dd className="text-muted-foreground mt-0.5 text-sm">
                      {ROTULO_SIGILO_DELIBERACAO[a.sigiloDocumento]} — acima do seu acesso às deliberações (
                      {ROTULO_NIVEL_SIGILO[nivel]}).
                    </dd>
                  </div>
                ) : (
                  <Campo key={rotulo} rotulo={rotulo} valor={valor} />
                )
              )}
              <Campo rotulo="Presentes" valor={a.presentes} />
              {a.ocultos.observacoes ? (
                <div>
                  <dt className="text-muted-foreground text-xs">Observações</dt>
                  <dd className="text-muted-foreground mt-0.5 text-sm">
                    {ROTULO_SIGILO_DELIBERACAO[a.sigiloDocumento]} — acima do seu acesso às deliberações (
                    {ROTULO_NIVEL_SIGILO[nivel]}).
                  </dd>
                </div>
              ) : (
                a.observacoes && <Campo rotulo="Observações" valor={a.observacoes} />
              )}
              <div>
                <dt className="text-muted-foreground flex items-center gap-1.5 text-xs">
                  Ata em PDF
                </dt>
                <dd className="mt-0.5 text-sm">
                  {a.temDocumento && !a.documentoUrl ? (
                    <span className="text-muted-foreground">
                      O PDF é {ROTULO_SIGILO_DELIBERACAO[a.sigiloDocumento].toLowerCase()} e está acima do seu acesso às
                      deliberações ({ROTULO_NIVEL_SIGILO[nivel]}).
                    </span>
                  ) : a.documentoUrl ? (
                    <Button variant="ghost" size="sm" asChild className="-ml-2">
                      <a href={a.documentoUrl} target="_blank" rel="noreferrer">
                        <FileText />
                        Abrir PDF
                      </a>
                    </Button>
                  ) : (
                    "—"
                  )}
                </dd>
              </div>
            </dl>
          )}
        </CardContent>
      </Card>

      <Card id="deliberacoes">
        <CardHeader>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <CardTitle className="text-base">
              Deliberações
              {nivel !== "nenhum" && (
                <span className="text-muted-foreground ml-2 text-sm font-normal">{deliberacoes.length}</span>
              )}
            </CardTitle>
            {podeLancar && !novaDeliberacao && (
              <Button variant="outline" size="sm" asChild>
                <Link href={`${aqui}?nova_deliberacao=1#deliberacoes`}>
                  <Plus />
                  Nova deliberação
                </Link>
              </Button>
            )}
          </div>
        </CardHeader>
        <CardContent className="grid gap-3">
          {sp.deliberacao_salva === "1" && (
            <Alert className="border-success/40 text-success-fg">
              <AlertDescription>Deliberação salva.</AlertDescription>
            </Alert>
          )}
          {sp.deliberacao_excluida === "1" && (
            <Alert>
              <AlertDescription>Deliberação excluída.</AlertDescription>
            </Alert>
          )}
          {nivel === "nenhum" ? (
            <p className="text-muted-foreground text-sm">
              Seu acesso às deliberações é <strong>nenhum</strong>. Para vê-las, peça à administração um nível de
              sigilo (livre, reservado ou restrito).
            </p>
          ) : (
            deliberacoes.length === 0 &&
            ocultas === 0 &&
            !novaDeliberacao && (
              <p className="text-muted-foreground text-sm">
                Nenhuma deliberação registrada nesta ata.
                {podeLancar && " Registre cada decisão como um item, com situação e sigilo."}
              </p>
            )
          )}
          {deliberacoes.length > 0 && (
            <ol className="grid gap-3">
              {deliberacoes.map((d) =>
                editandoDeliberacao === d.id ? (
                  <li key={d.id}>
                    <DeliberacaoForm
                      ataId={id}
                      deliberacao={d}
                      assuntos={assuntos}
                      sigilos={sigilos}
                      responsaveis={responsaveis}
                      cancelarHref={`${aqui}#deliberacoes`}
                    />
                  </li>
                ) : (
                  <li key={d.id} className="border-b pb-3 last:border-b-0 last:pb-0">
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <p className="font-medium">
                        <span className="text-muted-foreground mr-1.5 tabular-nums">{d.ordem}.</span>
                        {d.assunto}
                      </p>
                      <div className="flex flex-wrap items-center gap-1.5">
                        <SeloSituacao situacao={d.situacao} />
                        <SeloSigilo sigilo={d.sigilo} />
                        {podeLancar && (
                          <>
                            <Button variant="ghost" size="sm" asChild aria-label="Editar deliberação">
                              <Link href={`${aqui}?deliberacao=${d.id}#deliberacoes`}>
                                <Pencil className="size-4" />
                              </Link>
                            </Button>
                            <BotaoExcluirDeliberacao ataId={id} deliberacaoId={d.id} />
                          </>
                        )}
                      </div>
                    </div>
                    {d.texto && d.texto !== d.assunto && (
                      <p className="mt-1 text-sm whitespace-pre-wrap">{d.texto}</p>
                    )}
                    {(d.votacao || d.responsavel || d.responsavelNome || d.prazo) && (
                      <p className="text-muted-foreground mt-1 text-xs">
                        {[
                          d.votacao && `Votação: ${d.votacao}`,
                          (d.responsavelNome || d.responsavel) &&
                            `Responsável: ${[d.responsavelNome, d.responsavel].filter(Boolean).join(" · ")}`,
                          d.prazo && `Prazo: ${formatarData(d.prazo)}`,
                        ]
                          .filter(Boolean)
                          .join(" · ")}
                      </p>
                    )}
                    <TrilhaDeliberacao eventos={eventos.filter((e) => e.deliberacaoId === d.id)} />
                  </li>
                )
              )}
            </ol>
          )}
          <TrilhaDeliberacao eventos={eventosExcluidas} titulo="Deliberações excluídas desta ata" comAssunto />
          {nivel !== "nenhum" && ocultas > 0 && (
            <p className="text-muted-foreground text-xs">
              {ocultas === 1 ? "1 deliberação desta ata está" : `${ocultas} deliberações desta ata estão`} acima do
              seu acesso ({ROTULO_NIVEL_SIGILO[nivel]}) e não {ocultas === 1 ? "aparece" : "aparecem"} aqui.
            </p>
          )}
          {novaDeliberacao && (
            <DeliberacaoForm
              ataId={id}
              assuntos={assuntos}
              sigilos={sigilos}
              responsaveis={responsaveis}
              cancelarHref={`${aqui}#deliberacoes`}
            />
          )}
        </CardContent>
      </Card>
    </>
  )
}
