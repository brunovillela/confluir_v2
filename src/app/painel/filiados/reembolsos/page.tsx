import type { Metadata } from "next"
import Link from "next/link"
import { ArrowLeft, HandCoins, Plus, Settings2 } from "lucide-react"

import { SituacaoBadge } from "@/app/painel/financeiro/situacao-badge"
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
  configReembolsoCompleta,
  lancadoNoMes,
  listarReembolsos,
  type FiltroReembolsos,
} from "@/lib/db/filiacao-reembolsos-edicao"
import { formatarData, formatarMoeda } from "@/lib/formato"

export const metadata: Metadata = { title: "Reembolsos a filiados — Confluir" }

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/**
 * Reembolsos por participação: a lista do que foi lançado, o quanto do mês já
 * foi, e o botão de lançar. Cada linha abre o reembolso; a situação é a da
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
    filiado?: string
    pagina?: string
    excluido?: string
  }>
}) {
  await requirePermissao("filiacao_reembolsos", ["filiacao_gestao"])
  const sp = await searchParams

  const filtro: FiltroReembolsos = {
    busca: sp.busca ?? "",
    de: sp.de && /^\d{4}-\d{2}-\d{2}$/.test(sp.de) ? sp.de : undefined,
    ate: sp.ate && /^\d{4}-\d{2}-\d{2}$/.test(sp.ate) ? sp.ate : undefined,
    situacao: sp.situacao === "pagos" || sp.situacao === "pendentes" ? sp.situacao : "todos",
    filiadoId: sp.filiado && UUID.test(sp.filiado) ? sp.filiado : undefined,
    pagina: Math.max(1, Number(sp.pagina) || 1),
  }

  const hoje = hojeSP()
  const [{ linhas, total }, mes, config] = await Promise.all([
    listarReembolsos(filtro),
    lancadoNoMes(hoje),
    configReembolsoCompleta(),
  ])
  const paginas = Math.max(1, Math.ceil(total / POR_PAGINA))
  const pagina = filtro.pagina ?? 1

  const url = (mudancas: Record<string, string | number | undefined>) => {
    const p = new URLSearchParams()
    const base: Record<string, string | number | undefined> = {
      busca: filtro.busca || undefined,
      de: filtro.de,
      ate: filtro.ate,
      situacao: filtro.situacao === "todos" ? undefined : filtro.situacao,
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
            Reembolso por participação em reunião, ato ou assembleia. Cada lançamento gera a
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

      <div className="grid gap-4 sm:grid-cols-3">
        <Card>
          <CardHeader>
            <CardDescription>Valor de cada reembolso</CardDescription>
            <CardTitle className="text-2xl tabular-nums">
              {config.valorReembolso != null ? formatarMoeda(config.valorReembolso) : "—"}
            </CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader>
            <CardDescription>Lançado neste mês</CardDescription>
            <CardTitle className="text-2xl tabular-nums">{formatarMoeda(mes.total)}</CardTitle>
            <p className="text-muted-foreground text-xs">{mes.quantidade} reembolso(s)</p>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader>
            <CardDescription>Teto mensal</CardDescription>
            <CardTitle className="text-2xl tabular-nums">
              {config.orcamentoLimite && config.orcamentoMensal != null
                ? formatarMoeda(config.orcamentoMensal)
                : "sem teto"}
            </CardTitle>
            {config.orcamentoLimite && config.orcamentoMensal != null && (
              <p className="text-muted-foreground text-xs">
                restam {formatarMoeda(Math.max(0, config.orcamentoMensal - mes.total))}
              </p>
            )}
          </CardHeader>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            Lançamentos
            <span className="text-muted-foreground ml-2 text-sm font-normal">
              {total.toLocaleString("pt-BR")}
            </span>
          </CardTitle>
          <CardDescription>A situação é a da ordem de pagamento no Financeiro.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4">
          <form className="grid gap-3 sm:grid-cols-5" method="get">
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
            <div className="flex items-end gap-2 sm:col-span-5">
              <Button type="submit" variant="secondary" size="sm">
                Filtrar
              </Button>
              {(filtro.busca || filtro.de || filtro.ate || filtro.situacao !== "todos" || filtro.filiadoId) && (
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
