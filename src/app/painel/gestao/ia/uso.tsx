import Link from "next/link"

import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import type { LinhaUso } from "@/lib/db/ia-uso"

/** Peças de leitura do uso da IA (componentes de servidor, sem estado). */

const inteiro = new Intl.NumberFormat("pt-BR")
const compacto = new Intl.NumberFormat("pt-BR", { notation: "compact", maximumFractionDigits: 1 })

export function tokens(n: number): string {
  return n >= 100_000 ? compacto.format(n) : inteiro.format(n)
}

export function dolares(n: number | null): string {
  if (n === null) return "—"
  if (n > 0 && n < 0.01) return "< US$ 0,01"
  return `US$ ${n.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

/** Número em destaque com rótulo — o indicador não precisa de gráfico. */
export function Indicador({ rotulo, valor, detalhe }: { rotulo: string; valor: string; detalhe?: string | null }) {
  return (
    <div className="rounded-lg border p-3">
      <p className="text-muted-foreground text-xs">{rotulo}</p>
      <p className="mt-1 text-xl font-semibold tabular-nums">{valor}</p>
      {detalhe && <p className="text-muted-foreground mt-0.5 text-xs">{detalhe}</p>}
    </div>
  )
}

/**
 * Tokens por dia: uma série, barras finas da cor primária ancoradas na base,
 * 2px de vão entre elas e o valor no hover (a tabela "por dia" fica abaixo,
 * para quem não usa mouse).
 */
export function GraficoDiario({ dias: comUso, de, ate }: { dias: LinhaUso[]; de: Date; ate: Date }) {
  if (comUso.length === 0) return null
  // Todos os dias do período (fuso de Brasília), com zero onde não houve uso:
  // a linha do tempo fica contínua mesmo com um dia só.
  const porDia = new Map(comUso.map((d) => [d.chave, d]))
  const dias: LinhaUso[] = []
  const umDia = 24 * 3600_000
  const fim = ate.getTime()
  for (let t = de.getTime(); t < fim && dias.length < 120; t += umDia) {
    const chave = new Date(t - 3 * 3600_000).toISOString().slice(0, 10)
    if (dias.some((d) => d.chave === chave)) continue
    dias.push(
      porDia.get(chave) ?? {
        chave,
        rotulo: chave.split("-").reverse().join("/"),
        detalhe: null,
        chamadas: 0,
        falhas: 0,
        bloqueadas: 0,
        tokensEntrada: 0,
        tokensEntradaCache: 0,
        tokensSaida: 0,
        tokensRaciocinio: 0,
        custo: null,
        ultima: null,
      }
    )
  }
  const max = Math.max(...dias.map((d) => d.tokensEntrada + d.tokensSaida), 1)
  return (
    <figure className="grid gap-2">
      <figcaption className="text-muted-foreground text-xs">Tokens por dia (entrada + saída)</figcaption>
      <div className="flex h-32 items-end justify-between gap-0.5 border-b" role="img" aria-label="Tokens de IA por dia no período">
        {dias.map((d) => {
          const total = d.tokensEntrada + d.tokensSaida
          const altura = total > 0 ? Math.max(2, Math.round((total / max) * 100)) : 0
          return (
            <div key={d.chave} className="group relative flex h-full min-w-1 max-w-6 flex-1 items-end">
              <div className="bg-primary group-hover:bg-primary/80 w-full rounded-t-[4px]" style={{ height: `${altura}%` }} />
              <div className="bg-popover text-popover-foreground pointer-events-none absolute bottom-full left-1/2 z-10 mb-1 hidden -translate-x-1/2 rounded-md border px-2 py-1 text-xs whitespace-nowrap shadow-sm group-hover:block">
                <span className="font-medium">{d.rotulo}</span>
                <span className="block tabular-nums">{tokens(total)} tokens · {inteiro.format(d.chamadas)} chamadas</span>
                {d.custo !== null && <span className="block tabular-nums">{dolares(d.custo)}</span>}
              </div>
            </div>
          )
        })}
      </div>
      <div className="text-muted-foreground flex justify-between text-xs tabular-nums">
        <span>{dias[0].rotulo}</span>
        <span>{dias[dias.length - 1].rotulo}</span>
      </div>
    </figure>
  )
}

/**
 * Tabela de uso agrupado. `hrefFiltro` leva ao histórico já filtrado por
 * aquela linha; a barra fina mostra a fatia de tokens do total.
 */
export function TabelaUso({
  linhas,
  rotuloColuna,
  totalTokens,
  hrefFiltro,
  mostrarCusto,
}: {
  linhas: LinhaUso[]
  rotuloColuna: string
  totalTokens: number
  hrefFiltro?: (l: LinhaUso) => string
  mostrarCusto: boolean
}) {
  if (linhas.length === 0) return <p className="text-muted-foreground text-sm">Nenhuma chamada no período.</p>
  return (
    <div className="overflow-x-auto">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>{rotuloColuna}</TableHead>
            <TableHead className="text-right">Chamadas</TableHead>
            <TableHead className="text-right">Tokens</TableHead>
            <TableHead className="w-32">Fatia</TableHead>
            {mostrarCusto && <TableHead className="text-right">Custo estimado</TableHead>}
            <TableHead className="text-right">Falhas</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {linhas.map((l) => {
            const t = l.tokensEntrada + l.tokensSaida
            const fatia = totalTokens > 0 ? t / totalTokens : 0
            return (
              <TableRow key={l.chave || "vazio"}>
                <TableCell className="max-w-72">
                  {hrefFiltro ? (
                    <Link href={hrefFiltro(l)} className="underline-offset-4 hover:underline">
                      {l.rotulo}
                    </Link>
                  ) : (
                    l.rotulo
                  )}
                  {l.detalhe && <span className="text-muted-foreground block text-xs">{l.detalhe}</span>}
                </TableCell>
                <TableCell className="text-right tabular-nums">{inteiro.format(l.chamadas)}</TableCell>
                <TableCell className="text-right tabular-nums">{tokens(t)}</TableCell>
                <TableCell>
                  <div className="bg-muted h-1.5 w-full rounded-full" title={`${Math.round(fatia * 100)}% dos tokens`}>
                    <div className="bg-primary h-1.5 rounded-full" style={{ width: `${Math.max(fatia > 0 ? 2 : 0, Math.round(fatia * 100))}%` }} />
                  </div>
                </TableCell>
                {mostrarCusto && <TableCell className="text-right tabular-nums">{dolares(l.custo)}</TableCell>}
                <TableCell className="text-right tabular-nums">
                  {l.falhas + l.bloqueadas > 0 ? (
                    <span className="text-destructive">{inteiro.format(l.falhas + l.bloqueadas)}</span>
                  ) : (
                    <span className="text-muted-foreground">0</span>
                  )}
                </TableCell>
              </TableRow>
            )
          })}
        </TableBody>
      </Table>
    </div>
  )
}
