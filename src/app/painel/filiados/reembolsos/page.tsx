import type { Metadata } from "next"
import Link from "next/link"
import { ArrowLeft, HandCoins, ListPlus, Plus, Settings2 } from "lucide-react"

import { SituacaoBadge } from "@/app/painel/financeiro/situacao-badge"
import { ExportarXlsx } from "@/components/exportar-xlsx"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { requirePermissao } from "@/lib/auth"
import { formatarCpf } from "@/lib/cpf"
import { hojeSP } from "@/lib/db/comum"
import {
  POR_PAGINA,
  lancadoNoMes,
  listarReembolsos,
  totaisPorTipo,
} from "@/lib/db/filiacao-reembolsos-edicao"
import { formatarData, formatarMoeda } from "@/lib/formato"
import { rotuloTipoReembolso, TIPOS_REEMBOLSO } from "@/lib/reembolsos-tipos"

import { lerFiltroReembolsos } from "./filtro"

export const metadata: Metadata = { title: "Reembolsos a filiados — Confluir" }

/**
 * Reembolsos a filiados: a lista do que foi lançado, o quanto do mês já foi,
 * os totais por tipo do filtro (e a planilha), e os botões de lançar. Cada linha abre o reembolso; a situação é a da
 * ordem de pagamento no Financeiro.
 */
export default async function ReembolsosPage({
  searchParams,
}: {
  searchParams: Promise<{
    busca?: string
    de?: string
    ate?: string
    situacao?: string
    tipo?: string
    filiado?: string
    pagina?: string
    excluido?: string
  }>
}) {
  await requirePermissao("filiacao_reembolsos", ["filiacao_gestao"])
  const sp = await searchParams

  const filtro = lerFiltroReembolsos(sp)

  const hoje = hojeSP()
  const [{ linhas, total }, mes, totais] = await Promise.all([
    listarReembolsos(filtro),
    lancadoNoMes(hoje),
    totaisPorTipo(filtro),
  ])
  const soma = totais.reduce(
    (a, t) => ({ quantidade: a.quantidade + t.quantidade, total: a.total + t.total, pago: a.pago + t.pago, aberto: a.aberto + t.aberto }),
    { quantidade: 0, total: 0, pago: 0, aberto: 0 }
  )
  const periodo =
    filtro.de && filtro.ate
      ? `de ${formatarData(filtro.de)} a ${formatarData(filtro.ate)}`
      : filtro.de
        ? `desde ${formatarData(filtro.de)}`
        : filtro.ate
          ? `até ${formatarData(filtro.ate)}`
          : "todo o período"
  const filtrado = Boolean(filtro.busca || filtro.de || filtro.ate || filtro.situacao !== "todos" || filtro.tipo || filtro.filiadoId)
  const paginas = Math.max(1, Math.ceil(total / POR_PAGINA))
  const pagina = filtro.pagina ?? 1

  const url = (mudancas: Record<string, string | number | undefined>) => {
    const p = new URLSearchParams()
    const base: Record<string, string | number | undefined> = {
      busca: filtro.busca || undefined,
      de: filtro.de,
      ate: filtro.ate,
      situacao: filtro.situacao === "todos" ? undefined : filtro.situacao,
      tipo: filtro.tipo,
      filiado: filtro.filiadoId,
      pagina: pagina > 1 ? pagina : undefined,
      ...mudancas,
    }
    for (const [k, v] of Object.entries(base)) if (v !== undefined && v !== "") p.set(k, String(v))
    const s = p.toString()
    return `/painel/filiados/reembolsos${s ? `?${s}` : ""}`
  }

  return (
    <>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <Button asChild variant="ghost" size="sm" className="-ml-2 mb-3">
            <Link href="/painel/filiados">
              <ArrowLeft />
              Filiados
            </Link>
          </Button>
          <h1 className="text-2xl font-semibold tracking-tight">Reembolsos a filiados</h1>
          <p className="text-muted-foreground mt-1 text-sm">
            Valores que a entidade devolve ao filiado — desconto salarial de greve, cobrança indevida, despesa em atividade sindical. Cada lançamento gera a
            ordem de pagamento.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button asChild variant="outline">
            <Link href="/painel/filiados/reembolsos/configuracao">
              <Settings2 />
              Configuração
            </Link>
          </Button>
          <Button asChild variant="outline">
            <Link href="/painel/filiados/reembolsos/lote">
              <ListPlus />
              Lançar em lote
            </Link>
          </Button>
          <Button asChild>
            <Link href="/painel/filiados/reembolsos/novo">
              <Plus />
              Lançar reembolso
            </Link>
          </Button>
        </div>
      </div>

      {sp.excluido && (
        <Alert>
          <AlertDescription>Lançamento desfeito.</AlertDescription>
        </Alert>
      )}

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="self-start">
          <CardHeader>
            <CardDescription>Lançado neste mês</CardDescription>
            <CardTitle className="text-2xl tabular-nums">{formatarMoeda(mes.total)}</CardTitle>
            <p className="text-muted-foreground text-xs">{mes.quantidade} reembolso(s)</p>
          </CardHeader>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="text-base">Totais por tipo</CardTitle>
            <CardDescription>
              Pela data de referência, {periodo}
              {filtrado && " — com os filtros da lista abaixo"}. Pago é o que a ordem já pagou; em aberto, o que
              ainda está no Financeiro.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {totais.length === 0 ? (
              <p className="text-muted-foreground text-sm">Nenhum reembolso com esses filtros.</p>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Tipo</TableHead>
                      <TableHead className="text-right">Qtde.</TableHead>
                      <TableHead className="text-right">Lançado</TableHead>
                      <TableHead className="text-right">Pago</TableHead>
                      <TableHead className="text-right">Em aberto</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {totais.map((t) => (
                      <TableRow key={t.tipo}>
                        <TableCell>
                          <Link href={url({ tipo: t.tipo, pagina: undefined })} className="hover:underline">
                            {rotuloTipoReembolso(t.tipo)}
                          </Link>
                        </TableCell>
                        <TableCell className="text-right tabular-nums">{t.quantidade.toLocaleString("pt-BR")}</TableCell>
                        <TableCell className="text-right whitespace-nowrap tabular-nums">{formatarMoeda(t.total)}</TableCell>
                        <TableCell className="text-right whitespace-nowrap tabular-nums">{formatarMoeda(t.pago)}</TableCell>
                        <TableCell className="text-right whitespace-nowrap tabular-nums">{formatarMoeda(t.aberto)}</TableCell>
                      </TableRow>
                    ))}
                    {totais.length > 1 && (
                      <TableRow className="font-medium">
                        <TableCell>Total</TableCell>
                        <TableCell className="text-right tabular-nums">{soma.quantidade.toLocaleString("pt-BR")}</TableCell>
                        <TableCell className="text-right whitespace-nowrap tabular-nums">{formatarMoeda(soma.total)}</TableCell>
                        <TableCell className="text-right whitespace-nowrap tabular-nums">{formatarMoeda(soma.pago)}</TableCell>
                        <TableCell className="text-right whitespace-nowrap tabular-nums">{formatarMoeda(soma.aberto)}</TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-3">
          <div className="grid gap-1.5">
            <CardTitle className="text-base">
              Lançamentos
              <span className="text-muted-foreground ml-2 text-sm font-normal">
                {total.toLocaleString("pt-BR")}
              </span>
            </CardTitle>
            <CardDescription>A situação é a da ordem de pagamento no Financeiro.</CardDescription>
          </div>
          <ExportarXlsx href="/painel/filiados/reembolsos/exportar" />
        </CardHeader>
        <CardContent className="grid gap-4">
          <form className="grid gap-3 sm:grid-cols-6" method="get">
            {filtro.filiadoId && <input type="hidden" name="filiado" value={filtro.filiadoId} />}
            <div className="grid gap-1.5 sm:col-span-2">
              <Label htmlFor="busca">Filiado</Label>
              <Input id="busca" name="busca" defaultValue={filtro.busca} placeholder="Nome ou CPF" />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="de">De</Label>
              <Input id="de" name="de" type="date" defaultValue={filtro.de ?? ""} />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="ate">Até</Label>
              <Input id="ate" name="ate" type="date" defaultValue={filtro.ate ?? ""} />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="situacao">Situação</Label>
              <select
                id="situacao"
                name="situacao"
                defaultValue={filtro.situacao}
                className="border-input bg-background h-8 rounded-md border px-2 text-sm"
              >
                <option value="todos">Todas</option>
                <option value="pendentes">A pagar</option>
                <option value="pagos">Pagos</option>
              </select>
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="tipo">Tipo</Label>
              <select
                id="tipo"
                name="tipo"
                defaultValue={filtro.tipo ?? ""}
                className="border-input bg-background h-8 rounded-md border px-2 text-sm"
              >
                <option value="">Todos</option>
                {TIPOS_REEMBOLSO.map((t) => (
                  <option key={t.valor} value={t.valor}>
                    {t.rotulo}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex items-end gap-2 sm:col-span-6">
              <Button type="submit" variant="secondary" size="sm">
                Filtrar
              </Button>
              {filtrado && (
                <Button asChild variant="ghost" size="sm">
                  <Link href="/painel/filiados/reembolsos">Limpar</Link>
                </Button>
              )}
            </div>
          </form>

          {linhas.length === 0 ? (
            <div className="text-muted-foreground flex flex-col items-center gap-2 py-10 text-center">
              <HandCoins className="size-6" />
              <p className="text-sm">Nenhum reembolso com esses filtros.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Data</TableHead>
                    <TableHead>Filiado</TableHead>
                    <TableHead>Justificativa</TableHead>
                    <TableHead className="text-right">Valor</TableHead>
                    <TableHead>Ordem</TableHead>
                    <TableHead>Situação</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {linhas.map((r) => (
                    <TableRow key={r.id}>
                      <TableCell className="whitespace-nowrap">
                        <Link href={`/painel/filiados/reembolsos/${r.id}`} className="hover:underline">
                          {formatarData(r.data)}
                        </Link>
                      </TableCell>
                      <TableCell>
                        {r.filiadoId ? (
                          <Link href={`/painel/filiados/${r.filiadoId}`} className="font-medium hover:underline">
                            {r.filiadoNome ?? "—"}
                          </Link>
                        ) : (
                          <span className="font-medium">{r.filiadoNome ?? "—"}</span>
                        )}
                        {r.filiadoCpf && (
                          <span className="text-muted-foreground block text-xs tabular-nums">
                            {formatarCpf(r.filiadoCpf)}
                          </span>
                        )}
                      </TableCell>
                      <TableCell className="max-w-72 whitespace-normal">
                        <Link href={`/painel/filiados/reembolsos/${r.id}`} className="hover:underline">
                          {r.justificativa ?? "—"}
                        </Link>
                        <span className="text-muted-foreground block text-xs">{rotuloTipoReembolso(r.tipo)}</span>
                        {r.projeto && (
                          <span className="text-muted-foreground block text-xs">{r.projeto}</span>
                        )}
                      </TableCell>
                      <TableCell className="text-right whitespace-nowrap tabular-nums">
                        {formatarMoeda(r.ordem?.valor_pago ?? r.valor)}
                      </TableCell>
                      <TableCell className="text-muted-foreground whitespace-nowrap text-xs tabular-nums">
                        {r.ordem && !r.ordem.excluido ? (
                          <Link href={`/painel/financeiro/ordens/${r.ordem.id}`} className="hover:underline">
                            {r.ordem.codigo ?? "abrir"}
                          </Link>
                        ) : (
                          "—"
                        )}
                      </TableCell>
                      <TableCell>
                        {r.ordem && !r.ordem.excluido ? (
                          <SituacaoBadge situacao={r.ordem.situacao} />
                        ) : (
                          <span className="text-muted-foreground text-xs">sem ordem</span>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}

          {paginas > 1 && (
            <div className="text-muted-foreground flex items-center justify-between text-sm">
              <span>
                Página {pagina} de {paginas}
              </span>
              <div className="flex gap-2">
                {pagina > 1 && (
                  <Button asChild variant="outline" size="sm">
                    <Link href={url({ pagina: pagina - 1 })}>Anterior</Link>
                  </Button>
                )}
                {pagina < paginas && (
                  <Button asChild variant="outline" size="sm">
                    <Link href={url({ pagina: pagina + 1 })}>Próxima</Link>
                  </Button>
                )}
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </>
  )
}
