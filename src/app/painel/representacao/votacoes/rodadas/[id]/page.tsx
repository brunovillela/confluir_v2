import type { Metadata } from "next"
import Link from "next/link"
import { notFound } from "next/navigation"
import { ArrowLeft, Eye, UsersRound } from "lucide-react"

import { ApuracaoBadge } from "@/components/assembleias"
import { CopiarLinkBotao } from "@/components/copiar-link"
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
  periodoTerminado,
} from "@/lib/assembleias-constantes"
import { requirePermissao } from "@/lib/auth"
import { iniciarVisualizacaoEleitor } from "@/lib/actions/visualizacao-eleitor"
import {
  contarAptosPorVoto,
  listarAptos,
  listarAssembleiasDaRodada,
  listarPerguntas,
  obterRodada,
  urlArquivoAssembleias,
  validarEdicaoPerguntas,
} from "@/lib/db/assembleias"
import {
  fimDaJanelaISO,
  situacaoDaAssembleia,
} from "@/lib/db/assembleias-horarios"
import { resumoAvisoAptos } from "@/lib/db/votacao-aviso"
import { formatarCnpjCpf, formatarData, formatarDataHora } from "@/lib/formato"
import { lerPaginacao } from "@/lib/paginacao"

import {
  EditarEleitorBotao,
  ImportarAptos,
  NovoEleitorBotao,
  RemoverAptoBotao,
} from "./aptos"
import { AssembleiasDaRodada, type JanelaItem } from "./assembleias-rodada"
import { AvisoAptos } from "./aviso-aptos"
import { LinkDeVotoBotao } from "./link-voto"
import { Perguntas } from "./perguntas"
import { linkUnicoVotacao } from "../../actions"
import { TrilhaVotacoes } from "../../trilha"
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

  const [perguntas, assembleias, aptos, contagemAptos, editalUrl, cardUrl, aviso] =
    await Promise.all([
      listarPerguntas(id),
      listarAssembleiasDaRodada(id),
      listarAptos(id, { busca, pagina, porPagina, votou }),
      contarAptosPorVoto(id),
      urlArquivoAssembleias(rodada.edital_url),
      urlArquivoAssembleias(rodada.card_grafico_url),
      resumoAvisoAptos(id),
    ])

  // Travas de edição — a MESMA função que as actions usam, para a tela nunca
  // prometer o que o servidor recusa.
  const motivoPerguntas = await validarEdicaoPerguntas(rodada.id)
  const temPerguntaComOpcoes = perguntas.some((p) => p.opcoes.length > 0)
  const motivoAssembleias = periodoTerminado(rodada.termino)
    ? MOTIVO_ASSEMBLEIAS_BLOQUEADAS.periodo
    : !temPerguntaComOpcoes
      ? MOTIVO_ASSEMBLEIAS_BLOQUEADAS.semPerguntas
      : null

  // Janela de cada assembleia: trava edição/exclusão depois do início e
  // libera Apurar só depois do término (regra de 09/10/2026).
  const janelas: Record<string, JanelaItem> = Object.fromEntries(
    assembleias.linhas.map((a) => [
      a.id,
      {
        situacao: situacaoDaAssembleia(a, rodada.termino),
        fim: fimDaJanelaISO(a, rodada.termino),
      },
    ])
  )
  const atas: Record<string, string> = Object.fromEntries(
    (
      await Promise.all(
        assembleias.linhas
          .filter((a) => a.ata)
          .map(async (a) => [a.id, await urlArquivoAssembleias(a.ata)] as const)
      )
    ).filter((par): par is readonly [string, string] => Boolean(par[1]))
  )
  const participacao =
    contagemAptos.total > 0
      ? Math.round((contagemAptos.votaram / contagemAptos.total) * 100)
      : null

  return (
    <>
      <TrilhaVotacoes campanhaId={rodada.campanha_id} rodadaId={rodada.id} />
      <div className="flex flex-wrap items-center gap-3">
        <Button variant="ghost" size="icon" asChild>
          <Link
            href={
              rodada.campanha_id
                ? `/painel/representacao/votacoes/campanhas/${rodada.campanha_id}`
                : "/painel/representacao/votacoes"
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
        {/* Link geral: /votar mostra todas as votações online abertas e as
            próximas — o mesmo do cartão da página Votações. */}
        <div title="Página única com todas as votações online abertas e as próximas">
          <CopiarLinkBotao obterLink={linkUnicoVotacao} rotulo="Copiar link geral" />
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

      {/* Faixa de resumo: tudo o que situa a rodada numa linha só. */}
      <Card className="py-0">
        <CardContent className="flex flex-wrap gap-x-10 gap-y-3 py-4">
          <Indicador rotulo="Período">
            <span className="text-sm font-medium whitespace-nowrap">
              {rodada.inicio || rodada.termino
                ? `${formatarData(rodada.inicio)} a ${formatarData(rodada.termino)}`
                : "—"}
            </span>
          </Indicador>
          <Indicador rotulo="Perguntas">
            <Numero valor={perguntas.length} />
          </Indicador>
          <Indicador rotulo="Assembleias">
            <Numero valor={assembleias.linhas.length} />
          </Indicador>
          <Indicador rotulo="Aptos a votar">
            <Numero valor={rodada.aptos} />
          </Indicador>
          <Indicador rotulo="Votaram">
            <span className="flex items-baseline gap-1.5">
              <Numero valor={contagemAptos.votaram} />
              {participacao !== null && (
                <span className="text-muted-foreground text-xs tabular-nums">
                  {participacao}%
                </span>
              )}
            </span>
          </Indicador>
          <Indicador rotulo="Fonte pagadora">
            {rodada.fontes.length === 0 ? (
              <span className="text-muted-foreground text-xs">
                {rodada.campanha_id ? "Nenhuma vinculada" : "Sem campanha"}
              </span>
            ) : (
              <span className="flex flex-wrap gap-1">
                {rodada.fontes.map((f) => (
                  <Badge key={f} variant="outline">
                    {f}
                  </Badge>
                ))}
              </span>
            )}
          </Indicador>
        </CardContent>
      </Card>

      {/* Duas colunas independentes — cada uma empilha os seus cartões, sem
          vão quando um lado é mais alto: o que acontece (assembleias, aptos)
          à esquerda; o que configura (dados, perguntas, aviso) na lateral. */}
      <div className="grid items-start gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(0,26rem)]">
        <div className="grid min-w-0 content-start gap-4">
          <AssembleiasDaRodada
            rodadaId={rodada.id}
            assembleias={assembleias.linhas}
            esquemaPronto={assembleias.esquemaPronto}
            editavel={motivoAssembleias === null}
            motivoBloqueio={motivoAssembleias}
            janelas={janelas}
            atas={atas}
            terminoDaRodada={rodada.termino}
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
                  action={`/painel/representacao/votacoes/rodadas/${rodada.id}`}
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
                          {/* Aviso do próprio eleitor ou da conferência: a
                              secretaria corrige o cadastro e ele vota. */}
                          {!a.cpf_conflito && a.conflito_motivo && (
                            <Badge
                              variant="outline"
                              className="border-warning/40 text-warning-fg ml-1.5"
                              title={a.conflito_motivo}
                            >
                              Conferir cadastro
                            </Badge>
                          )}
                          {/* Cadastro pelo link único: o e-mail da empresa foi só
                              digitado — a comissão revisa. */}
                          {a.cadastro_canal === "link_unico" && (
                            <Badge
                              variant="outline"
                              className="ml-1.5"
                              title={`Identificou-se pelo link único ${a.email_contato ? `com o e-mail ${a.email_contato}` : "pelo Telegram"}`}
                            >
                              Link único
                            </Badge>
                          )}
                        </TableCell>
                        <TableCell className="whitespace-nowrap tabular-nums">
                          {a.cpf ? formatarCnpjCpf(a.cpf) : "—"}
                          {a.cpf_conflito && (
                            <Badge
                              variant="outline"
                              className="border-destructive/40 text-destructive ml-1.5"
                              title={`Informou ${formatarCnpjCpf(a.cpf_conflito)} — ${a.conflito_motivo ?? "conflito"}`}
                            >
                              CPF em conflito
                            </Badge>
                          )}
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
                            {/* Vê a cédula como esse eleitor vê, sem poder votar. */}
                            <form action={iniciarVisualizacaoEleitor}>
                              <input type="hidden" name="aptoId" value={a.id} />
                              <input type="hidden" name="rodadaId" value={rodada.id} />
                              <Button
                                type="submit"
                                variant="ghost"
                                size="icon"
                                className="size-7"
                                aria-label="Visualizar área do eleitor"
                                title="Visualizar área do eleitor"
                              >
                                <Eye />
                              </Button>
                            </form>
                            {!a.hora_voto && (
                              <LinkDeVotoBotao aptoId={a.id} nome={a.nome_completo} />
                            )}
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
        </div>
        <div className="grid min-w-0 content-start gap-4">
          <RodadaForm rodada={rodada} editalUrl={editalUrl} cardUrl={cardUrl} />
          <Perguntas
            rodadaId={rodada.id}
            perguntas={perguntas}
            editavel={motivoPerguntas === null}
            motivoBloqueio={motivoPerguntas}
          />
          <AvisoAptos
            rodadaId={rodada.id}
            resumo={aviso}
            bloqueio={
              periodoTerminado(rodada.termino)
                ? "O período desta rodada já terminou."
                : assembleias.linhas.length === 0
                  ? "Cadastre ao menos uma assembleia antes de avisar os aptos — o e-mail diz onde e como votar."
                  : null
            }
          />
        </div>
      </div>
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

function Indicador({
  rotulo,
  children,
}: {
  rotulo: string
  children: React.ReactNode
}) {
  return (
    <div className="grid min-w-0 content-start gap-1">
      <p className="text-muted-foreground text-xs">{rotulo}</p>
      {children}
    </div>
  )
}

function Numero({ valor }: { valor: number }) {
  return (
    <span className="text-xl leading-none font-semibold tabular-nums">
      {valor.toLocaleString("pt-BR")}
    </span>
  )
}
