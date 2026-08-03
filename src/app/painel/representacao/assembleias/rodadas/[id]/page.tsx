import type { Metadata } from "next"
import Link from "next/link"
import { notFound } from "next/navigation"
import { ArrowLeft, UsersRound } from "lucide-react"

import { ApuracaoBadge } from "@/components/assembleias"
import { Paginacao } from "@/components/paginacao"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import {
  MOTIVO_ASSEMBLEIAS_BLOQUEADAS,
  MOTIVO_PERGUNTAS_BLOQUEADAS,
  periodoIniciado,
  periodoTerminado,
} from "@/lib/assembleias-constantes"
import { requirePermissao } from "@/lib/auth"
import {
  contarAptosPorVoto,
  listarAptos,
  listarAssembleiasDaRodada,
  listarPerguntas,
  obterRodada,
  urlArquivoAssembleias,
} from "@/lib/db/assembleias"
import { formatarCnpjCpf, formatarDataHora } from "@/lib/formato"
import { lerPaginacao } from "@/lib/paginacao"

import {
  EditarEleitorBotao,
  ImportarAptos,
  NovoEleitorBotao,
  RemoverAptoBotao,
} from "./aptos"
import { AssembleiasDaRodada } from "./assembleias-rodada"
import { Perguntas } from "./perguntas"
import { RodadaForm } from "./rodada-form"

export const metadata: Metadata = { title: "Rodada de assembleias — Confluir" }

const INPUT_FILTRO =
  "border-input bg-background text-foreground h-9 rounded-md border px-3 text-sm shadow-xs outline-none"

type Params = {
  busca?: string
  votou?: string
  aptosPagina?: string
  aptosPorPagina?: string
  criada?: string
}

/** Itens por página padrão da lista de aptos (lista principal da seção). */
const APTOS_PADRAO = 30

export default async function RodadaPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<Params>
}) {
  await requirePermissao("assembleias")
  const { id } = await params
  const brutos = await searchParams
  const busca = (brutos.busca ?? "").trim()
  const votou =
    brutos.votou === "sim" || brutos.votou === "nao" ? brutos.votou : undefined
  const { pagina, porPagina } = lerPaginacao(brutos, APTOS_PADRAO, "aptos")

  const rodada = await obterRodada(id)
  if (!rodada) notFound()

  const [perguntas, assembleias, aptos, contagemAptos, editalUrl, cardUrl] =
    await Promise.all([
      listarPerguntas(id),
      listarAssembleiasDaRodada(id),
      listarAptos(id, { busca, pagina, porPagina, votou }),
      contarAptosPorVoto(id),
      urlArquivoAssembleias(rodada.edital_url),
      urlArquivoAssembleias(rodada.card_grafico_url),
    ])

  // Travas de edição (regras de 2026-07-20) — o servidor revalida nas actions.
  const motivoPerguntas =
    assembleias.linhas.length > 0
      ? MOTIVO_PERGUNTAS_BLOQUEADAS.assembleias
      : periodoIniciado(rodada.inicio, rodada.termino)
        ? MOTIVO_PERGUNTAS_BLOQUEADAS.periodo
        : null
  const temPerguntaComOpcoes = perguntas.some((p) => p.opcoes.length > 0)
  const motivoAssembleias = periodoTerminado(rodada.termino)
    ? MOTIVO_ASSEMBLEIAS_BLOQUEADAS.periodo
    : !temPerguntaComOpcoes
      ? MOTIVO_ASSEMBLEIAS_BLOQUEADAS.semPerguntas
      : null

  return (
    <>
      <div className="flex flex-wrap items-center gap-3">
        <Button variant="ghost" size="icon" asChild>
          <Link
            href={
              rodada.campanha_id
                ? `/painel/representacao/assembleias/campanhas/${rodada.campanha_id}`
                : "/painel/representacao/assembleias"
            }
            aria-label="Voltar para a campanha"
          >
            <ArrowLeft />
          </Link>
        </Button>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="truncate text-2xl font-semibold tracking-tight">
              {rodada.nome ?? "(sem nome)"}
            </h1>
            <ApuracaoBadge encerrada={rodada.apuracao_encerrada} />
          </div>
          <p className="text-muted-foreground mt-1 text-xs">
            {rodada.campanhaTema ?? "Sem campanha vinculada"}
            {rodada.codigo ? ` · código ${rodada.codigo}` : ""}
          </p>
        </div>
      </div>

      {brutos.criada === "1" && (
        <Alert variant="success">
          <AlertDescription>
            Rodada criada. Cadastre as perguntas, a lista de aptos e as
            assembleias.
          </AlertDescription>
        </Alert>
      )}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
        <CardResumo rotulo="Perguntas" valor={perguntas.length} />
        <CardResumo rotulo="Assembleias" valor={assembleias.linhas.length} />
        <CardResumo rotulo="Aptos a votar" valor={rodada.aptos} />
        <CardResumo rotulo="Votos online" valor={rodada.votosOnline} />
        <Card>
          <CardContent>
            <p className="text-muted-foreground text-xs">
              Fonte pagadora vinculada
            </p>
            {rodada.fontes.length === 0 ? (
              <p className="text-muted-foreground mt-1 text-xs">
                {rodada.campanha_id ? "Nenhuma vinculada" : "Sem campanha"}
              </p>
            ) : (
              <div className="mt-1.5 flex flex-wrap gap-1.5">
                {rodada.fontes.map((f) => (
                  <Badge key={f} variant="outline">
                    {f}
                  </Badge>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <RodadaForm rodada={rodada} editalUrl={editalUrl} cardUrl={cardUrl} />

      <Perguntas
        rodadaId={rodada.id}
        perguntas={perguntas}
        editavel={motivoPerguntas === null}
        motivoBloqueio={motivoPerguntas}
      />

      <AssembleiasDaRodada
        rodadaId={rodada.id}
        assembleias={assembleias.linhas}
        esquemaPronto={assembleias.esquemaPronto}
        editavel={motivoAssembleias === null}
        motivoBloqueio={motivoAssembleias}
      />

      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <CardTitle className="text-base">
              Aptos a votar na rodada
            </CardTitle>
            <div className="flex flex-wrap gap-2">
              <NovoEleitorBotao rodadaId={rodada.id} />
              <ImportarAptos rodadaId={rodada.id} />
            </div>
          </div>
        </CardHeader>
        <CardContent className="grid gap-4">
          <div className="flex flex-wrap items-center gap-3">
            <form
              className="flex flex-wrap items-center gap-2"
              action={`/painel/representacao/assembleias/rodadas/${rodada.id}`}
            >
              {votou && <input type="hidden" name="votou" value={votou} />}
              {porPagina !== APTOS_PADRAO && (
                <input
                  type="hidden"
                  name="aptosPorPagina"
                  value={String(porPagina)}
                />
              )}
              <input
                type="search"
                name="busca"
                defaultValue={busca}
                placeholder="Nome ou CPF"
                className={`${INPUT_FILTRO} w-64 max-w-full`}
              />
              <Button type="submit" variant="outline" size="sm">
                Buscar
              </Button>
            </form>
            <div className="flex flex-wrap gap-1.5">
              <FiltroVotou
                rotulo="Todos"
                ativo={!votou}
                href={hrefFiltro({ busca, porPagina })}
                contagem={contagemAptos.total}
              />
              <FiltroVotou
                rotulo="Já votou"
                ativo={votou === "sim"}
                href={hrefFiltro({ busca, votou: "sim", porPagina })}
                contagem={contagemAptos.votaram}
              />
              <FiltroVotou
                rotulo="Não votou"
                ativo={votou === "nao"}
                href={hrefFiltro({ busca, votou: "nao", porPagina })}
                contagem={contagemAptos.ausentes}
              />
            </div>
          </div>

          {aptos.linhas.length === 0 ? (
            <p className="text-muted-foreground py-8 text-center text-sm">
              <UsersRound className="mx-auto mb-2 size-5" />
              {busca || votou
                ? "Nenhum eleitor encontrado com estes filtros."
                : "Nenhum eleitor cadastrado nesta rodada ainda."}
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Nome</TableHead>
                  <TableHead>CPF</TableHead>
                  <TableHead>Matrícula</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead>Votou em</TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {aptos.linhas.map((a) => (
                  <TableRow key={a.id}>
                    <TableCell className="max-w-72 truncate">
                      {a.nome_completo ?? "—"}
                    </TableCell>
                    <TableCell className="whitespace-nowrap tabular-nums">
                      {a.cpf ? formatarCnpjCpf(a.cpf) : "—"}
                    </TableCell>
                    <TableCell className="tabular-nums">
                      {a.matricula ?? "—"}
                    </TableCell>
                    <TableCell className="max-w-64 truncate">
                      {a.email_corporativo ?? "—"}
                    </TableCell>
                    <TableCell className="whitespace-nowrap">
                      {a.hora_voto ? formatarDataHora(a.hora_voto) : "—"}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-1">
                        <EditarEleitorBotao rodadaId={rodada.id} apto={a} />
                        <RemoverAptoBotao
                          rodadaId={rodada.id}
                          aptoId={a.id}
                          jaVotou={a.hora_voto !== null}
                        />
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}

          <Paginacao
            total={aptos.total}
            pagina={aptos.pagina}
            totalPaginas={aptos.totalPaginas}
            porPagina={porPagina}
            padrao={APTOS_PADRAO}
            prefixo="aptos"
          />
        </CardContent>
      </Card>
    </>
  )
}

/** Monta o href de um filtro de voto preservando busca/porPagina (volta à página 1). */
function hrefFiltro({
  busca,
  votou,
  porPagina,
}: {
  busca: string
  votou?: "sim" | "nao"
  porPagina: number
}): string {
  const q = new URLSearchParams()
  if (busca) q.set("busca", busca)
  if (votou) q.set("votou", votou)
  if (porPagina !== APTOS_PADRAO) q.set("aptosPorPagina", String(porPagina))
  const s = q.toString()
  return s ? `?${s}` : "?"
}

function FiltroVotou({
  rotulo,
  ativo,
  href,
  contagem,
}: {
  rotulo: string
  ativo: boolean
  href: string
  contagem: number
}) {
  return (
    <Button
      variant={ativo ? "default" : "outline"}
      size="sm"
      asChild
    >
      <Link href={href}>
        {rotulo}
        <Badge
          variant={ativo ? "secondary" : "outline"}
          className="ml-1 tabular-nums"
        >
          {contagem.toLocaleString("pt-BR")}
        </Badge>
      </Link>
    </Button>
  )
}

function CardResumo({ rotulo, valor }: { rotulo: string; valor: number }) {
  return (
    <Card>
      <CardContent>
        <p className="text-muted-foreground text-xs">{rotulo}</p>
        <p className="mt-1 text-2xl font-semibold tabular-nums">
          {valor.toLocaleString("pt-BR")}
        </p>
      </CardContent>
    </Card>
  )
}
