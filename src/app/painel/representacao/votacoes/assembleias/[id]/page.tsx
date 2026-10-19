import type { Metadata } from "next"
import Link from "next/link"
import { notFound } from "next/navigation"
import { FileText, Pencil, UsersRound } from "lucide-react"

import { ModalidadeBadge } from "@/components/assembleias"
import { Paginacao } from "@/components/paginacao"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { temUrna, temVotoOnline } from "@/lib/assembleias-constantes"
import { requirePermissao } from "@/lib/auth"
import {
  dadosApuracao,
  listarAssembleiasDaRodada,
  obterAssembleia,
  obterRodada,
  urlArquivoAssembleias,
} from "@/lib/db/assembleias"
import { janelaDaAssembleia, situacaoDaAssembleia } from "@/lib/db/assembleias-horarios"
import { votantesDaAssembleia, votosPorHora } from "@/lib/db/votacao-assembleia"
import { caminhoVotacao } from "@/lib/db/votacao-caminho"
import { entregaDaAssembleia } from "@/lib/db/votacao-entrega"
import { integridadeDaApuracao } from "@/lib/db/votacao-livro-apuracao"
import { acompanhamentoAssembleia, dadosUrnasAssembleia } from "@/lib/db/votacao-mesarios"
import { formatarCnpjCpf, formatarData, formatarDataHora } from "@/lib/formato"
import { lerPaginacao } from "@/lib/paginacao"
import { hrefAssembleia, hrefCampanha, hrefRodada, RAIZ_VOTACOES } from "@/lib/votacao-navegacao"

import { ContagemRegressiva } from "../../contagem-regressiva"
import { AbasVotacao, ChipsIrmaos, VoltarNivel } from "../../navegacao"
import { ConteudoApuracao } from "../../apuracao/[id]/conteudo"
import { EntregaCard } from "../../apuracao/[id]/entrega-card"
import { AtaBotao, ProrrogarBotao, SituacaoBadge } from "../../rodadas/[id]/assembleias-rodada"
import { LinkDeVotoBotao } from "../../rodadas/[id]/link-voto"
import { TrilhaVotacoes } from "../../trilha"
import { ConteudoUrnas } from "../../urnas/[id]/conteudo"

export const metadata: Metadata = { title: "Assembleia — Confluir" }

const ABAS = ["geral", "votantes", "urnas", "apuracao"] as const
type ChaveAba = (typeof ABAS)[number]
const VOTANTES_PADRAO = 50

type Busca = { aba?: string; fonte?: string; situacao?: string; busca?: string; votantesPagina?: string; votantesPorPagina?: string }

/**
 * A ASSEMBLEIA (reorganização de 17/10/2026): uma página com abas — visão
 * geral (contagem regressiva, informações, votos por hora, entrega), votantes,
 * urnas e mesários (presencial) e apuração. Junta o que antes eram três páginas
 * soltas (Apuração, Acompanhar, Urnas), que agora redirecionam para cá.
 */
export default async function AssembleiaPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<Busca>
}) {
  await requirePermissao("assembleias")
  const { id } = await params
  const sp = await searchParams
  const caminho = await caminhoVotacao({ assembleiaId: id, fonteId: sp.fonte })
  if (!caminho.assembleia) notFound()
  const fonte = caminho.fonte?.id ?? null
  const rodadaId = caminho.rodada?.id ?? null

  const [lista, rodada, apuracao] = await Promise.all([
    rodadaId ? listarAssembleiasDaRodada(rodadaId) : Promise.resolve({ linhas: [], esquemaPronto: true }),
    rodadaId ? obterRodada(rodadaId) : Promise.resolve(null),
    dadosApuracao(id),
  ])
  // Sem rodada (legado do Bubble): a assembleia vem sozinha, ligada à campanha.
  const a = lista.linhas.find((x) => x.id === id) ?? (await obterAssembleia(id))
  if (!a || !apuracao) notFound()

  const terminoRodada = rodada?.termino ?? null
  const janela = janelaDaAssembleia(a, terminoRodada)
  const situacao = situacaoDaAssembleia(a, terminoRodada)
  const inicioISO = janela.inicio !== null ? new Date(janela.inicio).toISOString() : null
  const fimISO = janela.termino !== null ? new Date(janela.termino).toISOString() : null
  const online = temVotoOnline(a.modalidade)
  const comUrna = temUrna(a.modalidade)

  const aba: ChaveAba = (ABAS as readonly string[]).includes(sp.aba ?? "")
    ? (sp.aba as ChaveAba)
    : "geral"
  const abaValida: ChaveAba = aba === "urnas" && !comUrna ? "geral" : aba
  const href = (chave: ChaveAba) => hrefAssembleia(id, fonte, chave === "geral" ? undefined : chave)
  const participacao = apuracao.aptos > 0 ? Math.round((apuracao.votantes / apuracao.aptos) * 100) : null

  const abas = [
    { chave: "geral", rotulo: "Visão geral", href: href("geral") },
    { chave: "votantes", rotulo: "Votantes", href: href("votantes"), contagem: apuracao.votantes },
    ...(comUrna ? [{ chave: "urnas", rotulo: "Urnas e mesários", href: href("urnas") }] : []),
    {
      chave: "apuracao",
      rotulo: apuracao.apuracaoEncerrada ? "Apuração (encerrada)" : "Apuração",
      href: href("apuracao"),
      alerta: situacao === "encerrada" && !apuracao.apuracaoEncerrada,
    },
  ]

  return (
    <>
      <TrilhaVotacoes caminho={caminho} />
      <div className="grid gap-3">
        {rodadaId ? (
          <VoltarNivel href={hrefRodada(rodadaId, fonte)} rotulo={caminho.rodada?.nome ?? "Rodada de assembleias"} />
        ) : caminho.campanha ? (
          <VoltarNivel href={hrefCampanha(caminho.campanha.id, fonte)} rotulo={caminho.campanha.nome ?? "Campanha"} />
        ) : null}
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-2xl font-semibold tracking-tight">{a.nome ?? "Assembleia"}</h1>
              <SituacaoBadge situacao={situacao} apuracaoEncerrada={a.apuracao_encerrada} />
              <ModalidadeBadge modalidade={a.modalidade} />
            </div>
            <p className="text-muted-foreground mt-1 text-xs">
              {[caminho.fonte?.nome, caminho.campanha?.nome, caminho.rodada?.nome].filter(Boolean).join(" · ")}
            </p>
          </div>
          <ContagemRegressiva inicio={inicioISO} fim={fimISO} />
        </div>

        <Card className="py-0">
          <CardContent className="flex flex-wrap gap-x-10 gap-y-3 py-4">
            <Indicador rotulo="Período">
              <span className="text-sm font-medium">
                {inicioISO ? formatarDataHora(inicioISO) : "—"} a {fimISO ? formatarDataHora(fimISO) : "—"}
              </span>
            </Indicador>
            <Indicador rotulo="Aptos">
              <Numero valor={apuracao.aptos} />
            </Indicador>
            <Indicador rotulo="Votaram">
              <span className="flex items-baseline gap-1.5">
                <Numero valor={apuracao.votantes} />
                {participacao !== null && <span className="text-muted-foreground text-xs">{participacao}%</span>}
              </span>
            </Indicador>
            <Indicador rotulo="Faltam votar">
              <Numero valor={Math.max(0, apuracao.aptos - apuracao.votantes)} />
            </Indicador>
          </CardContent>
        </Card>

        <ChipsIrmaos
          atual={id}
          itens={lista.linhas.map((x) => ({ id: x.id, rotulo: x.nome ?? "Assembleia", href: hrefAssembleia(x.id, fonte, aba === "geral" ? undefined : aba) }))}
        />
        <AbasVotacao abas={abas} ativa={abaValida} />
      </div>

      {abaValida === "geral" && (
        <VisaoGeral
          id={id}
          rodadaId={rodadaId}
          fonte={fonte}
          assembleia={a}
          situacao={situacao}
          fimISO={fimISO}
          terminoRodada={terminoRodada}
          online={online}
          comUrna={comUrna}
        />
      )}
      {abaValida === "votantes" && <AbaVotantes id={id} fonte={fonte} sp={sp} online={online} disponivel={apuracao.apuracaoDisponivel} />}
      {abaValida === "urnas" && <AbaUrnas id={id} hrefApuracao={href("apuracao")} />}
      {abaValida === "apuracao" && <AbaApuracao id={id} apuracao={apuracao} />}
    </>
  )
}

// ── Visão geral ─────────────────────────────────────────────────────────────

async function VisaoGeral({
  id,
  rodadaId,
  fonte,
  assembleia: a,
  situacao,
  fimISO,
  terminoRodada,
  online,
  comUrna,
}: {
  id: string
  rodadaId: string | null
  fonte: string | null
  assembleia: Awaited<ReturnType<typeof listarAssembleiasDaRodada>>["linhas"][number]
  situacao: ReturnType<typeof situacaoDaAssembleia>
  fimISO: string | null
  terminoRodada: string | null
  online: boolean
  comUrna: boolean
}) {
  const [faixas, entrega, ataUrl] = await Promise.all([
    votosPorHora(id),
    online ? entregaDaAssembleia(id).catch(() => null) : Promise.resolve(null),
    a.ata ? urlArquivoAssembleias(a.ata) : Promise.resolve(null),
  ])
  const iniciada = situacao !== "antes"
  const maior = Math.max(1, ...faixas.map((f) => f.votos))

  return (
    <div className="grid gap-4">
      <div className="grid items-start gap-4 xl:grid-cols-[minmax(0,26rem)_minmax(0,1fr)]">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Informações</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-3 text-sm">
            <Campo rotulo="Janela de votação">
              {formatarData(a.data_inicio)}
              {a.hora_inicio ? ` ${a.hora_inicio}` : ""} a {formatarData(a.data_termino)}
              {a.hora_termino ? ` ${a.hora_termino}` : ""}
            </Campo>
            {a.descricao && <Campo rotulo="Descrição">{a.descricao}</Campo>}
            {a.sala_link && (
              <Campo rotulo="Assembleia virtual">
                {formatarData(a.sala_data)}
                {a.sala_hora ? ` às ${a.sala_hora}` : ""} ·{" "}
                <a href={a.sala_link} target="_blank" rel="noreferrer" className="text-primary underline underline-offset-4">
                  abrir a sala
                </a>
              </Campo>
            )}
            <div className="flex flex-wrap gap-1.5">
              {a.somente_filiados ? (
                <Badge variant="secondary">Somente filiados</Badge>
              ) : (
                <Badge variant="outline">Toda a categoria</Badge>
              )}
              {comUrna && a.voto_em_separado && <Badge variant="outline">Voto em separado</Badge>}
            </div>
            {rodadaId && (
              <div className="flex flex-wrap items-center gap-1.5 border-t pt-3">
                {iniciada && !a.apuracao_encerrada && (
                  <ProrrogarBotao rodadaId={rodadaId} assembleia={a} fimAtual={fimISO} terminoDaRodada={terminoRodada} />
                )}
                <AtaBotao rodadaId={rodadaId} assembleia={a} ataUrl={ataUrl} />
                {!iniciada && (
                  <Button variant="outline" size="sm" asChild>
                    <Link href={`${hrefRodada(rodadaId, fonte)}#assembleia-${id}`}>
                      <Pencil />
                      Editar na rodada
                    </Link>
                  </Button>
                )}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Votos ao longo do tempo</CardTitle>
            <CardDescription>
              Quantos votaram em cada faixa de horário — mostra quando a base vota, para marcar lembretes. Nunca o
              conteúdo do voto.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {faixas.length === 0 ? (
              <p className="text-muted-foreground py-6 text-center text-sm">Ninguém votou ainda.</p>
            ) : (
              <div className="grid gap-1">
                <div className="flex h-32 items-end gap-0.5">
                  {faixas.map((f) => (
                    <div
                      key={f.inicio}
                      className="bg-primary/80 hover:bg-primary min-w-1 flex-1 rounded-t-sm"
                      style={{ height: `${Math.max(2, (f.votos / maior) * 100)}%` }}
                      title={`${formatarDataHora(f.inicio)}${f.horas > 1 ? ` (+${f.horas} h)` : ""}: ${f.votos} voto(s)`}
                    />
                  ))}
                </div>
                <div className="text-muted-foreground flex justify-between text-[11px]">
                  <span>{formatarDataHora(faixas[0].inicio)}</span>
                  <span>
                    faixas de {faixas[0].horas} h · pico {maior.toLocaleString("pt-BR")}
                  </span>
                  <span>{formatarDataHora(faixas[faixas.length - 1].inicio)}</span>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {entrega && <EntregaCard e={entrega} />}
    </div>
  )
}

// ── Votantes ────────────────────────────────────────────────────────────────

async function AbaVotantes({
  id,
  fonte,
  sp,
  online,
  disponivel,
}: {
  id: string
  fonte: string | null
  sp: Busca
  online: boolean
  disponivel: boolean
}) {
  const situacao = sp.situacao === "faltam" ? "faltam" : "votaram"
  const busca = (sp.busca ?? "").trim()
  const { pagina, porPagina } = lerPaginacao(sp, VOTANTES_PADRAO, "votantes")
  const dados = await votantesDaAssembleia(id, { situacao, busca, pagina, porPagina })
  if (!dados) return null
  const base = hrefAssembleia(id, fonte, "votantes")
  const comFiltro = (s: string) => `${base}${base.includes("?") ? "&" : "?"}situacao=${s}${busca ? `&busca=${encodeURIComponent(busca)}` : ""}`

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="grid gap-1">
            <CardTitle className="text-base">Votantes</CardTitle>
            <CardDescription>Registro de participação — quem votou, por onde e quando. Nunca em quem votou.</CardDescription>
          </div>
          {disponivel && online && (
            <Button variant="outline" size="sm" asChild>
              <a href={`${RAIZ_VOTACOES}/apuracao/${id}/relatorio?tipo=votantes`} target="_blank" rel="noreferrer">
                <FileText />
                Relação em PDF
              </a>
            </Button>
          )}
        </div>
      </CardHeader>
      <CardContent className="grid gap-4">
        <div className="flex flex-wrap items-center gap-2">
          <form action={`${RAIZ_VOTACOES}/assembleias/${id}`} className="flex flex-wrap items-center gap-2">
            <input type="hidden" name="aba" value="votantes" />
            {fonte && <input type="hidden" name="fonte" value={fonte} />}
            <input type="hidden" name="situacao" value={situacao} />
            <input
              type="search"
              name="busca"
              defaultValue={busca}
              placeholder="Nome, CPF ou matrícula"
              className="border-input bg-background h-9 w-64 max-w-full rounded-md border px-3 text-sm shadow-xs outline-none"
            />
            <Button type="submit" variant="outline" size="sm">
              Buscar
            </Button>
          </form>
          <div className="flex gap-1.5">
            <Button variant={situacao === "votaram" ? "default" : "outline"} size="sm" asChild>
              <Link href={comFiltro("votaram")}>
                Votaram
                <Badge variant={situacao === "votaram" ? "secondary" : "outline"} className="ml-1 tabular-nums">
                  {dados.votaram.toLocaleString("pt-BR")}
                </Badge>
              </Link>
            </Button>
            <Button variant={situacao === "faltam" ? "default" : "outline"} size="sm" asChild>
              <Link href={comFiltro("faltam")}>
                Ainda não votaram
                <Badge variant={situacao === "faltam" ? "secondary" : "outline"} className="ml-1 tabular-nums">
                  {dados.faltam.toLocaleString("pt-BR")}
                </Badge>
              </Link>
            </Button>
          </div>
        </div>

        {dados.linhas.length === 0 ? (
          <p className="text-muted-foreground py-8 text-center text-sm">
            <UsersRound className="mx-auto mb-2 size-5" />
            {busca ? "Ninguém encontrado com esta busca." : situacao === "votaram" ? "Ninguém votou ainda." : "Todos já votaram."}
          </p>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Nome</TableHead>
                  <TableHead>CPF</TableHead>
                  <TableHead>Matrícula</TableHead>
                  {situacao === "votaram" ? (
                    <>
                      <TableHead>Por onde</TableHead>
                      <TableHead className="text-right">Quando</TableHead>
                    </>
                  ) : (
                    <>
                      <TableHead>E-mail</TableHead>
                      <TableHead />
                    </>
                  )}
                </TableRow>
              </TableHeader>
              <TableBody>
                {dados.linhas.map((l) => (
                  <TableRow key={l.id}>
                    <TableCell className="max-w-72 truncate">{l.nome ?? "—"}</TableCell>
                    <TableCell className="whitespace-nowrap tabular-nums">{l.cpf ? formatarCnpjCpf(l.cpf) : "—"}</TableCell>
                    <TableCell className="tabular-nums">{l.matricula ?? "—"}</TableCell>
                    {situacao === "votaram" ? (
                      <>
                        <TableCell className="whitespace-nowrap">{l.canal ?? "—"}</TableCell>
                        <TableCell className="text-right whitespace-nowrap">{l.quando ? formatarDataHora(l.quando) : "—"}</TableCell>
                      </>
                    ) : (
                      <>
                        <TableCell className="max-w-64 truncate">{l.email ?? "—"}</TableCell>
                        <TableCell className="text-right">{online && <LinkDeVotoBotao aptoId={l.id} nome={l.nome} />}</TableCell>
                      </>
                    )}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
        <Paginacao
          total={dados.total}
          pagina={dados.pagina}
          totalPaginas={dados.totalPaginas}
          porPagina={porPagina}
          padrao={VOTANTES_PADRAO}
          prefixo="votantes"
        />
      </CardContent>
    </Card>
  )
}

// ── Urnas e apuração ───────────────────────────────────────────────────────

async function AbaUrnas({ id, hrefApuracao }: { id: string; hrefApuracao: string }) {
  const [dados, acomp] = await Promise.all([dadosUrnasAssembleia(id), acompanhamentoAssembleia(id)])
  if (!dados) return null
  return <ConteudoUrnas dados={dados} acomp={acomp} hrefApuracao={hrefApuracao} />
}

async function AbaApuracao({ id, apuracao }: { id: string; apuracao: NonNullable<Awaited<ReturnType<typeof dadosApuracao>>> }) {
  const [acomp, integridade] = await Promise.all([acompanhamentoAssembleia(id), integridadeDaApuracao(id)])
  return <ConteudoApuracao dados={apuracao} emSeparado={acomp?.emSeparado ?? []} integridade={integridade} />
}

// ── Miúdos ─────────────────────────────────────────────────────────────────

function Indicador({ rotulo, children }: { rotulo: string; children: React.ReactNode }) {
  return (
    <div className="grid min-w-0 content-start gap-1">
      <p className="text-muted-foreground text-xs">{rotulo}</p>
      {children}
    </div>
  )
}

function Numero({ valor }: { valor: number }) {
  return <span className="text-xl leading-none font-semibold tabular-nums">{valor.toLocaleString("pt-BR")}</span>
}

function Campo({ rotulo, children }: { rotulo: string; children: React.ReactNode }) {
  return (
    <div className="grid gap-0.5">
      <p className="text-muted-foreground text-xs">{rotulo}</p>
      <div>{children}</div>
    </div>
  )
}
