import Link from "next/link"
import { AlertTriangle, ArrowLeft, ClipboardCheck, History, Paperclip } from "lucide-react"

import { SituacaoBadge } from "@/app/painel/financeiro/situacao-badge"
import { SituacaoDiariaBadge } from "@/components/diarias"
import {
  AvaliacaoRemessaForm,
  ReenviarRemessaForm,
  RetirarDiariaBotao,
} from "@/components/remessa-avaliacao-form"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import type { SolicitacaoDiaria } from "@/lib/db/diarias"
import type { RemessaNova } from "@/lib/db/diarias-remessas"
import { formatarData, formatarDataHora, formatarMoeda } from "@/lib/formato"

/**
 * Remessas de diárias — as MESMAS telas nas duas portas (Pessoal e
 * Diretoria); muda só a base do link. Desde 08/10 a avaliação é da REMESSA:
 * aprovar (nasce a ordem rateada) ou devolver com as não conformidades.
 */

function periodo(inicio: string | null, termino: string | null): string {
  if (!inicio) return "—"
  return termino && termino !== inicio ? `${formatarData(inicio)} – ${formatarData(termino)}` : formatarData(inicio)
}

/** Valor que a diária leva: líquida das infrações, mais as despesas. */
function valorDaDiaria(s: SolicitacaoDiaria): number {
  return Math.round(((s.valor_total ?? 0) - s.valorDescontos + s.valorDespesas) * 100) / 100
}

function rotuloDiaria(s: SolicitacaoDiaria): string {
  return `${s.tipoNome ?? "Diária"} × ${s.quantidade ?? 1} · ${periodo(s.data_inicio, s.data_termino)} · ${formatarMoeda(valorDaDiaria(s))}`
}

export function SituacaoRemessaBadge({ remessa }: { remessa: Pick<RemessaNova, "enviada" | "situacao"> }) {
  if (remessa.enviada || remessa.situacao === "aprovada") {
    return <Badge variant="outline" className="border-success/40 text-success-fg">Aprovada</Badge>
  }
  if (remessa.situacao === "devolvida") {
    return <Badge variant="outline" className="border-destructive/40 text-destructive">Devolvida</Badge>
  }
  if (remessa.situacao === "reenviada") {
    return <Badge variant="info">Reenviada</Badge>
  }
  return <Badge variant="outline" className="border-warning/50 text-warning-fg">Em avaliação</Badge>
}

export function ListaRemessasDiarias({
  remessas,
  base,
}: {
  remessas: RemessaNova[]
  /** Ex.: /painel/pessoal/diarias/remessas */
  base: string
}) {
  if (remessas.length === 0) {
    return (
      <p className="text-muted-foreground py-6 text-center text-sm">
        Nenhuma remessa aqui.
      </p>
    )
  }
  return (
    <div className="overflow-x-auto">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Remessa</TableHead>
            <TableHead>Beneficiário</TableHead>
            <TableHead className="hidden md:table-cell">Período</TableHead>
            <TableHead>Diárias</TableHead>
            <TableHead className="text-right">Valor</TableHead>
            <TableHead>Situação</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {remessas.map((r) => {
            const fora = r.contagem.cancelada + r.contagem.reprovada
            return (
              <TableRow key={r.id}>
                <TableCell>
                  <Link href={`${base}/${r.id}`} className="text-primary tabular-nums hover:underline">
                    {r.codigo ?? "(sem código)"}
                  </Link>
                </TableCell>
                <TableCell className="max-w-56 truncate">{r.beneficiarioNome ?? "—"}</TableCell>
                <TableCell className="text-muted-foreground hidden whitespace-nowrap md:table-cell">
                  {periodo(r.inicio, r.termino)}
                </TableCell>
                <TableCell className="text-xs whitespace-nowrap">
                  {r.contagem.aguardando + r.contagem.aprovada} diária(s)
                  {fora > 0 && <span className="text-muted-foreground"> · {fora} fora</span>}
                </TableCell>
                <TableCell className="text-right whitespace-nowrap tabular-nums">{formatarMoeda(r.valorTotal)}</TableCell>
                <TableCell>
                  <div className="flex flex-wrap items-center gap-1.5">
                    <SituacaoRemessaBadge remessa={r} />
                    {r.ordemId && <SituacaoBadge situacao={r.ordemSituacao} />}
                  </div>
                </TableCell>
              </TableRow>
            )
          })}
        </TableBody>
      </Table>
    </div>
  )
}

const ROTULO_ACAO: Record<string, string> = {
  devolvida: "Devolvida",
  reenviada: "Reenviada",
  aprovada: "Aprovada",
}

export function DetalheRemessaDiarias({
  remessa,
  solicitacoes,
  voltar,
  diariaBase,
  despesasUrls,
  podeAvaliar,
  geraDiarias,
  infracoes,
  destinoOrdem,
}: {
  /** Como a ordem nasce para quem vê (regra das diárias × alçada dele). */
  destinoOrdem: string
  remessa: RemessaNova
  solicitacoes: SolicitacaoDiaria[]
  voltar: { href: string; rotulo: string }
  /** Base do link de cada diária (ex.: /painel/pessoal/diarias). */
  diariaBase: string
  despesasUrls: Map<string, string | null>
  /** Quem vê pode aprovar/devolver (nunca a própria remessa). */
  podeAvaliar: boolean
  /** Quem vê gere as diárias da porta (retira diária, reenvia pela pessoa). */
  geraDiarias: boolean
  /** Infrações pendentes do beneficiário (desconto na aprovação). */
  infracoes: { quantidade: number; total: number } | null
}) {
  const validas = solicitacoes.filter((s) => s.situacao === "aguardando" || s.situacao === "aprovada")
  const aguardando = solicitacoes.filter((s) => s.situacao === "aguardando")
  const totalDiarias = validas.reduce((a, s) => a + (s.valor_total ?? 0) - s.valorDescontos, 0)
  const totalDespesas = validas.reduce((a, s) => a + s.valorDespesas, 0)
  const total = Math.round((totalDiarias + totalDespesas) * 100) / 100
  const devolvida = !remessa.enviada && remessa.situacao === "devolvida"
  const mostrarPendencias = !remessa.enviada && (remessa.situacao === "devolvida" || remessa.situacao === "reenviada")
  const formAvaliacao = (
    <AvaliacaoRemessaForm
      remessaId={remessa.id}
      total={formatarMoeda(total)}
      diarias={aguardando.map((s) => ({ id: s.id, rotulo: rotuloDiaria(s) }))}
      infracoes={infracoes ? { quantidade: infracoes.quantidade, total: formatarMoeda(infracoes.total) } : null}
      destinoOrdem={destinoOrdem}
    />
  )

  return (
    <>
      <div>
        <Button variant="ghost" size="sm" asChild className="-ml-2 mb-3">
          <Link href={voltar.href}>
            <ArrowLeft />
            {voltar.rotulo}
          </Link>
        </Button>
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-2xl font-semibold tracking-tight">Remessa {remessa.codigo ?? ""}</h1>
          <SituacaoRemessaBadge remessa={remessa} />
        </div>
        <p className="text-muted-foreground mt-1 text-xs">
          {remessa.beneficiarioNome ?? "(sem beneficiário)"}
          {remessa.quadro === "diretor" ? " · diretoria" : " · funcionário(a)"}
          {remessa.departamentoNome ? ` · ${remessa.departamentoNome}` : ""} · aberta em{" "}
          {formatarDataHora(remessa.createdAt)}
        </p>
      </div>

      {devolvida && (
        <Alert variant="destructive">
          <AlertTriangle />
          <AlertDescription>
            <span className="font-medium">
              Devolvida em {formatarDataHora(remessa.devolvidaEm)}
              {remessa.devolvidaPor ? ` por ${remessa.devolvidaPor}` : ""}:
            </span>{" "}
            <span className="whitespace-pre-wrap">{remessa.devolucaoObservacao ?? "—"}</span>
            <span className="mt-1 block text-xs">
              Corrija as diárias apontadas (retire, ajuste as despesas ou relance) e reenvie a remessa.
            </span>
          </AlertDescription>
        </Alert>
      )}

      <div className="grid gap-3 sm:grid-cols-3">
        <Card className="gap-1 py-4">
          <CardHeader className="px-4">
            <CardDescription className="text-xs">Diárias{remessa.enviada ? " (líquidas)" : ""}</CardDescription>
            <CardTitle className="text-lg tabular-nums">{formatarMoeda(totalDiarias)}</CardTitle>
          </CardHeader>
          <CardContent className="px-4">
            <p className="text-muted-foreground text-xs">{validas.length} diária(s)</p>
          </CardContent>
        </Card>
        <Card className="gap-1 py-4">
          <CardHeader className="px-4">
            <CardDescription className="text-xs">Despesas das diárias</CardDescription>
            <CardTitle className="text-lg tabular-nums">{formatarMoeda(totalDespesas)}</CardTitle>
          </CardHeader>
          <CardContent className="px-4">
            <p className="text-muted-foreground text-xs">hospedagem, transporte, alimentação…</p>
          </CardContent>
        </Card>
        <Card className="gap-1 py-4">
          <CardHeader className="px-4">
            <CardDescription className="text-xs">Valor da remessa</CardDescription>
            <CardTitle className="text-lg tabular-nums">{formatarMoeda(total)}</CardTitle>
          </CardHeader>
          <CardContent className="px-4">
            <p className="text-muted-foreground text-xs">
              {remessa.enviada
                ? "valor da ordem de pagamento"
                : infracoes
                  ? "antes do desconto das infrações"
                  : "vira a ordem de pagamento ao aprovar"}
            </p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Diárias da remessa</CardTitle>
          <CardDescription>
            Entram no valor as aguardando e as aprovadas; retiradas e canceladas ficam registradas aqui.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3">
          {solicitacoes.length === 0 && (
            <p className="text-muted-foreground text-sm">Nenhuma diária nesta remessa.</p>
          )}
          {solicitacoes.map((s) => {
            const pendencia = mostrarPendencias && s.situacao === "aguardando" ? s.pendenciaObservacao : null
            return (
              <div
                key={s.id}
                className={`rounded-md border p-3 text-sm ${pendencia ? "border-destructive/50 bg-destructive/5" : ""}`}
              >
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <Link href={`${diariaBase}/${s.id}`} className="text-primary font-medium hover:underline">
                      {s.tipoNome ?? "Diária"} × {s.quantidade ?? 1}
                    </Link>
                    <span className="text-muted-foreground"> · {periodo(s.data_inicio, s.data_termino)}</span>
                    {s.departamentoNome && <span className="text-muted-foreground"> · {s.departamentoNome}</span>}
                    <p className="text-muted-foreground text-xs">{s.motivo ?? "—"}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    {!remessa.enviada && geraDiarias && s.situacao === "aguardando" && (
                      <RetirarDiariaBotao remessaId={remessa.id} diariaId={s.id} />
                    )}
                    <SituacaoDiariaBadge situacao={s.situacao} />
                    <span className="font-medium tabular-nums">{formatarMoeda(valorDaDiaria(s))}</span>
                  </div>
                </div>
                {pendencia && (
                  <p className="text-destructive mt-2 flex items-start gap-1.5 text-xs font-medium">
                    <AlertTriangle className="mt-px size-3.5 shrink-0" />
                    Não conformidade: {pendencia}
                  </p>
                )}
                {(s.situacao === "cancelada" || s.situacao === "reprovada") && s.avaliacao_observacao && (
                  <p className="text-muted-foreground mt-1 text-xs">{s.avaliacao_observacao}</p>
                )}
                <ul className="text-muted-foreground mt-2 grid gap-0.5 text-xs">
                  <li className="flex justify-between gap-2">
                    <span>
                      Diária: {s.quantidade ?? 1} × {formatarMoeda(s.valor_unitario)}
                    </span>
                    <span className="tabular-nums">{formatarMoeda(s.valor_total)}</span>
                  </li>
                  {s.valorDescontos > 0 && (
                    <li className="flex justify-between gap-2">
                      <span>Infrações de trânsito descontadas</span>
                      <span className="tabular-nums">− {formatarMoeda(s.valorDescontos)}</span>
                    </li>
                  )}
                  {s.despesas.map((d) => {
                    const url = despesasUrls.get(d.id)
                    return (
                      <li key={d.id} className="flex justify-between gap-2">
                        <span className="min-w-0">
                          {d.tipoNome ?? "Despesa"}
                          {d.descricao ? ` — ${d.descricao}` : ""}
                          {url && (
                            <a
                              href={url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-primary ml-2 inline-flex items-center gap-1 hover:underline"
                            >
                              <Paperclip className="size-3" />
                              comprovante
                            </a>
                          )}
                        </span>
                        <span className="tabular-nums">{formatarMoeda(d.valor)}</span>
                      </li>
                    )
                  })}
                </ul>
              </div>
            )
          })}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <ClipboardCheck className="text-muted-foreground size-4" />
            Avaliação da remessa
          </CardTitle>
          <CardDescription>
            A remessa é avaliada inteira. Aprovada, nasce uma ordem de pagamento com o valor dela,
            rateada pelos centros de custo configurados (Diárias → Centros de custo) — {destinoOrdem}. Com alguma não
            conformidade, devolva com a observação — no geral e em cada diária com problema.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {remessa.enviada ? (
            <p className="text-sm">
              Aprovada em {formatarDataHora(remessa.enviadaEm)}
              {remessa.enviadaPor ? ` por ${remessa.enviadaPor}` : ""}.
              {remessa.ordemId && (
                <>
                  {" "}Ordem{" "}
                  <Link href={`/painel/financeiro/ordens/${remessa.ordemId}`} className="text-primary tabular-nums hover:underline">
                    {remessa.ordemCodigo ?? "(sem código)"}
                  </Link>
                  {remessa.ordemSituacao ? ` · ${remessa.ordemSituacao}` : ""}.
                </>
              )}
            </p>
          ) : devolvida ? (
            <div className="grid gap-4">
              {geraDiarias ? (
                <ReenviarRemessaForm remessaId={remessa.id} />
              ) : (
                <p className="text-muted-foreground text-sm">Aguardando a correção de quem lançou as diárias.</p>
              )}
              {podeAvaliar && aguardando.length > 0 && (
                <details className="rounded-md border p-3">
                  <summary className="cursor-pointer text-sm font-medium">
                    Avaliar de novo sem esperar o reenvio
                  </summary>
                  <div className="mt-3">{formAvaliacao}</div>
                </details>
              )}
            </div>
          ) : podeAvaliar && aguardando.length > 0 ? (
            formAvaliacao
          ) : (
            <p className="text-muted-foreground text-sm">
              {aguardando.length === 0
                ? "Nenhuma diária aguardando nesta remessa."
                : "Aguardando a avaliação de quem gere as diárias."}
            </p>
          )}
        </CardContent>
      </Card>

      {remessa.historico.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <History className="text-muted-foreground size-4" />
              Histórico da avaliação
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ol className="grid gap-2 text-sm">
              {remessa.historico.map((h, i) => (
                <li key={i} className="border-l-2 pl-3">
                  <p>
                    <span className="font-medium">{ROTULO_ACAO[h.acao] ?? h.acao}</span>
                    <span className="text-muted-foreground">
                      {" "}· {formatarDataHora(h.em)}
                      {h.porNome ? ` · ${h.porNome}` : ""}
                    </span>
                  </p>
                  {h.observacao && <p className="text-muted-foreground text-xs whitespace-pre-wrap">{h.observacao}</p>}
                  {h.pendencias && h.pendencias.length > 0 && (
                    <ul className="text-muted-foreground mt-0.5 list-disc pl-4 text-xs">
                      {h.pendencias.map((p) => {
                        const s = solicitacoes.find((x) => x.id === p.diariaId)
                        return (
                          <li key={p.diariaId}>
                            {s ? `${s.tipoNome ?? "Diária"} (${periodo(s.data_inicio, s.data_termino)})` : "Diária"}: {p.observacao}
                          </li>
                        )
                      })}
                    </ul>
                  )}
                </li>
              ))}
            </ol>
          </CardContent>
        </Card>
      )}
    </>
  )
}
