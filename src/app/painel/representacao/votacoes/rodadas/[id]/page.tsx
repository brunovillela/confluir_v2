import type { Metadata } from "next"
import Link from "next/link"
import { notFound } from "next/navigation"
import { Eye, UsersRound } from "lucide-react"

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
  temVotoOnline,
} from "@/lib/assembleias-constantes"
import { requirePermissao } from "@/lib/auth"
import { iniciarVisualizacaoEleitor } from "@/lib/actions/visualizacao-eleitor"
import {
  contarAptosPorVoto,
  type FiltroLinkApto,
  listarAptos,
  listarAssembleiasDaRodada,
  listarRodadasDaCampanha,
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
import { semLinkDasRodadas } from "@/lib/db/votacao-sem-link"
import { avisoAutoDaRodada } from "@/lib/db/votacao-aviso-auto"
import { aptosDuplicados } from "@/lib/db/aptos-duplicados"
import { formatarCnpjCpf, formatarData, formatarDataHora } from "@/lib/formato"
import { lerPaginacao } from "@/lib/paginacao"

import {
  EditarEleitorBotao,
  ExclusaoEmMassaAptos,
  ImportarAptos,
  MarcarTodosAptos,
  NovoEleitorBotao,
  RemoverAptoBotao,
} from "./aptos"
import { AssembleiasDaRodada, type JanelaItem } from "./assembleias-rodada"
import { AvisoAptos } from "./aviso-aptos"
import { DuplicadosAptos } from "./duplicados-aptos"
import { LinkDeVotoBotao } from "./link-voto"
import { Perguntas } from "./perguntas"
import { linkUnicoVotacao } from "../../actions"
import { AbasVotacao, SetasIrmaos, SituacaoRodadaBadge, VoltarNivel } from "../../navegacao"
import { situacaoDaRodada } from "@/lib/db/votacao-panorama"
import { TrilhaVotacoes } from "../../trilha"
import { caminhoVotacao } from "@/lib/db/votacao-caminho"
import { hrefCampanha, hrefRodada } from "@/lib/votacao-navegacao"
import { RodadaForm } from "./rodada-form"
import { SemLinkAlerta } from "./sem-link-alerta"

export const metadata: Metadata = { title: "Rodada de assembleias — Confluir" }

const INPUT_FILTRO =
  "border-input bg-background text-foreground h-9 rounded-md border px-3 text-sm shadow-xs outline-none"

type Params = {
  aba?: string
  fonte?: string
  busca?: string
  votou?: string
  link?: string
  aptosPagina?: string
  aptosPorPagina?: string
  criada?: string
}

const ABAS = ["geral", "aptos", "perguntas", "divulgacao"] as const
type ChaveAba = (typeof ABAS)[number]

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
  // Situação do link pessoal (plano de 16/10/2026): exclui o filtro de voto.
  const link = (["sem_link", "sem_email", "falha", "duplicado"] as const).find((v) => v === brutos.link) as
    | FiltroLinkApto
    | undefined
  const { pagina, porPagina } = lerPaginacao(brutos, APTOS_PADRAO, "aptos")

  const rodada = await obterRodada(id)
  if (!rodada) notFound()
  const caminho = await caminhoVotacao({ rodadaId: id, fonteId: brutos.fonte })
  const fonte = caminho.fonte?.id ?? null
  // Filtro de aptos sem aba (links antigos "?link=sem_link") abre a aba Aptos.
  const aba: ChaveAba = (ABAS as readonly string[]).includes(brutos.aba ?? "")
    ? (brutos.aba as ChaveAba)
    : brutos.link || brutos.votou || brutos.busca || brutos.aptosPagina
      ? "aptos"
      : "geral"

  const [perguntas, assembleias, aptos, contagemAptos, editalUrl, cardUrl, aviso, semLink, avisoAuto, duplicados] =
    await Promise.all([
      listarPerguntas(id),
      listarAssembleiasDaRodada(id),
      listarAptos(id, { busca, pagina, porPagina, votou: link ? undefined : votou, link }),
      contarAptosPorVoto(id),
      urlArquivoAssembleias(rodada.edital_url),
      urlArquivoAssembleias(rodada.card_grafico_url),
      resumoAvisoAptos(id),
      semLinkDasRodadas({ rodadaIds: [id] }).then((l) => l[0] ?? null),
      avisoAutoDaRodada(id),
      aptosDuplicados(id),
    ])
  const temOnline = assembleias.linhas.some((a) => temVotoOnline(a.modalidade))
  // O link pessoal só importa enquanto a rodada não terminou.
  const linkImporta = temOnline && !periodoTerminado(rodada.termino)

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

  // Abas (reorganização de 17/10/2026): o endereço guarda a aba.
  const href = (chave: ChaveAba) => hrefRodada(rodada.id, fonte, chave === "geral" ? undefined : chave)
  const abas = [
    { chave: "geral", rotulo: "Visão geral", href: href("geral"), contagem: assembleias.linhas.length },
    {
      chave: "aptos",
      rotulo: "Aptos",
      href: href("aptos"),
      contagem: contagemAptos.total,
      alerta: Boolean(semLink) || duplicados.length > 0,
    },
    { chave: "perguntas", rotulo: "Perguntas", href: href("perguntas"), contagem: perguntas.length },
    { chave: "divulgacao", rotulo: "Divulgação", href: href("divulgacao") },
  ]
  const irmas = rodada.campanha_id ? await listarRodadasDaCampanha(rodada.campanha_id).catch(() => []) : []
  const ordem = [...irmas].sort((x, y) => (x.inicio ?? "").localeCompare(y.inicio ?? "") || (x.nome ?? "").localeCompare(y.nome ?? ""))
  const pos = ordem.findIndex((r) => r.id === rodada.id)
  const irma = (r: (typeof ordem)[number] | undefined) =>
    r ? { href: hrefRodada(r.id, fonte, aba === "geral" ? undefined : aba), rotulo: r.nome ?? "Rodada" } : null

  return (
    <>
      <TrilhaVotacoes caminho={caminho} />
      <div className="grid gap-3">
        {caminho.campanha && (
          <VoltarNivel href={hrefCampanha(caminho.campanha.id, fonte)} rotulo={caminho.campanha.nome ?? "Campanha"} />
        )}
        <div className="flex flex-wrap items-center gap-3">
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="truncate text-2xl font-semibold tracking-tight">
                {rodada.nome ?? "(sem nome)"}
              </h1>
              <SituacaoRodadaBadge
                situacao={situacaoDaRodada(
                  assembleias.linhas.map((a) => ({
                    situacao: janelas[a.id]?.situacao ?? "antes",
                    apuracaoEncerrada: a.apuracao_encerrada,
                  }))
                )}
              />
            </div>
            <p className="text-muted-foreground mt-1 text-xs">
              {[caminho.fonte?.nome, rodada.campanhaTema ?? "Sem campanha vinculada"].filter(Boolean).join(" · ")}
              {rodada.codigo ? ` · código ${rodada.codigo}` : ""}
            </p>
          </div>
          <SetasIrmaos anterior={pos > 0 ? irma(ordem[pos - 1]) : null} proximo={pos >= 0 ? irma(ordem[pos + 1]) : null} />
          {/* Link geral: /votar mostra todas as votações online abertas e as
              próximas — o mesmo do cartão da página Votações. */}
          <div title="Página única com todas as votações online abertas e as próximas">
            <CopiarLinkBotao obterLink={linkUnicoVotacao} rotulo="Copiar link geral" />
          </div>
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

      {semLink && <SemLinkAlerta rodadaId={rodada.id} fonte={fonte} r={semLink} />}

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

      <AbasVotacao abas={abas} ativa={aba} />

      {aba === "geral" && (
        <div className="grid gap-4">
          {duplicados.length > 0 && (
            <Alert variant="warning">
              <AlertDescription>
                {duplicados.length} {duplicados.length === 1 ? "pessoa aparece" : "pessoas aparecem"} mais de uma vez na
                lista de aptos.{" "}
                <Link href={href("aptos")} className="font-medium underline underline-offset-4">
                  Ver e unificar
                </Link>
              </AlertDescription>
            </Alert>
          )}
        <AssembleiasDaRodada
          rodadaId={rodada.id}
          assembleias={assembleias.linhas}
          esquemaPronto={assembleias.esquemaPronto}
          editavel={motivoAssembleias === null}
          motivoBloqueio={motivoAssembleias}
          janelas={janelas}
          atas={atas}
          terminoDaRodada={rodada.termino}
          fonte={fonte}
        />
        </div>
      )}

      {aba === "aptos" && (
      <Card id="aptos" className="scroll-mt-4">
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
              <input type="hidden" name="aba" value="aptos" />
              {fonte && <input type="hidden" name="fonte" value={fonte} />}
              {votou && !link && <input type="hidden" name="votou" value={votou} />}
              {link && <input type="hidden" name="link" value={link} />}
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
                ativo={!votou && !link}
                href={hrefFiltro({ busca, porPagina, fonte })}
                contagem={contagemAptos.total}
              />
              <FiltroVotou
                rotulo="Já votou"
                ativo={votou === "sim" && !link}
                href={hrefFiltro({ busca, votou: "sim", porPagina, fonte })}
                contagem={contagemAptos.votaram}
              />
              <FiltroVotou
                rotulo="Não votou"
                ativo={votou === "nao" && !link}
                href={hrefFiltro({ busca, votou: "nao", porPagina, fonte })}
                contagem={contagemAptos.ausentes}
              />
            </div>
          </div>

          {/* Link pessoal de voto: quem ficou sem ele depende do código por
              e-mail (plano de 16/10/2026). */}
          {linkImporta && aviso.esquemaPronto && (
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="text-muted-foreground mr-1 text-xs">Link pessoal:</span>
              {(semLink || link === "sem_link") && (
                <FiltroVotou
                  rotulo="Sem link"
                  ativo={link === "sem_link"}
                  href={hrefFiltro({ busca, link: "sem_link", porPagina, fonte })}
                  contagem={semLink?.semLink ?? 0}
                />
              )}
              {[
                { chave: "sem_email" as const, rotulo: "Sem e-mail", n: aviso.semEmail },
                { chave: "falha" as const, rotulo: "Falha no envio", n: aviso.falhas },
                { chave: "duplicado" as const, rotulo: "E-mail repetido", n: aviso.duplicados },
              ]
                .filter((f) => f.n > 0 || link === f.chave)
                .map((f) => (
                  <FiltroVotou
                    key={f.chave}
                    rotulo={f.rotulo}
                    ativo={link === f.chave}
                    href={hrefFiltro({ busca, link: f.chave, porPagina, fonte })}
                    contagem={f.n}
                  />
                ))}
              {!semLink && aviso.semEmail + aviso.falhas + aviso.duplicados === 0 && link !== "sem_link" && (
                <span className="text-success-fg text-xs">todos os que ainda não votaram têm o link.</span>
              )}
            </div>
          )}

          <DuplicadosAptos rodadaId={rodada.id} grupos={duplicados} />

          {contagemAptos.total > 0 && (
            <ExclusaoEmMassaAptos
              rodadaId={rodada.id}
              naoVotaram={contagemAptos.ausentes}
            />
          )}

          {aptos.linhas.length === 0 ? (
            <p className="text-muted-foreground py-8 text-center text-sm">
              <UsersRound className="mx-auto mb-2 size-5" />
              {busca || votou || link
                ? "Nenhum eleitor encontrado com estes filtros."
                : "Nenhum eleitor cadastrado nesta rodada ainda."}
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-8">
                    <MarcarTodosAptos rodadaId={rodada.id} />
                  </TableHead>
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
                    <TableCell className="w-8">
                      {/* Caixa ligada ao formulário da exclusão em massa. */}
                      <input
                        type="checkbox"
                        name="apto_ids"
                        value={a.id}
                        form={`exclusao-aptos-${rodada.id}`}
                        disabled={a.hora_voto !== null}
                        className="size-4"
                        aria-label={`Marcar ${a.nome_completo ?? "apto"}`}
                        title={a.hora_voto ? "Já votou — não pode ser removido" : undefined}
                      />
                    </TableCell>
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
                      {linkImporta && !a.hora_voto && <SituacaoLink apto={a} />}
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
      )}

      {aba === "perguntas" && (
      <Perguntas
        rodadaId={rodada.id}
        perguntas={perguntas}
        editavel={motivoPerguntas === null}
        motivoBloqueio={motivoPerguntas}
      />
      )}

      {aba === "divulgacao" && (
        <div className="grid items-start gap-4 xl:grid-cols-2">
        <AvisoAptos
          id="aviso-aptos"
          rodadaId={rodada.id}
          resumo={aviso}
          auto={temOnline ? avisoAuto : null}
          bloqueio={
            periodoTerminado(rodada.termino)
              ? "O período desta rodada já terminou."
              : assembleias.linhas.length === 0
                ? "Cadastre ao menos uma assembleia antes de avisar os aptos — o e-mail diz onde e como votar."
                : null
          }
        />
        <RodadaForm rodada={rodada} editalUrl={editalUrl} cardUrl={cardUrl} />
        </div>
      )}
    </>
  )
}

/** Monta o href de um filtro de voto preservando busca/porPagina (volta à página 1). */
function hrefFiltro({
  busca,
  votou,
  link,
  porPagina,
  fonte,
}: {
  busca: string
  votou?: "sim" | "nao"
  link?: FiltroLinkApto
  porPagina: number
  fonte?: string | null
}): string {
  const q = new URLSearchParams()
  q.set("aba", "aptos")
  if (fonte) q.set("fonte", fonte)
  if (busca) q.set("busca", busca)
  if (votou) q.set("votou", votou)
  if (link) q.set("link", link)
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

/** Selo do link pessoal na linha do apto que ainda não votou (só o que falta). */
function SituacaoLink({
  apto,
}: {
  apto: { aviso_email_em?: string | null; aviso_email_erro?: string | null }
}) {
  const rotulo =
    apto.aviso_email_erro === "sem_email"
      ? "Sem e-mail"
      : apto.aviso_email_erro === "falha"
        ? "Falha no envio"
        : !apto.aviso_email_em
          ? "Link não enviado"
          : null
  if (!rotulo) return null
  return (
    <Badge
      variant="outline"
      className="border-warning/40 text-warning-fg ml-1.5"
      title="Sem o link pessoal, a pessoa depende do código por e-mail. Use o botão de link de voto para mandar por outro canal."
    >
      {rotulo}
    </Badge>
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
