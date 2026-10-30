import type { Metadata } from "next"
import Link from "next/link"
import { notFound } from "next/navigation"
import { ArrowLeft, BarChart3, Download, ExternalLink, FileUp, Pencil, Plus } from "lucide-react"

import { TileIndicador } from "@/components/graficos/tile"
import { GrupoColapsavel } from "@/components/grupo-colapsavel"
import { RotuloTrilha } from "@/components/layout/trilha-rotulos"
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { Paginacao } from "@/components/paginacao"
import { requirePermissao } from "@/lib/auth"
import {
  buscarRemessaPonto,
  funcionariosParaSelecao,
  registrosDaRemessaPonto,
  urlArquivoPessoal,
} from "@/lib/db/pessoal"
import { formatarData } from "@/lib/formato"
import { carregarBasePonto, competenciaDaRemessa, indicadoresDe, saldosAnterioresPonto } from "@/lib/db/ponto-analise"
import { posterioresPorFuncionario } from "@/lib/db/ponto-cascata"
import { faixasHoraExtra } from "@/lib/db/ponto-config"
import { isentosNaCompetencia, periodoIsencao } from "@/lib/db/ponto-isencoes"
import { decimalHoras, hhmm } from "@/lib/horas"
import { espelhosPendentes } from "@/lib/db/ponto-marcacoes"
import { obterResenha } from "@/lib/db/ponto-resenha"
import { lerPaginacao, paginar } from "@/lib/paginacao"

import { LerEspelhosBotao } from "../analise/botoes"
import { CartaoResenha, PainelIndicadores } from "../analise/componentes"
import { RemessaPontoForm } from "../remessa-form"
import { ExcluirRegistroBotao, RegistroPontoForm } from "./registro-itens"

export const metadata: Metadata = {
  title: "Remessa de controle de ponto — Confluir",
}
// Leitura dos espelhos e resenha da IA podem levar alguns minutos.
export const maxDuration = 300

const horas = (v: number | null) => hhmm(v)

export default async function RemessaPontoPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{
    salvo?: string
    editar?: string
    pagina?: string
    porPagina?: string
    aba?: string
    novo?: string
    /** Remessas posteriores recalculadas ao salvar (nomes separados por |). */
    recalculadas?: string
    parada?: string
    erro_cascata?: string
  }>
}) {
  await requirePermissao("pessoal_gestao")

  const { id } = await params
  const paramsBusca = await searchParams
  const { salvo, editar, recalculadas, parada } = paramsBusca
  const naAnalise = paramsBusca.aba === "indicadores"
  const [remessa, itens, funcionarios, saldosAnteriores, faixas, posteriores] = await Promise.all([
    buscarRemessaPonto(id),
    registrosDaRemessaPonto(id),
    funcionariosParaSelecao(),
    saldosAnterioresPonto(id),
    faixasHoraExtra(),
    posterioresPorFuncionario(id),
  ])
  if (!remessa) notFound()
  const isencoes = await isentosNaCompetencia(competenciaDaRemessa(remessa))

  // Página concorrida (cabeçalho + formulário): 10 registros por página.
  const paginacao = lerPaginacao(paramsBusca, 10)
  const paginaAtual = paginar(itens, paginacao)

  const urls = new Map<string, string | null>()
  for (const i of paginaAtual.linhas) {
    urls.set(i.id, await urlArquivoPessoal(i.arquivo))
  }

  const editandoRemessa = editar === "remessa"
  const registroEmEdicao = editar
    ? (itens.find((i) => i.id === editar) ?? null)
    : null

  const jaTem = new Set(itens.map((i) => i.funcionario_id))
  const disponiveis = funcionarios.filter((f) => !jaTem.has(f.usuarioId))
  // Pendência = ativo sem registro e sem isenção no mês inteiro da remessa.
  const pendentes = disponiveis.filter((f) => !isencoes.inteiro.has(f.usuarioId))
  const isentos = disponiveis.filter((f) => isencoes.inteiro.has(f.usuarioId))

  // Remessa finalizada: sem inclusão, edição ou exclusão de registros.
  const bloqueada = remessa.finalizada === true
  // Formulário fechado por padrão: abre pelo botão "Novo registro" no topo
  // (?novo=1) ou pelo "Editar" da linha (?editar=<id>).
  const formAberto = !bloqueada && (paramsBusca.novo === "1" || registroEmEdicao !== null)

  // Indicadores da remessa (sobre todos os registros, não só a página).
  const soma = (campo: keyof (typeof itens)[number]) =>
    itens.reduce((s, i) => s + (typeof i[campo] === "number" ? (i[campo] as number) : 0), 0)
  const real70 = soma("horas_realizadas_70")
  const real100 = soma("horas_realizadas_100")
  const pag70 = soma("horas_pagas_70")
  const pag100 = soma("horas_pagas_100")
  const sal70 = soma("saldo_remanescente_70")
  const sal100 = soma("saldo_remanescente_100")
  const liberados = itens.filter((i) => i.liberado === true).length
  const semEspelho = itens.filter((i) => !i.arquivo).length
  const comPagas = itens.filter((i) => (i.horas_pagas_70 ?? 0) + (i.horas_pagas_100 ?? 0) > 0).length

  return (
    <>
      <RotuloTrilha valores={{ [id]: remessa.nome_remessa ?? "(sem nome)" }} />
      <div>
        <Button variant="ghost" size="sm" asChild className="-ml-2 mb-3">
          <Link href="/painel/pessoal/ponto">
            <ArrowLeft />
            Remessas de controle de ponto
          </Link>
        </Button>
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="flex flex-wrap items-center gap-3">
              <h1 className="text-2xl font-semibold tracking-tight">
                {remessa.nome_remessa ?? "(sem nome)"}
              </h1>
              {remessa.finalizada === true ? (
                <Badge variant="outline" className="text-muted-foreground">
                  Finalizada
                </Badge>
              ) : (
                <Badge
                  variant="outline"
                  className="border-success/40 text-success-fg"
                >
                  Aberta
                </Badge>
              )}
            </div>
            <p className="text-muted-foreground mt-1 text-xs">
              {itens.length} registro{itens.length === 1 ? "" : "s"} de ponto ·
              criada em {formatarData(remessa.created_at)}
            </p>
          </div>
          {!editandoRemessa && (
            <div className="flex flex-wrap gap-2">
              {!bloqueada && !naAnalise && (
                <Button asChild>
                  <Link href={`/painel/pessoal/ponto/${id}?novo=1`}>
                    <Plus />
                    Novo registro
                  </Link>
                </Button>
              )}
              {!bloqueada && !naAnalise && (
                <Button variant="outline" asChild>
                  <Link href={`/painel/pessoal/ponto/${id}/importar`}>
                    <FileUp />
                    Importar relatório
                  </Link>
                </Button>
              )}
              <Button variant="outline" asChild>
                <a href={`/painel/pessoal/ponto/${id}/csv`}>
                  <Download />
                  Exportar planilha
                </a>
              </Button>
              <Button variant="outline" asChild>
                <Link href={`/painel/pessoal/ponto/${id}?editar=remessa`}>
                  <Pencil />
                  Editar remessa
                </Link>
              </Button>
            </div>
          )}
        </div>
      </div>

      {salvo === "1" && (
        <Alert className="border-success/40 text-success-fg">
          <AlertDescription>
            Salvo com sucesso.
            {recalculadas !== undefined &&
              (recalculadas
                ? ` Saldos recalculados nas remessas posteriores: ${recalculadas.split("|").join(", ")}.`
                : " Nenhuma remessa posterior foi recalculada.")}
            {parada && ` ${parada} está finalizada: ela e as seguintes ficaram como estavam.`}
          </AlertDescription>
        </Alert>
      )}
      {paramsBusca.erro_cascata && (
        <Alert variant="destructive">
          <AlertDescription>
            O registro foi salvo, mas o recálculo das remessas posteriores falhou: {paramsBusca.erro_cascata}
          </AlertDescription>
        </Alert>
      )}

      {!editandoRemessa && (
        <nav className="flex gap-1 border-b text-sm" aria-label="Abas da remessa">
          {[
            { href: `/painel/pessoal/ponto/${id}`, rotulo: "Registros", ativo: !naAnalise },
            { href: `/painel/pessoal/ponto/${id}?aba=indicadores`, rotulo: "Indicadores e resenha", ativo: naAnalise },
          ].map((a) => (
            <Link scroll={false}
              key={a.rotulo}
              href={a.href}
              className={`-mb-px border-b-2 px-3 py-2 ${a.ativo ? "border-primary font-medium" : "text-muted-foreground hover:text-foreground border-transparent"}`}
            >
              {a.rotulo}
            </Link>
          ))}
        </nav>
      )}

      {editandoRemessa ? (
        <RemessaPontoForm remessa={remessa} />
      ) : naAnalise ? (
        <AnaliseDaRemessa remessaId={id} />
      ) : (
        <>
          {formAberto && (
            <RegistroPontoForm
              key={registroEmEdicao?.id ?? "novo"}
              saldosAnteriores={saldosAnteriores}
              faixas={faixas}
              posteriores={posteriores}
              remessaId={id}
              funcionarios={disponiveis}
              registro={registroEmEdicao ?? undefined}
            />
          )}

          <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
            <TileIndicador
              rotulo="Registros"
              valor={`${itens.length}`}
              nota={
                (pendentes.length > 0
                  ? `${pendentes.length} funcionário(s) ativo(s) sem registro`
                  : "todos os funcionários ativos lançados") +
                (isentos.length > 0 ? ` · ${isentos.length} isento(s) de registro` : "")
              }
            />
            <TileIndicador
              rotulo="Liberados ao funcionário"
              valor={`${liberados} de ${itens.length}`}
              nota={semEspelho > 0 ? `${semEspelho} sem espelho anexado` : "todos com espelho"}
            />
            <TileIndicador
              rotulo="Horas extras realizadas"
              valor={hhmm(real70 + real100)}
              nota={`${hhmm(real70)} a ${faixas["70"]} · ${hhmm(real100)} a ${faixas["100"]}`}
            />
            <TileIndicador
              rotulo="Horas pagas no mês"
              valor={hhmm(pag70 + pag100)}
              nota={`decimal: ${decimalHoras(pag70)} a ${faixas["70"]} · ${decimalHoras(pag100)} a ${faixas["100"]} · ${comPagas} funcionário(s)`}
            />
            <TileIndicador
              rotulo="Saldo remanescente"
              valor={hhmm(sal70 + sal100)}
              nota={`${hhmm(sal70)} a ${faixas["70"]} · ${hhmm(sal100)} a ${faixas["100"]}`}
            />
          </section>

          {!bloqueada && pendentes.length > 0 && (
            <GrupoColapsavel
              titulo="Funcionários ativos sem registro nesta remessa"
              resumo={<Badge variant="warning">{pendentes.length}</Badge>}
            >
              <ul className="text-muted-foreground grid gap-1 px-6 pb-4 text-sm sm:grid-cols-2 lg:grid-cols-3">
                {pendentes.map((f) => {
                  const parcial = isencoes.parcial.get(f.usuarioId)
                  return (
                    <li key={f.usuarioId}>
                      {f.nome}
                      {parcial && (
                        <span className="block text-xs">isento em parte do mês: {periodoIsencao(parcial)}</span>
                      )}
                    </li>
                  )
                })}
              </ul>
            </GrupoColapsavel>
          )}

          {isentos.length > 0 && (
            <GrupoColapsavel
              titulo="Isentos de registro de ponto nesta competência"
              descricao="Não contam como pendência. As isenções ficam na aba Isenções do Controle de ponto."
              resumo={<Badge variant="outline">{isentos.length}</Badge>}
            >
              <ul className="grid gap-2 px-6 pb-4 text-sm">
                {isentos.map((f) => {
                  const i = isencoes.inteiro.get(f.usuarioId)!
                  return (
                    <li key={f.usuarioId}>
                      <Link href={`/painel/pessoal/ponto/funcionario/${f.usuarioId}`} className="font-medium hover:underline">
                        {f.nome}
                      </Link>
                      <span className="text-muted-foreground"> · {periodoIsencao(i)} · {i.justificativa}</span>
                    </li>
                  )
                })}
              </ul>
            </GrupoColapsavel>
          )}

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Registros de ponto</CardTitle>
              <CardDescription>
                Horas extras a {faixas["70"]} e a {faixas["100"]} por funcionário, em horas e minutos (as pagas
                também em decimal, que vai à contabilidade); registros liberados
                ficam visíveis ao funcionário.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto rounded-lg border">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-muted/50">
                      <TableHead>Funcionário</TableHead>
                      <TableHead className="text-right">Realiz. {faixas["70"]}</TableHead>
                      <TableHead className="text-right">Pagas {faixas["70"]}</TableHead>
                      <TableHead className="text-right">Saldo {faixas["70"]}</TableHead>
                      <TableHead className="text-right">Realiz. {faixas["100"]}</TableHead>
                      <TableHead className="text-right">Pagas {faixas["100"]}</TableHead>
                      <TableHead className="text-right">Saldo {faixas["100"]}</TableHead>
                      <TableHead>Espelho</TableHead>
                      <TableHead>Situação</TableHead>
                      <TableHead className="text-right">Ações</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {paginaAtual.total === 0 && (
                      <TableRow>
                        <TableCell
                          colSpan={10}
                          className="text-muted-foreground h-20 text-center text-sm"
                        >
                          Nenhum registro nesta remessa.
                        </TableCell>
                      </TableRow>
                    )}
                    {paginaAtual.linhas.map((i) => (
                      <TableRow key={i.id}>
                        <TableCell className="max-w-52 truncate font-medium">
                          {i.funcionario_id ? (
                            <Link
                              href={`/painel/pessoal/ponto/funcionario/${i.funcionario_id}/${i.id}?de=remessa`}
                              className="hover:underline"
                            >
                              {i.funcionarioNome ?? "(sem nome)"}
                            </Link>
                          ) : (
                            (i.funcionarioNome ?? "(sem funcionário)")
                          )}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {horas(i.horas_realizadas_70)}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {horas(i.horas_pagas_70)}
                          {i.horas_pagas_70 !== null && (
                            <span className="text-muted-foreground block text-xs">{decimalHoras(i.horas_pagas_70)}</span>
                          )}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {horas(i.saldo_remanescente_70)}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {horas(i.horas_realizadas_100)}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {horas(i.horas_pagas_100)}
                          {i.horas_pagas_100 !== null && (
                            <span className="text-muted-foreground block text-xs">{decimalHoras(i.horas_pagas_100)}</span>
                          )}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {horas(i.saldo_remanescente_100)}
                        </TableCell>
                        <TableCell>
                          {urls.get(i.id) ? (
                            <a
                              href={urls.get(i.id)!}
                              target="_blank"
                              rel="noreferrer"
                              className="text-foreground inline-flex items-center gap-1 text-xs underline-offset-4 hover:underline"
                            >
                              Abrir <ExternalLink className="size-3" />
                            </a>
                          ) : (
                            <span className="text-muted-foreground text-xs">—</span>
                          )}
                        </TableCell>
                        <TableCell>
                          {i.liberado === true ? (
                            <Badge
                              variant="outline"
                              className="border-success/40 text-success-fg"
                            >
                              Liberado
                            </Badge>
                          ) : (
                            <Badge variant="outline" className="text-muted-foreground">
                              Bloqueado
                            </Badge>
                          )}
                        </TableCell>
                        <TableCell>
                          {bloqueada ? (
                            <span className="text-muted-foreground block text-right text-xs">
                              —
                            </span>
                          ) : (
                            <div className="flex items-center justify-end gap-1">
                              <Button
                                variant="ghost"
                                size="sm"
                                asChild
                                className="h-7 px-2"
                              >
                                <Link
                                  href={`/painel/pessoal/ponto/${id}?editar=${i.id}`}
                                >
                                  Editar
                                </Link>
                              </Button>
                              <ExcluirRegistroBotao id={i.id} remessaId={id} liberado={i.liberado === true} funcionario={i.funcionarioNome} />
                            </div>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>

              <div className="mt-4">
                <Paginacao
                  total={paginaAtual.total}
                  pagina={paginaAtual.pagina}
                  totalPaginas={paginaAtual.totalPaginas}
                  porPagina={paginacao.porPagina}
                  padrao={10}
                />
              </div>
            </CardContent>
          </Card>

          {bloqueada && (
            <Alert>
              <AlertDescription>
                Remessa finalizada: inclusão, edição e exclusão de registros
                estão bloqueadas. Para mexer nos itens, reabra a remessa em
                Editar remessa.
              </AlertDescription>
            </Alert>
          )}
        </>
      )}
    </>
  )
}

async function AnaliseDaRemessa({ remessaId }: { remessaId: string }) {
  const [base, pendentes, { disponivel, resenha }] = await Promise.all([
    carregarBasePonto(),
    espelhosPendentes(remessaId),
    obterResenha("remessa", remessaId),
  ])
  const ind = indicadoresDe(base, { escopo: "remessa", remessaId })
  const ano = base.remessas.find((r) => r.id === remessaId)?.competencia.slice(0, 4)
  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-3">
        {pendentes !== null && pendentes > 0 ? (
          <LerEspelhosBotao remessaId={remessaId} pendentes={pendentes} />
        ) : (
          <span className="text-muted-foreground text-xs">
            {pendentes === null
              ? "Rode supabase/ponto-analise.sql para ler as marcações dos espelhos."
              : "Espelhos desta remessa já processados."}
          </span>
        )}
        {ano && (
          <Button variant="outline" asChild>
            <Link href={`/painel/pessoal/ponto/analise?ano=${ano}`}>
              <BarChart3 />
              Indicadores do ano
            </Link>
          </Button>
        )}
      </div>
      <PainelIndicadores ind={ind} hrefDepartamento={ano ? (d) => `/painel/pessoal/ponto/analise?ano=${ano}&departamento=${encodeURIComponent(d)}` : undefined} />
      <CartaoResenha disponivel={disponivel} resenha={resenha} escopo="remessa" remessaId={remessaId} />
    </>
  )
}
