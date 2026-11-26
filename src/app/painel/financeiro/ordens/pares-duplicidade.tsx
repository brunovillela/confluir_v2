import Link from "next/link"
import { Copy } from "lucide-react"

import { JANELA_DIAS } from "@/lib/db/ordens-duplicidade"
import type { OrdemDoPar, ParDuplicidade } from "@/lib/db/ordens-pendencias"
import { formatarData, formatarMoeda } from "@/lib/formato"

import { SituacaoBadge } from "../situacao-badge"

function Ponta({ o }: { o: OrdemDoPar }) {
  return (
    <div className="min-w-0 flex-1">
      <div className="flex flex-wrap items-center gap-2">
        <Link href={`/painel/financeiro/ordens/${o.id}`} className="text-primary font-mono text-sm font-medium hover:underline">
          {o.codigo ?? "ordem"}
        </Link>
        <SituacaoBadge situacao={o.situacao} />
      </div>
      <p className="text-muted-foreground truncate text-xs" title={o.descricao ?? undefined}>
        {o.descricao ?? "—"}
      </p>
      <p className="text-muted-foreground text-xs">
        {o.vencimento ? `vence ${formatarData(o.vencimento)}` : "sem vencimento"}
        {o.dataPagamento ? ` · paga em ${formatarData(o.dataPagamento)}` : ""}
      </p>
    </div>
  )
}

/**
 * Possíveis duplicadas em PARES (26/11/2026): "a ordem X parece a mesma
 * cobrança da ordem Y", com as duas lado a lado — a lista abaixo continua
 * com as ordens soltas.
 */
export function ParesDuplicidade({ pares }: { pares: ParDuplicidade[] }) {
  return (
    <section className="bg-card border-warning/50 overflow-hidden rounded-xl border">
      <header className="flex items-start gap-2 border-b px-4 py-3">
        <Copy className="text-warning-fg mt-0.5 size-4 shrink-0" />
        <div>
          <h2 className="text-sm font-semibold">
            {pares.length} par{pares.length === 1 ? "" : "es"} de possível duplicidade
          </h2>
          <p className="text-muted-foreground text-xs">
            Mesmo favorecido e mesmo valor, com vencimento a até {JANELA_DIAS} dias. Abra as duas e confira se não é a
            mesma cobrança antes de pagar.
          </p>
        </div>
      </header>
      {pares.length === 0 ? (
        <p className="text-muted-foreground px-4 py-6 text-center text-sm">Nenhuma ordem a pagar parece duplicada.</p>
      ) : (
        <ul className="divide-y">
          {pares.map((p) => (
            <li key={`${p.a.id}|${p.b.id}`} className="grid gap-2 px-4 py-3">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <span className="text-sm font-medium">{p.favorecido ?? "Favorecido não identificado"}</span>
                <span className="text-sm font-semibold tabular-nums">{formatarMoeda(p.a.valor)}</span>
              </div>
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                <Ponta o={p.a} />
                <span className="text-warning-fg shrink-0 text-xs font-medium">parece duplicada de</span>
                <Ponta o={p.b} />
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
