"use client"

import Link from "next/link"
import { useActionState, useState } from "react"
import { CheckCircle2, Link2, Loader2 } from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import type { DevolucaoAReceber } from "@/lib/db/compras-cancelamento"
import { formatarData, formatarMoeda } from "@/lib/formato"

import { receberDevolucaoAction } from "./actions"

type Estado = { erro?: string; ok?: string }

/**
 * Compras canceladas pelo vendedor com devolução do dinheiro ainda não
 * recebida. Crédito do extrato de mesmo valor vem sugerido; estorno no cartão
 * ou outro caminho, "Marcar como recebida".
 */
export function DevolucoesAReceber({ itens, podeEscrever }: { itens: DevolucaoAReceber[]; podeEscrever: boolean }) {
  return (
    <ul className="divide-y">
      {itens.map((d) => (
        <ItemDevolucao key={d.fornecimentoId} d={d} podeEscrever={podeEscrever} />
      ))}
    </ul>
  )
}

function ItemDevolucao({ d, podeEscrever }: { d: DevolucaoAReceber; podeEscrever: boolean }) {
  const [estado, acao, pendente] = useActionState(receberDevolucaoAction, {} as Estado)
  const [manual, setManual] = useState(false)
  if (estado.ok) {
    return (
      <li className="text-success-fg flex items-center gap-2 py-3 text-sm">
        <CheckCircle2 className="size-4" />
        {d.fornecedor} — {estado.ok}
      </li>
    )
  }
  return (
    <li className="grid gap-2 py-3 text-sm">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <div className="min-w-0">
          <p className="font-medium">{d.fornecedor}</p>
          <p className="text-muted-foreground text-xs">
            <Link href={`/painel/compras/${d.processoId}`} className="text-primary hover:underline">
              {d.codigo ?? "(sem código)"}
            </Link>
            {d.produto ? ` · ${d.produto}` : ""}
            {d.data ? ` · cancelada em ${formatarData(d.data)}` : ""}
          </p>
        </div>
        <span className="flex items-center gap-2">
          <span className="font-medium tabular-nums">{formatarMoeda(d.valor)}</span>
          <Badge variant={d.dias >= 15 ? "warning" : "outline"}>
            há {d.dias} dia{d.dias === 1 ? "" : "s"}
          </Badge>
        </span>
      </div>
      {podeEscrever && (
        <div className="flex flex-wrap items-center gap-2">
          {d.sugestoes.map((s) => (
            <form key={s.lancamentoId} action={acao}>
              <input type="hidden" name="fornecimento_id" value={d.fornecimentoId} />
              <input type="hidden" name="lancamento_id" value={s.lancamentoId} />
              <Button type="submit" size="sm" disabled={pendente} title={s.descricao ?? undefined}>
                {pendente ? <Loader2 className="animate-spin" /> : <Link2 />}
                Conciliar com o crédito de {formatarData(s.data)} ({formatarMoeda(s.valor)})
              </Button>
            </form>
          ))}
          {manual ? (
            <form action={acao} className="flex flex-wrap items-center gap-2">
              <input type="hidden" name="fornecimento_id" value={d.fornecimentoId} />
              <Input name="obs" placeholder="Como voltou (ex.: estorno na fatura do cartão)" className="h-8 w-72" />
              <Button type="submit" size="sm" variant="outline" disabled={pendente}>
                {pendente && <Loader2 className="animate-spin" />}
                Confirmar
              </Button>
            </form>
          ) : (
            <Button type="button" size="sm" variant="outline" onClick={() => setManual(true)}>
              <CheckCircle2 />
              Marcar como recebida
            </Button>
          )}
        </div>
      )}
      {estado.erro && <p className="text-destructive text-xs">{estado.erro}</p>}
    </li>
  )
}
