import Link from "next/link"

import { COR_OUTROS, CORES_SERIES, moeda } from "@/components/graficos/base"

export type ItemRanking = {
  chave: string
  nome: string
  valor: number
  quantidade: number
  /** "Outros" (resto agregado): cinza neutro, sem link. */
  outros?: boolean
  href?: string
}

/**
 * Ranking em barras horizontais (skill dataviz): uma série só — a cor não
 * codifica nada, então não há legenda; o título do cartão nomeia a medida.
 * Barra fina com ponta arredondada, nome e valor sempre visíveis em tokens de
 * texto (o valor não depende do hover) e o detalhe no tooltip nativo.
 * Server-safe.
 */
export function GraficoRanking({
  itens,
  titulo,
  unidade = "compra",
}: {
  itens: ItemRanking[]
  titulo: string
  /** Rótulo da contagem no detalhe ("3 compras"). */
  unidade?: string
}) {
  if (itens.length === 0) {
    return <p className="text-muted-foreground py-6 text-center text-sm">Sem compras no período.</p>
  }
  const max = Math.max(...itens.map((i) => i.valor), 0) || 1
  const total = itens.reduce((s, i) => s + i.valor, 0) || 1
  return (
    <ol className="grid gap-2.5" aria-label={titulo}>
      {itens.map((i) => {
        const pct = (i.valor / total) * 100
        const detalhe = `${i.nome}: ${moeda(i.valor)} · ${i.quantidade.toLocaleString("pt-BR")} ${unidade}${i.quantidade === 1 ? "" : "s"} · ${pct.toLocaleString("pt-BR", { maximumFractionDigits: 1 })}% do total`
        const nome =
          i.href && !i.outros ? (
            <Link href={i.href} className="hover:text-primary truncate hover:underline">
              {i.nome}
            </Link>
          ) : (
            <span className="truncate">{i.nome}</span>
          )
        return (
          <li key={i.chave} className="grid gap-1" title={detalhe}>
            <div className="flex items-baseline justify-between gap-3 text-sm">
              {nome}
              <span className="text-muted-foreground shrink-0 text-xs tabular-nums">
                {moeda(i.valor)}
                <span className="ml-1.5 opacity-70">
                  {pct.toLocaleString("pt-BR", { maximumFractionDigits: 0 })}%
                </span>
              </span>
            </div>
            <div className="bg-muted/60 h-2 overflow-hidden rounded-full">
              <div
                className="h-full rounded-full"
                style={{
                  width: `${Math.max(1.5, (i.valor / max) * 100)}%`,
                  background: i.outros ? COR_OUTROS : CORES_SERIES[0],
                }}
              />
            </div>
          </li>
        )
      })}
    </ol>
  )
}

/**
 * Proporção em uma barra empilhada (2 a 3 partes) com legenda: a cor marca a
 * parte e o rótulo vem sempre ao lado (identidade nunca só por cor).
 */
export function BarraProporcao({
  partes,
  titulo,
}: {
  partes: { nome: string; valor: number; quantidade: number; outros?: boolean }[]
  titulo: string
}) {
  const visiveis = partes.filter((p) => p.quantidade > 0)
  const total = visiveis.reduce((s, p) => s + p.valor, 0)
  if (visiveis.length === 0) {
    return <p className="text-muted-foreground py-6 text-center text-sm">Sem compras no período.</p>
  }
  // A cor segue a parte (ordem fixa), não a posição entre as visíveis.
  const cor = (p: (typeof partes)[number]) =>
    p.outros ? COR_OUTROS : CORES_SERIES[partes.filter((x) => !x.outros).indexOf(p) % CORES_SERIES.length]
  return (
    <figure className="grid gap-3" aria-label={titulo}>
      <div className="flex h-3 gap-0.5 overflow-hidden rounded-full">
        {visiveis.map((p) => (
          <div
            key={p.nome}
            className="h-full first:rounded-l-full last:rounded-r-full"
            style={{ width: `${total ? Math.max(1, (p.valor / total) * 100) : 100 / visiveis.length}%`, background: cor(p) }}
            title={`${p.nome}: ${moeda(p.valor)} · ${p.quantidade.toLocaleString("pt-BR")} compra${p.quantidade === 1 ? "" : "s"}`}
          />
        ))}
      </div>
      <ul className="grid gap-1.5 text-sm">
        {visiveis.map((p) => (
          <li key={p.nome} className="flex items-baseline justify-between gap-3">
            <span className="flex min-w-0 items-center gap-2">
              <span className="size-2.5 shrink-0 rounded-sm" style={{ background: cor(p) }} aria-hidden />
              <span className="truncate">{p.nome}</span>
            </span>
            <span className="text-muted-foreground shrink-0 text-xs tabular-nums">
              {moeda(p.valor)} · {p.quantidade.toLocaleString("pt-BR")}
              <span className="ml-1.5 opacity-70">
                {total ? ((p.valor / total) * 100).toLocaleString("pt-BR", { maximumFractionDigits: 0 }) : 0}%
              </span>
            </span>
          </li>
        ))}
      </ul>
    </figure>
  )
}
