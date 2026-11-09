import type { Metadata } from "next"
import Link from "next/link"
import { ArrowLeft, ChevronLeft, ChevronRight, Settings2, UserMinus, UserPlus } from "lucide-react"

import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { requirePermissao } from "@/lib/auth"
import { contagemPendenciasDesconto } from "@/lib/db/desconto-comunicacoes"
import { competenciaCorrente, quadroRepasse, regrasRepasse, tiposControlados, AVISO_SQL_REPASSE } from "@/lib/db/repasse"
import { formatarData } from "@/lib/formato"
import {
  competenciaValida,
  ehTipoContribuicao,
  ROTULO_SITUACAO,
  rotuloCompetencia,
  rotuloCurto,
  rotuloMeses,
  SITUACOES_COBRAR,
  SITUACOES_CONFERIR,
  somarMeses,
  type SituacaoEnvio,
  type TipoContribuicao,
} from "@/lib/repasse"
import { cn } from "@/lib/utils"

import { CelulaSituacao, CLASSE_TOM } from "./situacao"

export const metadata: Metadata = { title: "Controle de envio — Confluir" }

type Busca = { tipo?: string; ate?: string; ver?: string }

export default async function ControleEnvioPage({ searchParams }: { searchParams: Promise<Busca> }) {
  await requirePermissao("filiacao_receitas", ["filiacao_gestao"])
  const p = await searchParams
  const regras = await regrasRepasse()
  const tipos = regras.disponivel ? tiposControlados(regras) : []
  const tipo: TipoContribuicao = ehTipoContribuicao(p.tipo) && tipos.includes(p.tipo) ? p.tipo : (tipos[0] ?? "Associativa")
  const corrente = competenciaCorrente()
  const ateLido = Number(p.ate)
  const ate = competenciaValida(ateLido) && ateLido <= somarMeses(corrente, 1) ? ateLido : corrente
  const ver = p.ver === "todas" ? "todas" : "pendentes"

  const [quadro, pendencias] = await Promise.all([
    quadroRepasse({ tipo, ate, meses: 12 }),
    contagemPendenciasDesconto().catch(() => new Map<string, { inclusoes: number; exclusoes: number }>()),
  ])

  const link = (mudar: Partial<Busca>) => {
    const q = new URLSearchParams()
    const v = { tipo, ate: String(ate), ver, ...mudar }
    if (v.tipo && v.tipo !== tipos[0]) q.set("tipo", v.tipo)
    if (v.ate && Number(v.ate) !== corrente) q.set("ate", v.ate)
    if (v.ver === "todas") q.set("ver", "todas")
    const s = q.toString()
    return `/painel/filiados/receitas/controle${s ? `?${s}` : ""}`
  }

  // Resumo: em cada empresa, a pior situação entre as competências da janela.
  const pede = (s: SituacaoEnvio) => SITUACOES_COBRAR.includes(s) || SITUACOES_CONFERIR.includes(s)
  const contagem = new Map<SituacaoEnvio, number>()
  for (const l of quadro.linhas) for (const c of l.celulas) contagem.set(c.situacao, (contagem.get(c.situacao) ?? 0) + 1)
  const ultima = quadro.competencias.at(-1)!
  const ultimaPorSituacao = new Map<SituacaoEnvio, number>()
  for (const l of quadro.linhas) {
    const c = l.celulas.at(-1)!
    ultimaPorSituacao.set(c.situacao, (ultimaPorSituacao.get(c.situacao) ?? 0) + 1)
  }
  const linhas =
    ver === "todas" ? quadro.linhas : quadro.linhas.filter((l) => l.celulas.some((c) => pede(c.situacao)) || pendencias.has(l.id))
  const totalInc = [...pendencias.values()].reduce((s, c) => s + c.inclusoes, 0)
  const totalExc = [...pendencias.values()].reduce((s, c) => s + c.exclusoes, 0)

  const tiles: { rotulo: string; valor: number; tom: keyof typeof CLASSE_TOM; detalhe: string }[] = [
    {
      rotulo: "Relações atrasadas",
      valor: contagem.get("atrasada") ?? 0,
      tom: "perigo",
      detalhe: `${ultimaPorSituacao.get("atrasada") ?? 0} em ${rotuloCompetencia(ultima)}`,
    },
    {
      rotulo: "Falta o depósito",
      valor: contagem.get("falta_deposito") ?? 0,
      tom: "perigo",
      detalhe: "relação lançada, sem comprovante",
    },
    {
      rotulo: "Para conferir",
      valor: SITUACOES_CONFERIR.reduce((s, x) => s + (contagem.get(x) ?? 0), 0),
      tom: "alerta",
      detalhe: "valor diferente, sem relação ou falta lançar",
    },
    {
      rotulo: `Em dia em ${rotuloCompetencia(ultima)}`,
      valor: (ultimaPorSituacao.get("paga") ?? 0) + (ultimaPorSituacao.get("sem_desconto") ?? 0),
      tom: "sucesso",
      detalhe: `de ${quadro.linhas.length} empresa(s)`,
    },
  ]

  return (
    <>
      <div>
        <Button variant="ghost" size="sm" asChild className="-ml-2 mb-3">
          <Link href="/painel/filiados/receitas">
            <ArrowLeft />
            Receitas
          </Link>
        </Button>
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Controle de envio</h1>
            <p className="text-muted-foreground mt-1 max-w-2xl text-sm">
              Quais fontes pagadoras já mandaram a relação de descontos e depositaram, mês a mês, e o que falta comunicar a
              elas sobre quem entrou e quem saiu.
            </p>
          </div>
          <Button variant="outline" asChild>
            <Link href="/painel/filiados/receitas/controle/prazos">
              <Settings2 />
              Prazos e tipos
            </Link>
          </Button>
        </div>
      </div>

      {!quadro.disponivel ? (
        <Alert>
          <AlertDescription>{AVISO_SQL_REPASSE}</AlertDescription>
        </Alert>
      ) : (
        <>
          {quadro.desde === null && (
            <Alert className="border-warning/50">
              <AlertDescription>
                O controle ainda não foi ativado: nada aparece como atrasado e as inclusões e exclusões não são listadas.
                Defina o mês de início em{" "}
                <Link href="/painel/filiados/receitas/controle/prazos" className="font-medium underline">
                  Prazos e tipos
                </Link>
                .
              </AlertDescription>
            </Alert>
          )}

          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {tiles.map((t) => (
              <Card key={t.rotulo}>
                <CardContent className="py-4">
                  <p className="text-muted-foreground text-xs">{t.rotulo}</p>
                  <p className={cn("mt-1 text-2xl font-semibold tabular-nums", t.valor > 0 && t.tom === "perigo" && "text-destructive", t.valor > 0 && t.tom === "alerta" && "text-warning-fg", t.tom === "sucesso" && "text-success-fg")}>
                    {t.valor.toLocaleString("pt-BR")}
                  </p>
                  <p className="text-muted-foreground mt-0.5 text-xs">{t.detalhe}</p>
                </CardContent>
              </Card>
            ))}
          </div>

          {quadro.desde !== null && (totalInc > 0 || totalExc > 0) && (
            <Alert>
              <AlertDescription className="flex flex-wrap items-center gap-x-4 gap-y-1">
                <span className="font-medium">A comunicar às empresas:</span>
                <span className="inline-flex items-center gap-1">
                  <UserPlus className="size-4" /> {totalInc} inclusão(ões)
                </span>
                <span className="inline-flex items-center gap-1">
                  <UserMinus className="size-4" /> {totalExc} exclusão(ões)
                </span>
                <span className="text-muted-foreground">em {pendencias.size} empresa(s), marcadas no quadro abaixo.</span>
              </AlertDescription>
            </Alert>
          )}

          <Card>
            <CardHeader className="gap-3">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <CardTitle className="text-base">Contribuição {tipo.toLowerCase()}</CardTitle>
                  <CardDescription>
                    {rotuloCompetencia(quadro.competencias[0])} a {rotuloCompetencia(ultima)} ·{" "}
                    {ver === "todas" ? `${quadro.linhas.length} empresa(s)` : `${linhas.length} de ${quadro.linhas.length} empresa(s) com algo a fazer`}
                  </CardDescription>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  {tipos.length > 1 && (
                    <div className="bg-muted flex rounded-md p-0.5">
                      {tipos.map((t) => (
                        <Link
                          key={t}
                          href={link({ tipo: t })}
                          className={cn("rounded px-2.5 py-1 text-xs font-medium", t === tipo ? "bg-background shadow-sm" : "text-muted-foreground")}
                        >
                          {t}
                        </Link>
                      ))}
                    </div>
                  )}
                  <div className="bg-muted flex rounded-md p-0.5">
                    {(["pendentes", "todas"] as const).map((v) => (
                      <Link
                        key={v}
                        href={link({ ver: v })}
                        className={cn("rounded px-2.5 py-1 text-xs font-medium", v === ver ? "bg-background shadow-sm" : "text-muted-foreground")}
                      >
                        {v === "pendentes" ? "Com algo a fazer" : "Todas"}
                      </Link>
                    ))}
                  </div>
                  <div className="flex">
                    <Button variant="outline" size="icon" className="size-8" asChild>
                      <Link href={link({ ate: String(somarMeses(ate, -12)) })} aria-label="12 meses antes">
                        <ChevronLeft />
                      </Link>
                    </Button>
                    {ate < corrente && (
                      <Button variant="outline" size="icon" className="ml-1 size-8" asChild>
                        <Link href={link({ ate: String(Math.min(somarMeses(ate, 12), corrente)) })} aria-label="12 meses depois">
                          <ChevronRight />
                        </Link>
                      </Button>
                    )}
                  </div>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              {linhas.length === 0 ? (
                <p className="text-muted-foreground py-6 text-center text-sm">
                  {quadro.linhas.length === 0
                    ? "Nenhuma fonte pagadora com filiados ativos para este tipo."
                    : "Nada a fazer: todas as empresas estão em dia nesta janela."}
                </p>
              ) : (
                <div className="-mx-6 overflow-x-auto px-6">
                  <table className="w-full border-separate border-spacing-1 text-sm">
                    <thead>
                      <tr>
                        <th className="bg-card sticky left-0 z-10 min-w-56 text-left text-xs font-medium">Empresa</th>
                        {quadro.competencias.map((c) => (
                          <th key={c} className="text-muted-foreground text-center text-xs font-normal">
                            {rotuloCurto(c)}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {linhas.map((l) => {
                        const pend = pendencias.get(l.id)
                        return (
                          <tr key={l.id}>
                            <td className="bg-card sticky left-0 z-10 pr-2 align-middle">
                              <Link href={`/painel/filiados/receitas/controle/${l.id}?tipo=${tipo}`} className="font-medium hover:underline">
                                {l.nome}
                              </Link>
                              <p className="text-muted-foreground text-xs">
                                {l.filiadosAtivos} ativo(s)
                                {l.grupo && ` · grupo ${l.grupo.nome}`}
                                {l.regra.controla && ` · relação até dia ${l.regra.diaEnvio}`}
                                {l.regra.excecao && " · regra própria"}
                                {l.semValores && ` · sem valores desde ${rotuloCompetencia(l.semValores.desde)}`}
                                {tipo !== "Associativa" && l.regra.controla && ` · ${rotuloMeses(l.regra.meses)}`}
                              </p>
                              {pend && (
                                <p className="text-primary text-xs font-medium">
                                  {pend.inclusoes > 0 && `${pend.inclusoes} a incluir`}
                                  {pend.inclusoes > 0 && pend.exclusoes > 0 && " · "}
                                  {pend.exclusoes > 0 && `${pend.exclusoes} a excluir`}
                                </p>
                              )}
                            </td>
                            {l.celulas.map((c) => (
                              <td key={c.competencia}>
                                <CelulaSituacao celula={c} href={`/painel/filiados/receitas/controle/${l.id}?tipo=${tipo}&c=${c.competencia}`} />
                              </td>
                            ))}
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              )}
              <div className="mt-4 flex flex-wrap gap-x-4 gap-y-2">
                {(["atrasada", "falta_deposito", "divergente", "recebida_fora", "aguardando", "recebida", "paga", "sem_desconto", "sem_repasse"] as const).map((s) => (
                  <span key={s} className="text-muted-foreground inline-flex items-center gap-1.5 text-xs" title={ROTULO_SITUACAO[s].explicacao}>
                    <span className={cn("size-3 rounded-sm border", CLASSE_TOM[ROTULO_SITUACAO[s].tom])} />
                    {ROTULO_SITUACAO[s].rotulo}
                  </span>
                ))}
              </div>
              {quadro.desde !== null && (
                <p className="text-muted-foreground mt-3 text-xs">
                  Controle desde {rotuloCompetencia(quadro.desde)}: competências anteriores não contam como atraso. Hoje é{" "}
                  {formatarData(quadro.hoje)}.
                </p>
              )}
            </CardContent>
          </Card>
        </>
      )}
    </>
  )
}
