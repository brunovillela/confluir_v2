import type { Metadata } from "next"
import Link from "next/link"
import { notFound } from "next/navigation"
import { ArrowLeft, Building2, ExternalLink, FileDown, Plus, UserMinus, UserPlus } from "lucide-react"

import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { requirePermissao } from "@/lib/auth"
import { comunicacoesDaEmpresa, pendenciasDeDesconto } from "@/lib/db/desconto-comunicacoes"
import {
  contatosDaFolha,
  eventosDaEmpresa,
  quadroRepasse,
  regrasRepasse,
  tiposControlados,
  unidadeRepasse,
} from "@/lib/db/repasse"
import { formatarData, formatarDataHora, formatarMoeda } from "@/lib/formato"
import {
  competenciaValida,
  diasDeAtraso,
  ehTipoContribuicao,
  regraEfetiva,
  ROTULO_EVENTO,
  ROTULO_SITUACAO,
  rotuloCompetencia,
  rotuloMeio,
  rotuloCurto,
  rotuloMeses,
  SITUACOES_COBRAR,
  SITUACOES_CONFERIR,
  TIPOS_CONTRIBUICAO,
  type TipoContribuicao,
} from "@/lib/repasse"
import { cn } from "@/lib/utils"

import { AcoesCompetencia, ComunicarDesconto, ContatosFolha, DesfazerEvento } from "../formularios"
import { CelulaSituacao, SeloSituacao } from "../situacao"

export const metadata: Metadata = { title: "Controle de envio da empresa — Confluir" }

export default async function ControleEmpresaPage({
  params,
  searchParams,
}: {
  params: Promise<{ empresaId: string }>
  searchParams: Promise<{ tipo?: string; c?: string }>
}) {
  await requirePermissao("filiacao_receitas", ["filiacao_gestao"])
  const { empresaId } = await params
  const p = await searchParams
  const unidade = await unidadeRepasse(empresaId)
  if (!unidade) notFound()
  const [regras, contatos, eventos, pendencias] = await Promise.all([
    regrasRepasse(),
    contatosDaFolha(unidade.id),
    eventosDaEmpresa(unidade.id),
    pendenciasDeDesconto(unidade.id),
  ])
  const daEmpresa = regras.porEmpresa.get(unidade.id) ?? {}
  const tipos = TIPOS_CONTRIBUICAO.filter((t) => tiposControlados(regras).includes(t) || daEmpresa[t])
  const tipo: TipoContribuicao = ehTipoContribuicao(p.tipo) ? p.tipo : (tipos[0] ?? "Associativa")
  const [quadro, comunicacoes] = await Promise.all([
    quadroRepasse({ tipo, empresaId: unidade.id }),
    comunicacoesDaEmpresa(unidade.id, unidade.fontes),
  ])
  const linha = quadro.linhas[0]
  const regra = linha?.regra ?? regraEfetiva(tipo, regras.geral[tipo], daEmpresa[tipo])
  const celulas = linha?.celulas ?? []
  const pedida = Number(p.c)
  // Sem competência escolhida: a mais recente que pede ação, ou a última.
  const selecionada =
    celulas.find((c) => competenciaValida(pedida) && c.competencia === pedida) ??
    [...celulas].reverse().find((c) => SITUACOES_COBRAR.includes(c.situacao) || SITUACOES_CONFERIR.includes(c.situacao)) ??
    celulas.at(-1)
  const eventosDoTipo = eventos.filter((e) => e.tipo === tipo)
  const hrefReceitas = (remessaId: string) =>
    unidade.grupo
      ? `/painel/filiados/receitas/${remessaId}/grupo/${unidade.grupo.id}`
      : `/painel/filiados/receitas/${remessaId}/${unidade.id}`
  const contatosCliente = contatos.map((c) => ({ ...c }))
  const inclusoes = pendencias.itens.filter((i) => i.acao === "inclusao").length
  const exclusoes = pendencias.itens.length - inclusoes

  return (
    <>
      <div>
        <Button variant="ghost" size="sm" asChild className="-ml-2 mb-3">
          <Link href={`/painel/filiados/receitas/controle${tipo !== "Associativa" ? `?tipo=${tipo}` : ""}`}>
            <ArrowLeft />
            Controle de envio
          </Link>
        </Button>
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">{unidade.nome}</h1>
            <p className="text-muted-foreground mt-1 text-sm">
              {unidade.filiadosAtivos} filiado(s) ativo(s)
              {unidade.grupo && ` · paga pelo grupo ${unidade.grupo.nome} (${unidade.fontes.length} empresas)`}
            </p>
          </div>
          <Button variant="outline" asChild>
            <Link href={`/painel/representacao/empregadores/${unidade.id}?aba=arrecadacao`}>
              <Building2 />
              Ver o empregador
            </Link>
          </Button>
        </div>
      </div>

      {tipos.length > 1 && (
        <div className="bg-muted flex w-fit rounded-md p-0.5">
          {tipos.map((t) => (
            <Link
              key={t}
              href={`/painel/filiados/receitas/controle/${unidade.id}?tipo=${t}`}
              className={cn("rounded px-3 py-1 text-sm font-medium", t === tipo ? "bg-background shadow-sm" : "text-muted-foreground")}
            >
              {t}
            </Link>
          ))}
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="grid content-start gap-4 lg:col-span-2">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Contribuição {tipo.toLowerCase()}, mês a mês</CardTitle>
              <CardDescription>
                {regra.controla
                  ? `Relação até o dia ${regra.diaEnvio} e depósito até o dia ${regra.diaDeposito} do mês seguinte${tipo !== "Associativa" ? `, em ${rotuloMeses(regra.meses)}` : ""}${regra.excecao ? " (regra própria)" : ""}.`
                  : `Esta empresa não desconta a contribuição ${tipo.toLowerCase()}${regra.excecao ? " (regra própria)" : ""}.`}
              </CardDescription>
            </CardHeader>
            <CardContent className="grid gap-5">
              <div className="-mx-6 overflow-x-auto px-6">
                <div className="flex gap-1">
                  {celulas.map((c) => (
                    <div key={c.competencia} className="grid gap-1 text-center">
                      <span className="text-muted-foreground text-[11px]">{rotuloCurto(c.competencia)}</span>
                      <CelulaSituacao
                        celula={c}
                        selecionada={c.competencia === selecionada?.competencia}
                        href={`/painel/filiados/receitas/controle/${unidade.id}?tipo=${tipo}&c=${c.competencia}`}
                      />
                    </div>
                  ))}
                </div>
              </div>

              {selecionada && (
                <div className="grid gap-4 rounded-lg border p-4">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <h2 className="font-semibold">{rotuloCompetencia(selecionada.competencia)}</h2>
                      <SeloSituacao situacao={selecionada.situacao} />
                    </div>
                    {selecionada.remessaId ? (
                      <Button variant="outline" size="sm" asChild>
                        <Link href={hrefReceitas(selecionada.remessaId)}>
                          <ExternalLink />
                          {selecionada.lancamentos > 0 ? "Abrir em Receitas" : "Lançar a relação"}
                        </Link>
                      </Button>
                    ) : (
                      selecionada.situacao !== "nao_se_aplica" && (
                        <Button variant="outline" size="sm" asChild>
                          <Link href="/painel/filiados/receitas/nova">
                            <Plus />
                            Criar a remessa de {rotuloCompetencia(selecionada.competencia)}
                          </Link>
                        </Button>
                      )
                    )}
                  </div>
                  <p className="text-muted-foreground text-sm">{ROTULO_SITUACAO[selecionada.situacao].explicacao}</p>
                  <dl className="grid gap-3 text-sm sm:grid-cols-4">
                    <div>
                      <dt className="text-muted-foreground text-xs">Descontos lançados</dt>
                      <dd className="font-medium tabular-nums">{selecionada.lancamentos.toLocaleString("pt-BR")}</dd>
                    </div>
                    <div>
                      <dt className="text-muted-foreground text-xs">Total da relação</dt>
                      <dd className="font-medium tabular-nums">{formatarMoeda(selecionada.valor)}</dd>
                    </div>
                    <div>
                      <dt className="text-muted-foreground text-xs">Depósito</dt>
                      <dd className="font-medium tabular-nums">{selecionada.deposito === null ? "—" : formatarMoeda(selecionada.deposito)}</dd>
                    </div>
                    <div>
                      <dt className="text-muted-foreground text-xs">Prazos</dt>
                      <dd className="tabular-nums">
                        relação {formatarData(selecionada.prazoEnvio)}
                        <br />
                        depósito {formatarData(selecionada.prazoDeposito)}
                      </dd>
                    </div>
                  </dl>
                  {selecionada.situacao === "atrasada" && (
                    <p className="text-destructive text-sm font-medium">
                      {diasDeAtraso(quadro.hoje, selecionada.prazoEnvio)} dia(s) de atraso na relação.
                    </p>
                  )}
                  {selecionada.situacao === "falta_deposito" && (
                    <p className="text-destructive text-sm font-medium">
                      {diasDeAtraso(quadro.hoje, selecionada.prazoDeposito)} dia(s) de atraso no depósito.
                    </p>
                  )}
                  {selecionada.situacao === "divergente" && selecionada.deposito !== null && (
                    <p className="text-warning-fg text-sm font-medium">
                      Diferença de {formatarMoeda(selecionada.deposito - selecionada.valor)} entre o depósito e a relação.
                    </p>
                  )}
                  {selecionada.situacao !== "nao_se_aplica" && (
                    <AcoesCompetencia
                      key={`${tipo}-${selecionada.competencia}`}
                      empresaId={unidade.id}
                      empresaNome={unidade.nome}
                      tipo={tipo}
                      competencia={selecionada.competencia}
                      situacao={selecionada.situacao}
                      valor={selecionada.valor}
                      contatos={contatosCliente}
                    />
                  )}
                  {contatos.length === 0 && selecionada.situacao !== "nao_se_aplica" && (
                    <p className="text-muted-foreground text-xs">Cadastre um contato da folha para cobrar por e-mail ou WhatsApp.</p>
                  )}
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Trilha</CardTitle>
              <CardDescription>Cobranças, contatos e registros da contribuição {tipo.toLowerCase()} desta empresa.</CardDescription>
            </CardHeader>
            <CardContent>
              {eventosDoTipo.length === 0 ? (
                <p className="text-muted-foreground text-sm">Nada registrado ainda.</p>
              ) : (
                <ul className="grid gap-3">
                  {eventosDoTipo.map((e) => (
                    <li key={e.id} className="flex flex-wrap items-start justify-between gap-2 border-b pb-3 last:border-0 last:pb-0">
                      <div className="min-w-0 text-sm">
                        <p>
                          <span className="font-medium">{ROTULO_EVENTO[e.evento] ?? e.evento}</span>
                          <span className="text-muted-foreground"> · {rotuloCompetencia(e.competencia)}</span>
                          {e.meio && <span className="text-muted-foreground"> · {rotuloMeio(e.meio)}</span>}
                        </p>
                        {e.observacao && <p className="text-muted-foreground mt-0.5">{e.observacao}</p>}
                        <p className="text-muted-foreground mt-0.5 text-xs">
                          {formatarData(e.data)}
                          {e.usuarioNome && ` · ${e.usuarioNome}`}
                        </p>
                      </div>
                      {(e.evento === "relacao_recebida" || e.evento === "sem_desconto") && <DesfazerEvento id={e.id} empresaId={unidade.id} />}
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        </div>

        <div className="grid content-start gap-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Contatos da folha</CardTitle>
              <CardDescription>Quem recebe as cobranças e as inclusões e exclusões.</CardDescription>
            </CardHeader>
            <CardContent>
              <ContatosFolha empresaId={unidade.id} contatos={contatosCliente} />
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Prazos desta empresa</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-2 text-sm">
              {TIPOS_CONTRIBUICAO.map((t) => {
                const r = regraEfetiva(t, regras.geral[t], daEmpresa[t])
                return (
                  <p key={t}>
                    <span className="font-medium">{t}:</span>{" "}
                    <span className="text-muted-foreground">
                      {r.controla
                        ? `relação até dia ${r.diaEnvio}, depósito até dia ${r.diaDeposito}${t !== "Associativa" ? `, ${rotuloMeses(r.meses)}` : ""}`
                        : r.excecao
                          ? "não desconta"
                          : "fora do controle"}
                      {r.excecao && " (própria)"}
                    </span>
                  </p>
                )
              })}
              <Link href={`/painel/representacao/empregadores/${unidade.id}?aba=arrecadacao`} className="text-primary text-xs font-medium hover:underline">
                Alterar na página do empregador
              </Link>
            </CardContent>
          </Card>
        </div>
      </div>

      <Card id="inclusoes">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            Inclusões e exclusões de desconto
          </CardTitle>
          <CardDescription>
            Quem passou a ser filiado (incluir o desconto) e quem se desfiliou (excluir), para avisar o RH desta empresa.
            Quem paga por Pix ou boleto não entra.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-6">
          {pendencias.desde === null ? (
            <Alert>
              <AlertDescription>
                Defina o mês de início do controle em{" "}
                <Link href="/painel/filiados/receitas/controle/prazos" className="font-medium underline">
                  Prazos e tipos
                </Link>{" "}
                para listar as inclusões e exclusões.
              </AlertDescription>
            </Alert>
          ) : pendencias.itens.length === 0 ? (
            <p className="text-muted-foreground text-sm">
              Nada a comunicar: todas as filiações e desfiliações desde {rotuloCompetencia(pendencias.desde)} já foram enviadas.
            </p>
          ) : (
            <>
              <p className="flex flex-wrap gap-4 text-sm">
                <span className="inline-flex items-center gap-1">
                  <UserPlus className="text-success-fg size-4" /> {inclusoes} a incluir
                </span>
                <span className="inline-flex items-center gap-1">
                  <UserMinus className="text-destructive size-4" /> {exclusoes} a excluir
                </span>
              </p>
              <ComunicarDesconto
                key={pendencias.itens.map((i) => i.vinculoId + i.acao).join(",")}
                empresaId={unidade.id}
                itens={pendencias.itens.map((i) => ({
                  vinculoId: i.vinculoId,
                  nome: i.nome,
                  cpf: i.cpf,
                  matricula: i.matricula,
                  data: i.data,
                  acao: i.acao,
                }))}
                contatos={contatosCliente}
              />
            </>
          )}

          {comunicacoes.length > 0 && (
            <div className="grid gap-3">
              <h3 className="text-sm font-medium">Já enviadas</h3>
              {comunicacoes.map((c) => (
                <details key={c.id} className="rounded-lg border p-3">
                  <summary className="cursor-pointer text-sm">
                    <span className="font-medium">{formatarDataHora(c.enviadoEm)}</span>
                    <span className="text-muted-foreground">
                      {" "}
                      · {rotuloMeio(c.meio)}
                      {c.destinatario && ` para ${c.destinatario}`} · {c.inclusoes} inclusão(ões), {c.exclusoes} exclusão(ões)
                      {c.usuarioNome && ` · ${c.usuarioNome}`}
                    </span>
                    {c.itens.some((i) => i.conferencia && !i.conferencia.ok) && (
                      <span className="text-warning-fg ml-2 text-xs font-medium">
                        {c.itens.filter((i) => i.conferencia && !i.conferencia.ok).length} sem efeito na relação
                      </span>
                    )}
                  </summary>
                  <div className="mt-3 grid gap-2">
                    {c.referencia && <p className="text-muted-foreground text-xs">Referência: {c.referencia}</p>}
                    <ul className="grid gap-1 text-sm">
                      {c.itens.map((i, n) => (
                        <li key={n} className="flex flex-wrap justify-between gap-2">
                          <span>
                            <span className={i.acao === "inclusao" ? "text-success-fg" : "text-destructive"}>
                              {i.acao === "inclusao" ? "Incluir" : "Excluir"}
                            </span>{" "}
                            {i.nome}
                            {i.matricula && <span className="text-muted-foreground"> · {i.matricula}</span>}
                          </span>
                          <span className={cn("text-xs", i.conferencia ? (i.conferencia.ok ? "text-success-fg" : "text-warning-fg") : "text-muted-foreground")}>
                            {i.conferencia?.texto ?? "Aguardando a próxima relação"}
                          </span>
                        </li>
                      ))}
                    </ul>
                    <div>
                      <Button variant="outline" size="sm" asChild>
                        <a href={`/painel/filiados/receitas/controle/${unidade.id}/planilha?comunicacao=${c.id}`}>
                          <FileDown />
                          Planilha deste envio
                        </a>
                      </Button>
                    </div>
                  </div>
                </details>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </>
  )
}
