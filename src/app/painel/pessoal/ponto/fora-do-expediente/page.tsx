import type { Metadata } from "next"
import Link from "next/link"
import { ArrowLeft, ChevronLeft, ChevronRight } from "lucide-react"

import { TileIndicador } from "@/components/graficos/tile"
import { RotuloTrilha } from "@/components/layout/trilha-rotulos"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { requirePermissao } from "@/lib/auth"
import { horarioDoDiaJornada } from "@/lib/pessoal-sst-constantes"
import { competenciaValida, usoForaDoExpediente, usoForaDoFuncionario } from "@/lib/db/uso-fora-expediente"
import {
  CATEGORIAS_FORA,
  TOLERANCIA_DIARIA_MIN,
  horaDoDia,
  textoMinutos,
  type DiaUso,
  type TrechoUso,
} from "@/lib/uso-fora-expediente"

export const metadata: Metadata = { title: "Uso fora do expediente — Confluir" }

const MESES = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"]

function mesAtual(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit" }).format(new Date()).slice(0, 7)
}

function deslocar(comp: string, delta: number): string {
  const [a, m] = comp.split("-").map(Number)
  const d = new Date(Date.UTC(a, m - 1 + delta, 1))
  return d.toISOString().slice(0, 7)
}

const rotuloMes = (comp: string) => `${MESES[Number(comp.slice(5, 7)) - 1]} de ${comp.slice(0, 4)}`
const dataBr = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`

const COR: Record<TrechoUso["categoria"], string> = {
  dentro: "bg-success/70",
  antes: "bg-warning",
  depois: "bg-warning",
  intervalo: "bg-warning/60",
  sem_expediente: "bg-destructive/70",
  feriado: "bg-destructive/70",
  afastado: "bg-destructive",
}

/** Linha de 0 a 24 h com os trechos de uso do dia. */
function LinhaDoDia({ dia }: { dia: DiaUso }) {
  return (
    <div className="bg-muted relative h-3 w-full min-w-40 overflow-hidden rounded-sm" aria-hidden>
      {[6, 12, 18].map((h) => (
        <span key={h} className="bg-border absolute top-0 h-full w-px" style={{ left: `${(h / 24) * 100}%` }} />
      ))}
      {dia.trechos.map((t, i) => (
        <span
          key={i}
          className={`absolute top-0 h-full ${COR[t.categoria]}`}
          style={{ left: `${(t.inicio / 1440) * 100}%`, width: `max(2px, ${((t.fim - t.inicio) / 1440) * 100}%)` }}
        />
      ))}
    </div>
  )
}

async function Detalhe({ usuarioId, mes, hrefMes }: { usuarioId: string; mes: string; hrefMes: string }) {
  const d = await usoForaDoFuncionario(usuarioId, mes)
  const comFora = d.dias.filter((x) => x.foraTotal > 0)
  return (
    <Card id="detalhe">
      <CardHeader>
        <CardTitle>{d.nome}</CardTitle>
        <CardDescription>
          {d.jornada ? (
            <>
              Jornada {d.jornada.nome}:{" "}
              {d.jornada.dias
                .slice()
                .sort((a, b) => a.dia_semana - b.dia_semana)
                .map((j) => `${["dom", "seg", "ter", "qua", "qui", "sex", "sáb"][j.dia_semana]} ${horarioDoDiaJornada(j)}`)
                .join(" · ")}
            </>
          ) : (
            "Sem jornada vinculada."
          )}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap gap-x-6 gap-y-1 text-sm">
          <span>
            Uso no mês: <strong>{textoMinutos(d.resumo.total)}</strong>
          </span>
          <span>
            Fora do expediente: <strong>{textoMinutos(d.resumo.foraTotal)}</strong>
          </span>
          <span>
            A considerar: <strong>{textoMinutos(d.resumo.considerado)}</strong> em {d.resumo.diasAcimaTolerancia} dia(s)
          </span>
        </div>
        {d.dias.length === 0 ? (
          <p className="text-muted-foreground text-sm">Nenhum uso do painel registrado em {rotuloMes(mes)}.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-muted-foreground text-left text-xs">
                <tr className="border-b">
                  <th className="py-2 pr-3 font-medium">Dia</th>
                  <th className="py-2 pr-3 font-medium">Uso ao longo do dia (0h–24h)</th>
                  <th className="py-2 pr-3 text-right font-medium">Uso</th>
                  <th className="py-2 pr-3 text-right font-medium">Fora</th>
                  <th className="py-2 font-medium">Onde caiu o tempo fora</th>
                </tr>
              </thead>
              <tbody>
                {d.dias.map((dia) => {
                  const foraTrechos = dia.trechos.filter((t) => t.categoria !== "dentro")
                  return (
                    <tr key={dia.data} className={`border-b align-top last:border-0 ${dia.foraTotal === 0 ? "text-muted-foreground" : ""}`}>
                      <td className="py-2 pr-3 whitespace-nowrap">
                        {dataBr(dia.data)} <span className="text-muted-foreground text-xs">{dia.nomeDia.slice(0, 3).toLowerCase()}</span>
                        {dia.situacao && <div className="text-xs">{dia.situacao}</div>}
                      </td>
                      <td className="py-2 pr-3 pt-3">
                        <LinhaDoDia dia={dia} />
                      </td>
                      <td className="py-2 pr-3 text-right tabular-nums">{textoMinutos(dia.total)}</td>
                      <td className="py-2 pr-3 text-right font-medium tabular-nums">
                        {textoMinutos(dia.foraTotal)}
                        {dia.foraTotal > 0 && dia.considerado === 0 && (
                          <div className="text-muted-foreground text-xs font-normal">na tolerância</div>
                        )}
                      </td>
                      <td className="py-2 text-xs">
                        {foraTrechos.length === 0
                          ? "—"
                          : CATEGORIAS_FORA.filter((c) => dia.fora[c.chave] > 0)
                              .map(
                                (c) =>
                                  `${c.rotulo}: ${textoMinutos(dia.fora[c.chave])} (${foraTrechos
                                    .filter((t) => t.categoria === c.chave)
                                    .map((t) => `${horaDoDia(t.inicio)}–${horaDoDia(t.fim)}`)
                                    .join(", ")})`
                              )
                              .join(" · ")}
                        {d.motivos.get(dia.data) && (
                          <div className="mt-1">
                            Motivo informado: <strong>{d.motivos.get(dia.data)}</strong>
                          </div>
                        )}
                        {dia.foraTotal > 0 && !d.motivos.get(dia.data) && (
                          <div className="text-muted-foreground mt-1">Sem motivo informado</div>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
        <div className="text-muted-foreground flex flex-wrap items-center gap-x-4 gap-y-1 text-xs">
          <span className="flex items-center gap-1">
            <span className="bg-success/70 inline-block size-3 rounded-sm" /> dentro da jornada
          </span>
          <span className="flex items-center gap-1">
            <span className="bg-warning inline-block size-3 rounded-sm" /> antes ou depois do horário
          </span>
          <span className="flex items-center gap-1">
            <span className="bg-warning/60 inline-block size-3 rounded-sm" /> intervalo
          </span>
          <span className="flex items-center gap-1">
            <span className="bg-destructive/70 inline-block size-3 rounded-sm" /> dia sem expediente ou feriado
          </span>
          <span className="flex items-center gap-1">
            <span className="bg-destructive inline-block size-3 rounded-sm" /> férias ou afastamento
          </span>
        </div>
        {comFora.length > 0 && (
          <p className="text-muted-foreground text-xs">
            {comFora.length} dia(s) com uso fora do expediente.{" "}
            <Link href={hrefMes} className="text-primary hover:underline">
              Fechar
            </Link>
          </p>
        )}
      </CardContent>
    </Card>
  )
}

/** Tempo de uso do painel fora da jornada de cada funcionário, por mês. */
export default async function UsoForaDoExpedientePage({
  searchParams,
}: {
  searchParams: Promise<{ mes?: string; funcionario?: string }>
}) {
  await requirePermissao("pessoal_gestao")
  const sp = await searchParams
  const atual = mesAtual()
  const mes = competenciaValida(sp.mes) ?? atual
  const dados = await usoForaDoExpediente(mes)
  const href = (m: string, f?: string) => `/painel/pessoal/ponto/fora-do-expediente?mes=${m}${f ? `&funcionario=${f}#detalhe` : ""}`
  const funcionario = sp.funcionario && dados.linhas.some((l) => l.usuarioId === sp.funcionario) ? sp.funcionario : null

  const comFora = dados.linhas.filter((l) => l.resumo.considerado > 0)
  const soma = (f: (l: (typeof dados.linhas)[number]) => number) => dados.linhas.reduce((s, l) => s + f(l), 0)
  const considerado = soma((l) => l.resumo.considerado)
  const diaLivre = soma((l) => l.resumo.fora.sem_expediente + l.resumo.fora.feriado)
  const afastado = soma((l) => l.resumo.fora.afastado)
  const intervalo = soma((l) => l.resumo.fora.intervalo)

  return (
    <>
      <RotuloTrilha valores={{ "fora-do-expediente": "Uso fora do expediente" }} />
      <div>
        <Button variant="ghost" size="sm" asChild className="-ml-2 mb-3">
          <Link href="/painel/pessoal/ponto">
            <ArrowLeft />
            Controle de ponto
          </Link>
        </Button>
        <h1 className="text-2xl font-semibold tracking-tight">Uso fora do expediente</h1>
        <p className="text-muted-foreground mt-1 max-w-3xl text-xs">
          Quanto tempo cada funcionário usou o Confluir fora da jornada vinculada: antes da entrada, depois da saída, no
          intervalo, em dia sem expediente, em feriado e em férias ou afastamento. Conta só o tempo com a aba aberta, à
          vista e em uso.
        </p>
      </div>

      <nav className="flex flex-wrap items-center gap-2 text-sm" aria-label="Mês">
        <Button variant="outline" size="sm" asChild>
          <Link href={href(deslocar(mes, -1))} aria-label="Mês anterior">
            <ChevronLeft />
          </Link>
        </Button>
        <span className="min-w-40 text-center font-medium">{rotuloMes(mes).replace(/^./, (c) => c.toUpperCase())}</span>
        {mes < atual ? (
          <Button variant="outline" size="sm" asChild>
            <Link href={href(deslocar(mes, 1))} aria-label="Mês seguinte">
              <ChevronRight />
            </Link>
          </Button>
        ) : (
          <Button variant="outline" size="sm" disabled aria-label="Mês seguinte">
            <ChevronRight />
          </Button>
        )}
      </nav>

      {!dados.disponivel ? (
        <Alert>
          <AlertDescription>
            O registro do uso ainda não está ligado nesta entidade (falta aplicar a atualização do banco de dados).
          </AlertDescription>
        </Alert>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <TileIndicador
              rotulo="Fora do expediente"
              valor={textoMinutos(considerado)}
              nota={`a considerar, sem os dias até ${TOLERANCIA_DIARIA_MIN} min`}
            />
            <TileIndicador rotulo="Pessoas com uso fora" valor={`${comFora.length} de ${dados.linhas.length}`} nota="com jornada vinculada" />
            <TileIndicador rotulo="Fim de semana e feriado" valor={textoMinutos(diaLivre)} nota={`intervalo: ${textoMinutos(intervalo)}`} />
            <TileIndicador rotulo="Em férias ou afastamento" valor={textoMinutos(afastado)} />
          </div>

          {funcionario && <Detalhe usuarioId={funcionario} mes={mes} hrefMes={href(mes)} />}

          <Card>
            <CardHeader>
              <CardTitle>Por funcionário</CardTitle>
              <CardDescription>
                {dados.desde
                  ? `Registrando desde ${new Date(dados.desde).toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" })}. `
                  : "Nenhum uso registrado ainda. "}
                Clique no nome para ver o dia a dia. Variações de até {TOLERANCIA_DIARIA_MIN} minutos num dia de trabalho não
                entram no &quot;a considerar&quot; (como no art. 58, § 1º, da CLT).
              </CardDescription>
            </CardHeader>
            <CardContent>
              {dados.linhas.length === 0 ? (
                <p className="text-muted-foreground text-sm">
                  Ninguém tem jornada vinculada. Vincule as jornadas em{" "}
                  <Link href="/painel/pessoal/atribuicoes/jornadas" className="text-primary hover:underline">
                    Atribuições e SST › Jornadas
                  </Link>
                  : o uso só é registrado e comparado para quem tem jornada.
                </p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="text-muted-foreground text-left text-xs">
                      <tr className="border-b">
                        <th className="py-2 pr-3 font-medium">Funcionário</th>
                        <th className="py-2 pr-3 text-right font-medium">Uso no mês</th>
                        {CATEGORIAS_FORA.map((c) => (
                          <th key={c.chave} className="py-2 pr-3 text-right font-medium" title={c.dica}>
                            {c.rotulo}
                          </th>
                        ))}
                        <th className="py-2 pr-3 text-right font-medium">A considerar</th>
                        <th className="py-2 text-right font-medium">Dias</th>
                      </tr>
                    </thead>
                    <tbody>
                      {dados.linhas.map((l) => (
                        <tr
                          key={l.usuarioId}
                          className={`border-b last:border-0 ${l.resumo.foraTotal === 0 ? "text-muted-foreground" : ""} ${l.usuarioId === funcionario ? "bg-muted/50" : ""}`}
                        >
                          <td className="py-2 pr-3">
                            <Link href={href(mes, l.usuarioId)} className="text-primary font-medium hover:underline">
                              {l.nome}
                            </Link>
                            <div className="text-muted-foreground text-xs">{l.jornada}</div>
                          </td>
                          <td className="py-2 pr-3 text-right tabular-nums">{textoMinutos(l.resumo.total)}</td>
                          {CATEGORIAS_FORA.map((c) => (
                            <td key={c.chave} className="py-2 pr-3 text-right tabular-nums">
                              {textoMinutos(l.resumo.fora[c.chave])}
                            </td>
                          ))}
                          <td className="py-2 pr-3 text-right font-semibold tabular-nums">{textoMinutos(l.resumo.considerado)}</td>
                          <td className="py-2 text-right tabular-nums" title="dias acima da tolerância / dias com algum uso fora">
                            {l.resumo.diasComFora ? `${l.resumo.diasAcimaTolerancia}/${l.resumo.diasComFora}` : "—"}
                            {l.diasComMotivo > 0 && (
                              <div className="text-muted-foreground text-xs font-normal">{l.diasComMotivo} com motivo</div>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>
        </>
      )}
    </>
  )
}
