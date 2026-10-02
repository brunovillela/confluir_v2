import type { Metadata } from "next"
import Link from "next/link"
import { AlertTriangle, ArrowLeft, EyeOff, MessageSquareText } from "lucide-react"

import {
  AvaliacoesIndicadores,
  Estrelas,
  lerPeriodo,
} from "@/components/avaliacoes-indicadores"
import { Paginacao } from "@/components/paginacao"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { requirePermissao } from "@/lib/auth"
import { hojeSP } from "@/lib/db/comum"
import {
  AVISO_SQL_AVALIACOES,
  listarAvaliacoes,
  type AvaliacaoLinha,
} from "@/lib/db/hospedagem-avaliacoes"
import { formatarData, formatarDataHora } from "@/lib/formato"
import {
  calcularIndicadores,
  etiquetasSaoElogio,
  NOTA_EXIGE_COMENTARIO,
  ROTULO_NOTA,
  rotuloEtiqueta,
} from "@/lib/hospedagem-avaliacoes-constantes"
import { lerPaginacao, paginar } from "@/lib/paginacao"
import { tenantAtual } from "@/lib/tenant"

import { OcultarBotao, ProvidenciaForm } from "./formularios"

export const metadata: Metadata = { title: "Avaliações da hospedagem — Confluir" }

const SELECT =
  "border-input bg-background text-foreground h-9 max-w-56 truncate rounded-md border px-3 text-sm shadow-xs outline-none [color-scheme:light] dark:[color-scheme:dark]"

const POR_PAGINA = 30

/** Ranking: abaixo disso a média de um hotel oscila demais para comparar. */
const MINIMO_RANKING = 3

const SITUACOES = [
  { valor: "", rotulo: "Todas as situações" },
  { valor: "respondidas", rotulo: "Respondidas" },
  { valor: "pendentes", rotulo: "Pendentes" },
] as const

const precisaAtencao = (a: AvaliacaoLinha) =>
  a.situacao === "respondida" && a.nota !== null && a.nota <= NOTA_EXIGE_COMENTARIO && !a.tratadaEm

export default async function AvaliacoesHospedagemPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>
}) {
  await requirePermissao("filiacao_hospedagens_gestao")
  const sp = await searchParams
  const empId = await tenantAtual()

  const periodo = lerPeriodo(sp, hojeSP())
  const hotelId = sp.hotel || ""
  const notaBruta = Number(sp.nota)
  const nota = Number.isInteger(notaBruta) && notaBruta >= 1 && notaBruta <= 5 ? notaBruta : null
  const soComentario = sp.comentario === "1"
  const situacao = sp.situacao === "respondidas" || sp.situacao === "pendentes" ? sp.situacao : ""

  // Uma leitura só, sem filtro: o período, o hotel e a nota recortam em
  // memória. Assim o ranking compara TODOS os hotéis mesmo com um escolhido,
  // e "Precisam de atenção" não some porque a nota baixa caiu fora do período.
  const { disponivel, linhas: todas } = await listarAvaliacoes(empId)

  if (!disponivel) {
    return (
      <>
        <Cabecalho />
        <Alert variant="warning">
          <AlertDescription>{AVISO_SQL_AVALIACOES}</AlertDescription>
        </Alert>
      </>
    )
  }

  const noPeriodo = todas.filter((a) => a.checkOut >= periodo.de && a.checkOut <= periodo.ate)
  const doRecorte = noPeriodo.filter((a) => !hotelId || a.hotelId === hotelId)
  const indicadores = calcularIndicadores(doRecorte, { incluirSoSindicato: true })

  const hoteis = [...new Map(todas.map((a) => [a.hotelId, a.hotelNome ?? "Hotel"])).entries()].sort((a, b) =>
    a[1].localeCompare(b[1], "pt-BR")
  )

  const ranking = [...new Set(noPeriodo.map((a) => a.hotelId))]
    .map((id) => {
      const doHotel = noPeriodo.filter((a) => a.hotelId === id)
      const ind = calcularIndicadores(doHotel, { incluirSoSindicato: true })
      return { id, nome: doHotel[0].hotelNome ?? "Hotel", ind }
    })
    .filter((h) => h.ind.respondidas > 0)
    // Quem tem poucas avaliações vai para o fim, para a média instável não
    // liderar; dentro de cada grupo, a maior média primeiro.
    .sort(
      (a, b) =>
        Number(b.ind.respondidas >= MINIMO_RANKING) - Number(a.ind.respondidas >= MINIMO_RANKING) ||
        (b.ind.media ?? 0) - (a.ind.media ?? 0) ||
        b.ind.respondidas - a.ind.respondidas
    )

  const atencao = todas.filter((a) => precisaAtencao(a) && (!hotelId || a.hotelId === hotelId))

  const filtradas = doRecorte.filter(
    (a) =>
      (!nota || a.nota === nota) &&
      (!soComentario || Boolean(a.comentario)) &&
      (!situacao || (situacao === "respondidas" ? a.situacao === "respondida" : a.situacao === "pendente"))
  )
  const pag = paginar(filtradas, lerPaginacao(sp, POR_PAGINA))
  const temFiltro = !periodo.padrao || hotelId || nota || soComentario || situacao

  return (
    <>
      <Cabecalho />

      <form method="GET" action="/painel/hospedagem/avaliacoes" className="flex flex-wrap items-end gap-2">
        <div className="grid gap-1">
          <Label htmlFor="de" className="text-xs">
            Check-out de
          </Label>
          <Input id="de" type="date" name="de" defaultValue={periodo.de} className="h-9 w-40" />
        </div>
        <div className="grid gap-1">
          <Label htmlFor="ate" className="text-xs">
            até
          </Label>
          <Input id="ate" type="date" name="ate" defaultValue={periodo.ate} className="h-9 w-40" />
        </div>
        <select name="hotel" defaultValue={hotelId} className={SELECT} aria-label="Hotel">
          <option value="">Todos os hotéis</option>
          {hoteis.map(([id, nome]) => (
            <option key={id} value={id}>
              {nome}
            </option>
          ))}
        </select>
        <select name="nota" defaultValue={nota ? String(nota) : ""} className={SELECT} aria-label="Nota">
          <option value="">Todas as notas</option>
          {[5, 4, 3, 2, 1].map((n) => (
            <option key={n} value={n}>
              {n} estrela{n === 1 ? "" : "s"} — {ROTULO_NOTA[n]}
            </option>
          ))}
        </select>
        <select name="situacao" defaultValue={situacao} className={SELECT} aria-label="Situação">
          {SITUACOES.map((s) => (
            <option key={s.valor} value={s.valor}>
              {s.rotulo}
            </option>
          ))}
        </select>
        <label className="flex h-9 items-center gap-2 text-sm">
          <input type="checkbox" name="comentario" value="1" defaultChecked={soComentario} className="accent-primary size-4" />
          Só com comentário
        </label>
        <Button type="submit" variant="secondary">
          Filtrar
        </Button>
        {temFiltro && (
          <Button variant="ghost" asChild>
            <Link href="/painel/hospedagem/avaliacoes">Limpar</Link>
          </Button>
        )}
      </form>

      <p className="text-muted-foreground -mt-3 text-xs">
        Período pelo check-out: {formatarData(periodo.de)} a {formatarData(periodo.ate)}
        {periodo.padrao ? " (últimos 90 dias)" : ""}. Os indicadores consideram o período e o hotel; nota,
        situação e comentário filtram só a lista.
      </p>

      <AvaliacoesIndicadores ind={indicadores} />

      {atencao.length > 0 && (
        <Card className="border-warning/50">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <AlertTriangle className="text-warning-fg size-4" />
              Precisam de atenção ({atencao.length})
            </CardTitle>
            <CardDescription>
              Notas 1 e 2 ainda sem providência, de qualquer período. Registre o que foi feito — a avaliação sai
              daqui e fica marcada como tratada, com o seu nome.
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-3">
            {atencao.map((a) => (
              <div key={a.id} className="grid gap-2 rounded-lg border p-3 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
                <div className="grid content-start gap-1 text-sm">
                  <div className="flex flex-wrap items-center gap-2">
                    <Estrelas nota={a.nota} />
                    <span className="font-medium">{a.hotelNome ?? "Hotel"}</span>
                  </div>
                  <p className="text-muted-foreground text-xs">
                    {a.filiadoId ? (
                      <Link href={`/painel/filiados/${a.filiadoId}`} className="text-primary hover:underline">
                        {a.filiadoNome ?? "Filiado"}
                      </Link>
                    ) : (
                      "Sem filiado"
                    )}{" "}
                    · {formatarData(a.checkIn)} a {formatarData(a.checkOut)}
                  </p>
                  <EtiquetasDaAvaliacao a={a} />
                  {a.comentario && <p className="text-sm whitespace-pre-line">“{a.comentario}”</p>}
                </div>
                <ProvidenciaForm id={a.id} />
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {ranking.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Ranking dos hotéis</CardTitle>
            <CardDescription>
              Todos os hotéis no período, da maior média para a menor. Com menos de {MINIMO_RANKING} avaliações a
              média ainda oscila muito — esses ficam no fim, esmaecidos.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-10">#</TableHead>
                    <TableHead>Hotel</TableHead>
                    <TableHead>Média</TableHead>
                    <TableHead className="text-right">Avaliações</TableHead>
                    <TableHead className="text-right">5 estrelas</TableHead>
                    <TableHead className="hidden text-right sm:table-cell">Pendentes</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {ranking.map((h, i) => {
                    const poucas = h.ind.respondidas < MINIMO_RANKING
                    const q = new URLSearchParams({ de: periodo.de, ate: periodo.ate, hotel: h.id })
                    return (
                      <TableRow key={h.id} className={poucas ? "opacity-60" : undefined}>
                        <TableCell className="text-muted-foreground tabular-nums">{i + 1}</TableCell>
                        <TableCell className="max-w-64 truncate font-medium">
                          <Link href={`/painel/hospedagem/avaliacoes?${q}`} className="hover:underline">
                            {h.nome}
                          </Link>
                          {h.id === hotelId && (
                            <Badge variant="outline" className="ml-2">
                              filtrado
                            </Badge>
                          )}
                        </TableCell>
                        <TableCell>
                          <span className="flex items-center gap-2 tabular-nums">
                            <Estrelas nota={h.ind.media} tamanho="xs" />
                            {h.ind.media?.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
                          </span>
                        </TableCell>
                        <TableCell className="text-right tabular-nums">{h.ind.respondidas}</TableCell>
                        <TableCell className="text-right tabular-nums">
                          {h.ind.percentual5 === null ? "—" : `${Math.round(h.ind.percentual5 * 100)}%`}
                        </TableCell>
                        <TableCell className="text-muted-foreground hidden text-right tabular-nums sm:table-cell">
                          {h.ind.pendentes}
                        </TableCell>
                      </TableRow>
                    )
                  })}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Avaliações ({filtradas.length.toLocaleString("pt-BR")})</CardTitle>
          <CardDescription>
            Identificadas — só o sindicato vê quem avaliou. O hotel vê a nota, as etiquetas (menos a do aplicativo)
            e o comentário, sem nome e só com o mês da estadia.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3">
          {filtradas.length === 0 ? (
            <p className="text-muted-foreground py-8 text-center text-sm">Nenhuma avaliação neste filtro.</p>
          ) : (
            <>
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Filiado</TableHead>
                      <TableHead className="hidden md:table-cell">Hotel</TableHead>
                      <TableHead className="hidden sm:table-cell">Estadia</TableHead>
                      <TableHead>Avaliação</TableHead>
                      <TableHead>Situação</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {pag.linhas.map((a) => (
                      <TableRow key={a.id} className="align-top">
                        <TableCell className="max-w-48 font-medium whitespace-normal">
                          {a.filiadoId ? (
                            <Link href={`/painel/filiados/${a.filiadoId}`} className="hover:underline">
                              {a.filiadoNome ?? "Filiado"}
                            </Link>
                          ) : (
                            <span className="text-muted-foreground">Sem filiado</span>
                          )}
                          <span className="text-muted-foreground block text-xs font-normal md:hidden">
                            {a.hotelNome ?? "Hotel"}
                          </span>
                        </TableCell>
                        <TableCell className="text-muted-foreground hidden max-w-48 whitespace-normal md:table-cell">
                          {a.hotelNome ?? "Hotel"}
                        </TableCell>
                        <TableCell className="text-muted-foreground hidden text-xs whitespace-nowrap sm:table-cell">
                          {formatarData(a.checkIn)}
                          <br />a {formatarData(a.checkOut)}
                        </TableCell>
                        <TableCell className="max-w-md min-w-56 whitespace-normal">
                          {a.situacao === "pendente" ? (
                            <span className="text-muted-foreground text-xs">Ainda não avaliou</span>
                          ) : (
                            <div className="grid gap-1.5">
                              <span className="flex items-center gap-2 text-xs">
                                <Estrelas nota={a.nota} />
                                {a.nota !== null && <span className="text-muted-foreground">{ROTULO_NOTA[a.nota]}</span>}
                              </span>
                              <EtiquetasDaAvaliacao a={a} />
                              {a.comentario && (
                                <div className="grid gap-1">
                                  <p className="text-sm whitespace-pre-line">
                                    <MessageSquareText className="text-muted-foreground mr-1 inline size-3.5 align-[-2px]" />
                                    {a.comentario}
                                  </p>
                                  <div className="flex flex-wrap items-center gap-2">
                                    {a.ocultaHotel && (
                                      <Badge variant="warning">
                                        <EyeOff />
                                        Oculto do hotel
                                      </Badge>
                                    )}
                                    <OcultarBotao id={a.id} oculta={a.ocultaHotel} />
                                  </div>
                                </div>
                              )}
                            </div>
                          )}
                        </TableCell>
                        <TableCell className="max-w-56 whitespace-normal">
                          <Situacao a={a} />
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
              {pag.totalPaginas > 1 && (
                <Paginacao
                  total={pag.total}
                  pagina={pag.pagina}
                  totalPaginas={pag.totalPaginas}
                  porPagina={lerPaginacao(sp, POR_PAGINA).porPagina}
                  padrao={POR_PAGINA}
                />
              )}
            </>
          )}
        </CardContent>
      </Card>
    </>
  )
}

function Cabecalho() {
  return (
    <div>
      <Button variant="ghost" size="sm" asChild className="-ml-2 mb-3">
        <Link href="/painel/hospedagem">
          <ArrowLeft />
          Hospedagem
        </Link>
      </Button>
      <h1 className="text-2xl font-semibold tracking-tight">Avaliações da hospedagem</h1>
      <p className="text-muted-foreground mt-1 text-xs">
        O que os filiados acharam das estadias: nota de 1 a 5, etiquetas e comentário. Notas 1 e 2 pedem providência.
      </p>
    </div>
  )
}

/** Etiquetas com o sentido da nota: elogio (5★) ou o que pode melhorar (1–4★). */
function EtiquetasDaAvaliacao({ a }: { a: AvaliacaoLinha }) {
  if (!a.etiquetas.length || a.nota === null) return null
  const elogio = etiquetasSaoElogio(a.nota)
  return (
    <div className="flex flex-wrap items-center gap-1">
      <span className="text-muted-foreground text-[11px]">{elogio ? "Destaques:" : "Melhorar:"}</span>
      {a.etiquetas.map((e) => (
        <Badge key={e} variant={elogio ? "success" : "warning"} className="text-[11px]">
          {rotuloEtiqueta(e)}
        </Badge>
      ))}
    </div>
  )
}

function Situacao({ a }: { a: AvaliacaoLinha }) {
  if (a.situacao === "pendente") return <Badge variant="outline">Pendente</Badge>
  if (a.tratadaEm) {
    return (
      <div className="grid gap-1 text-xs">
        <Badge variant="success">Tratada</Badge>
        <span className="text-muted-foreground">
          {a.tratadaPorNome ?? "—"} · {formatarDataHora(a.tratadaEm)}
        </span>
        {a.providencia && <span className="whitespace-pre-line">{a.providencia}</span>}
      </div>
    )
  }
  const baixa = a.nota !== null && a.nota <= NOTA_EXIGE_COMENTARIO
  return (
    <div className="grid gap-1 text-xs">
      <Badge variant={baixa ? "error" : "info"}>{baixa ? "Aguarda providência" : "Respondida"}</Badge>
      {a.respondidaEm && <span className="text-muted-foreground">{formatarDataHora(a.respondidaEm)}</span>}
    </div>
  )
}
