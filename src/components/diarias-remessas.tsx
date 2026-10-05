import Link from "next/link"
import { ArrowLeft, Paperclip, Send } from "lucide-react"

import { SituacaoBadge } from "@/app/painel/financeiro/situacao-badge"
import { SituacaoDiariaBadge } from "@/components/diarias"
import { EnviarRemessaForm } from "@/components/enviar-remessa-form"
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
 * Diretoria); muda só a base do link e a action de envio (permissão).
 */

function periodo(inicio: string | null, termino: string | null): string {
  if (!inicio) return "—"
  return termino && termino !== inicio ? `${formatarData(inicio)} – ${formatarData(termino)}` : formatarData(inicio)
}

/** Valor que a diária leva: líquida das infrações, mais as despesas. */
function valorDaDiaria(s: SolicitacaoDiaria): number {
  return Math.round(((s.valor_total ?? 0) - s.valorDescontos + s.valorDespesas) * 100) / 100
}

export function SituacaoRemessaBadge({ remessa }: { remessa: Pick<RemessaNova, "enviada"> }) {
  return remessa.enviada ? (
    <Badge variant="outline" className="border-success/40 text-success-fg">Enviada</Badge>
  ) : (
    <Badge variant="outline" className="border-warning/50 text-warning-fg">Aberta</Badge>
  )
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
        Nenhuma remessa ainda — a primeira diária lançada abre a remessa do beneficiário.
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
            <TableHead className="text-right">Total aprovado</TableHead>
            <TableHead>Situação</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {remessas.map((r) => (
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
                {r.contagem.aprovada} aprovada(s)
                {r.contagem.aguardando > 0 && (
                  <span className="text-warning-fg"> · {r.contagem.aguardando} aguardando</span>
                )}
              </TableCell>
              <TableCell className="text-right whitespace-nowrap tabular-nums">{formatarMoeda(r.valorTotal)}</TableCell>
              <TableCell>
                <div className="flex flex-wrap items-center gap-1.5">
                  <SituacaoRemessaBadge remessa={r} />
                  {r.ordemId && <SituacaoBadge situacao={r.ordemSituacao} />}
                </div>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  )
}

export function DetalheRemessaDiarias({
  remessa,
  solicitacoes,
  voltar,
  diariaBase,
  despesasUrls,
  acaoEnviar,
  enviada,
}: {
  remessa: RemessaNova
  solicitacoes: SolicitacaoDiaria[]
  voltar: { href: string; rotulo: string }
  /** Base do link de cada diária (ex.: /painel/pessoal/diarias). */
  diariaBase: string
  despesasUrls: Map<string, string | null>
  /** Sem action = quem vê não pode enviar. */
  acaoEnviar?: (prev: { erro?: string }, formData: FormData) => Promise<{ erro?: string }>
  enviada?: string | null
}) {
  const aprovadas = solicitacoes.filter((s) => s.situacao === "aprovada")
  const aguardando = solicitacoes.filter((s) => s.situacao === "aguardando")
  const totalDiarias = aprovadas.reduce((a, s) => a + (s.valor_total ?? 0) - s.valorDescontos, 0)
  const totalDespesas = aprovadas.reduce((a, s) => a + s.valorDespesas, 0)
  const total = Math.round((totalDiarias + totalDespesas) * 100) / 100

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

      {enviada && (
        <Alert className="border-success/40 text-success-fg">
          <AlertDescription>
            Remessa enviada — a ordem de pagamento {enviada} seguiu para autorização no Financeiro.
          </AlertDescription>
        </Alert>
      )}

      <div className="grid gap-3 sm:grid-cols-3">
        <Card className="gap-1 py-4">
          <CardHeader className="px-4">
            <CardDescription className="text-xs">Diárias aprovadas (líquidas)</CardDescription>
            <CardTitle className="text-lg tabular-nums">{formatarMoeda(totalDiarias)}</CardTitle>
          </CardHeader>
          <CardContent className="px-4">
            <p className="text-muted-foreground text-xs">{aprovadas.length} diária(s)</p>
          </CardContent>
        </Card>
        <Card className="gap-1 py-4">
          <CardHeader className="px-4">
            <CardDescription className="text-xs">Despesas das diárias aprovadas</CardDescription>
            <CardTitle className="text-lg tabular-nums">{formatarMoeda(totalDespesas)}</CardTitle>
          </CardHeader>
          <CardContent className="px-4">
            <p className="text-muted-foreground text-xs">hospedagem, transporte, alimentação…</p>
          </CardContent>
        </Card>
        <Card className="gap-1 py-4">
          <CardHeader className="px-4">
            <CardDescription className="text-xs">Total da remessa</CardDescription>
            <CardTitle className="text-lg tabular-nums">{formatarMoeda(total)}</CardTitle>
          </CardHeader>
          <CardContent className="px-4">
            <p className="text-muted-foreground text-xs">
              {aguardando.length ? `${aguardando.length} diária(s) ainda aguardando avaliação` : "nada aguardando avaliação"}
            </p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Diárias da remessa</CardTitle>
          <CardDescription>
            Entram na soma só as aprovadas; reprovadas e canceladas ficam registradas aqui.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3">
          {solicitacoes.length === 0 && (
            <p className="text-muted-foreground text-sm">Nenhuma diária nesta remessa.</p>
          )}
          {solicitacoes.map((s) => (
            <div key={s.id} className="rounded-md border p-3 text-sm">
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
                  <SituacaoDiariaBadge situacao={s.situacao} />
                  <span className="font-medium tabular-nums">{formatarMoeda(valorDaDiaria(s))}</span>
                </div>
              </div>
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
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Send className="text-muted-foreground size-4" />
            Pagamento
          </CardTitle>
          <CardDescription>
            A remessa acumula as diárias do beneficiário até ser enviada. O envio gera uma ordem de
            pagamento com a soma das diárias aprovadas e das despesas, rateada por conta contábil.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {remessa.enviada ? (
            <p className="text-sm">
              Enviada em {formatarDataHora(remessa.enviadaEm)}
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
          ) : acaoEnviar ? (
            <EnviarRemessaForm
              remessaId={remessa.id}
              acao={acaoEnviar}
              total={formatarMoeda(total)}
              aprovadas={aprovadas.length}
              aguardando={aguardando.length}
            />
          ) : (
            <p className="text-muted-foreground text-sm">
              Aberta — quem gere as diárias envia a remessa para pagamento.
            </p>
          )}
        </CardContent>
      </Card>
    </>
  )
}
