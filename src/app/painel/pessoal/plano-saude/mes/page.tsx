import type { Metadata } from "next"
import Link from "next/link"
import { AlertTriangle, ArrowLeft, ChevronLeft, ChevronRight } from "lucide-react"

import { TileIndicador } from "@/components/graficos/tile"
import { RotuloTrilha } from "@/components/layout/trilha-rotulos"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { requirePermissao } from "@/lib/auth"
import { conferenciaDoMes } from "@/lib/db/plano-saude"
import { deslocarCompetencia, FAIXAS_ANS, moeda } from "@/lib/plano-saude"

import { CoparticipacaoForm } from "../forms"

export const metadata: Metadata = { title: "Plano de saúde: conferência do mês — Confluir" }

const MESES = ["Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho", "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"]
const rotulo = (c: string) => `${MESES[Number(c.slice(5, 7)) - 1]} de ${c.slice(0, 4)}`
const mesAtual = () => new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date()).slice(0, 7)

export default async function ConferenciaMesPage({ searchParams }: { searchParams: Promise<{ mes?: string }> }) {
  await requirePermissao("pessoal_gestao")
  const sp = await searchParams
  const mes = sp.mes && /^\d{4}-(0[1-9]|1[0-2])$/.test(sp.mes) ? sp.mes : mesAtual()
  const { disponivel, contratos } = await conferenciaDoMes(mes)
  const href = (m: string) => `/painel/pessoal/plano-saude/mes?mes=${m}`

  return (
    <>
      <RotuloTrilha valores={{ mes: "Conferência do mês" }} />
      <div>
        <Button variant="ghost" size="sm" asChild className="-ml-2 mb-3">
          <Link href="/painel/pessoal/plano-saude">
            <ArrowLeft />
            Plano de saúde
          </Link>
        </Button>
        <h1 className="text-2xl font-semibold tracking-tight">Conferência do mês</h1>
        <p className="text-muted-foreground mt-1 text-sm">
          Cada beneficiário com a idade, a faixa, a mensalidade da tabela vigente e a parte da entidade e do funcionário, pela regra de
          custeio. Compare com a fatura da operadora.
        </p>
      </div>

      <div className="flex items-center gap-2">
        <Button variant="outline" size="icon-sm" asChild aria-label="Mês anterior">
          <Link href={href(deslocarCompetencia(mes, -1))}>
            <ChevronLeft />
          </Link>
        </Button>
        <span className="min-w-40 text-center font-medium">{rotulo(mes)}</span>
        <Button variant="outline" size="icon-sm" asChild aria-label="Próximo mês">
          <Link href={href(deslocarCompetencia(mes, 1))}>
            <ChevronRight />
          </Link>
        </Button>
      </div>

      {!disponivel && (
        <Alert>
          <AlertDescription>O plano de saúde ainda não está ligado nesta entidade (falta aplicar a atualização do banco de dados).</AlertDescription>
        </Alert>
      )}
      {disponivel && contratos.length === 0 && (
        <Alert>
          <AlertDescription>Nenhum contrato ativo.</AlertDescription>
        </Alert>
      )}

      {contratos.map(({ contrato, grupos, mudancas, totais }) => {
        const comAlerta = grupos.filter((g) => g.alertas.length > 0).length
        const comMudanca = grupos.filter((g) => mudancas.get(g.titular.id)?.length).length
        const vidas = grupos.reduce((s, g) => s + g.linhas.length, 0)
        return (
          <Card key={contrato.id}>
            <CardHeader>
              <CardTitle className="text-base">
                <Link href={`/painel/pessoal/plano-saude/${contrato.id}`} className="hover:underline">
                  {contrato.nome}
                </Link>
              </CardTitle>
              <CardDescription>
                {vidas} beneficiário{vidas === 1 ? "" : "s"} de {grupos.length} titular{grupos.length === 1 ? "" : "es"}
                {comMudanca ? ` · ${comMudanca} com mudança em relação ao mês anterior` : ""}
                {comAlerta ? ` · ${comAlerta} com alerta` : ""}
              </CardDescription>
            </CardHeader>
            <CardContent className="grid gap-4">
              <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
                <TileIndicador rotulo="Mensalidades" valor={moeda(totais.mensalidade)} nota="pela tabela vigente" />
                <TileIndicador rotulo="Parte da entidade" valor={moeda(totais.entidade)} nota={contrato.coparticipacao ? "com a coparticipação" : undefined} />
                <TileIndicador rotulo="Descontos dos funcionários" valor={moeda(totais.desconto)} nota={contrato.coparticipacao ? "com a coparticipação" : undefined} />
                {contrato.coparticipacao ? (
                  <TileIndicador rotulo="Coparticipação" valor={moeda(totais.coparticipacao)} nota="lançada no mês" />
                ) : (
                  <TileIndicador rotulo="Parte dos funcionários" valor={moeda(totais.funcionario)} />
                )}
              </div>

              {grupos.length === 0 ? (
                <p className="text-muted-foreground text-sm">Ninguém no plano neste mês.</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="text-muted-foreground text-left text-xs">
                      <tr className="border-b">
                        <th className="py-2 pr-3 font-medium">Beneficiário</th>
                        <th className="py-2 pr-3 font-medium">Idade · faixa</th>
                        <th className="py-2 pr-3 text-right font-medium">Mensalidade</th>
                        <th className="py-2 pr-3 text-right font-medium">Entidade</th>
                        <th className="py-2 pr-3 text-right font-medium">Funcionário</th>
                        <th className="py-2 font-medium">Regra</th>
                      </tr>
                    </thead>
                    {grupos.map((g) => {
                      const m = mudancas.get(g.titular.id) ?? []
                      return (
                        <tbody key={g.titular.id} className="border-b-2">
                          {g.linhas.map((l) => (
                            <tr key={l.beneficiario.id} className="align-top">
                              <td className="py-1.5 pr-3">
                                <span className={l.beneficiario.tipo === "titular" ? "font-medium" : "pl-3"}>{l.beneficiario.nome}</span>
                                <span className="text-muted-foreground text-xs"> · {l.beneficiario.tipo === "titular" ? "titular" : l.beneficiario.grau}</span>
                                {l.alertas.map((a) => (
                                  <div key={a} className="text-warning-fg flex items-center gap-1 text-xs">
                                    <AlertTriangle className="size-3" />
                                    {a}
                                  </div>
                                ))}
                              </td>
                              <td className="py-1.5 pr-3 whitespace-nowrap">
                                {l.idade ?? "—"}
                                {l.faixa !== null ? <span className="text-muted-foreground text-xs"> · {FAIXAS_ANS[l.faixa].rotulo}</span> : null}
                              </td>
                              <td className="py-1.5 pr-3 text-right tabular-nums">{moeda(l.mensalidade)}</td>
                              <td className="py-1.5 pr-3 text-right tabular-nums">{moeda(l.entidade)}</td>
                              <td className="py-1.5 pr-3 text-right tabular-nums">{moeda(l.funcionario)}</td>
                              <td className="text-muted-foreground py-1.5 text-xs">{l.regra ?? "—"}</td>
                            </tr>
                          ))}
                          <tr className="bg-muted/40">
                            <td className="py-1.5 pr-3 text-xs" colSpan={2}>
                              {m.length > 0 ? (
                                <span>
                                  <strong>Mudou:</strong> {m.map((x) => `${x.nome}: ${x.texto}`).join("; ")}
                                </span>
                              ) : (
                                <span className="text-muted-foreground">Sem mudança em relação ao mês anterior</span>
                              )}
                            </td>
                            <td className="py-1.5 pr-3 text-right font-medium tabular-nums">{moeda(g.mensalidade)}</td>
                            <td className="py-1.5 pr-3 text-right font-medium tabular-nums">
                              {moeda(g.entidade)}
                              {g.entidadeCopart > 0 && <div className="text-muted-foreground text-xs font-normal">com {moeda(g.entidadeCopart)} de copart.</div>}
                            </td>
                            <td className="py-1.5 pr-3 text-right font-semibold tabular-nums">
                              {moeda(g.desconto)}
                              {g.descontoCopart > 0 && <div className="text-muted-foreground text-xs font-normal">com {moeda(g.descontoCopart)} de copart.</div>}
                            </td>
                            <td className="py-1.5">
                              {contrato.coparticipacao && (
                                <CoparticipacaoForm contratoId={contrato.id} titularId={g.titular.id} competencia={mes} valor={g.coparticipacao} />
                              )}
                            </td>
                          </tr>
                        </tbody>
                      )
                    })}
                  </table>
                </div>
              )}
            </CardContent>
          </Card>
        )
      })}
    </>
  )
}
