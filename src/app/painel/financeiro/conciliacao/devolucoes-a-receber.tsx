"use client"

import Link from "next/link"
import { useActionState, useState } from "react"
import { CheckCircle2, Link2, Loader2, Megaphone, TriangleAlert, Wallet } from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import type { DevolucaoAReceber } from "@/lib/db/compras-cancelamento"
import { formatarData, formatarMoeda } from "@/lib/formato"

import { encerrarDevolucaoComPerdaAction, receberDevolucaoAction, registrarCobrancaDevolucaoAction } from "./actions"

type Estado = { erro?: string; ok?: string }

function hojeSP(): string {
  return new Date().toLocaleDateString("sv-SE", { timeZone: "America/Sao_Paulo" })
}

function valorBR(v: number): string {
  return v.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

/**
 * Compras canceladas pelo vendedor com devolução do dinheiro ainda não
 * recebida (toda ou em parte). Crédito do extrato do valor que falta (ou um
 * pouco menos) vem sugerido; estorno no cartão ou outro caminho, "Registrar
 * recebimento". A parada há muito tempo pede a cobrança ao fornecedor; o que
 * não vai voltar se dá como perda.
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

type Modo = null | "receber" | "cobrar" | "perda"

function ItemDevolucao({ d, podeEscrever }: { d: DevolucaoAReceber; podeEscrever: boolean }) {
  const [estadoReceber, receber, recebendo] = useActionState(receberDevolucaoAction, {} as Estado)
  const [estadoCobrar, cobrar, cobrando] = useActionState(registrarCobrancaDevolucaoAction, {} as Estado)
  const [estadoPerda, perder, perdendo] = useActionState(encerrarDevolucaoComPerdaAction, {} as Estado)
  const [modo, setModo] = useState<Modo>(null)
  const pendente = recebendo || cobrando || perdendo
  const ok = [estadoReceber, estadoCobrar, estadoPerda].map((e) => e.ok).filter(Boolean).pop()
  const erro = [estadoReceber, estadoCobrar, estadoPerda].map((e) => e.erro).filter(Boolean).pop()
  const saldo = d.saldo ?? 0

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
        <span className="flex flex-wrap items-center justify-end gap-2">
          <span className="text-right tabular-nums">
            {d.recebido > 0 ? (
              <>
                <span className="font-medium">faltam {formatarMoeda(saldo)}</span>
                <span className="text-muted-foreground block text-xs">
                  de {formatarMoeda(d.valor)} · {formatarMoeda(d.recebido)} recebidos
                </span>
              </>
            ) : (
              <span className="font-medium">{formatarMoeda(d.valor)}</span>
            )}
          </span>
          {d.parada ? (
            <Badge variant="destructive">
              <TriangleAlert />
              Parada há {d.diasSemNoticia} dias — cobrar o fornecedor
            </Badge>
          ) : (
            <Badge variant={d.dias >= 15 ? "warning" : "outline"}>
              há {d.dias} dia{d.dias === 1 ? "" : "s"}
            </Badge>
          )}
        </span>
      </div>

      {(d.cobradaEm || d.recebimentos.length > 0) && (
        <ul className="text-muted-foreground grid gap-0.5 text-xs">
          {d.cobradaEm && (
            <li>
              Fornecedor cobrado em {formatarData(d.cobradaEm)}
              {d.cobrancaObs ? `: ${d.cobrancaObs}` : ""}
            </li>
          )}
          {d.recebimentos.map((r, i) => (
            <li key={i}>
              Recebido {formatarMoeda(r.valor)} em {formatarData(r.data)}
              {r.conciliado ? " (conciliado no extrato)" : ""}
              {r.obs ? ` — ${r.obs}` : ""}
            </li>
          ))}
        </ul>
      )}

      {podeEscrever && (
        <div className="flex flex-wrap items-center gap-2">
          {d.sugestoes.map((s) => (
            <form key={s.lancamentoId} action={receber}>
              <input type="hidden" name="fornecimento_id" value={d.fornecimentoId} />
              <input type="hidden" name="lancamento_id" value={s.lancamentoId} />
              <Button type="submit" size="sm" variant={s.exato ? "default" : "outline"} disabled={pendente} title={s.descricao ?? undefined}>
                {recebendo ? <Loader2 className="animate-spin" /> : <Link2 />}
                Conciliar com o crédito de {formatarData(s.data)} ({formatarMoeda(s.valor)}
                {s.exato ? "" : ` — ${formatarMoeda(saldo - s.valor)} a menos`})
              </Button>
            </form>
          ))}
          <Button type="button" size="sm" variant={modo === "receber" ? "secondary" : "outline"} onClick={() => setModo(modo === "receber" ? null : "receber")}>
            <CheckCircle2 />
            Registrar recebimento
          </Button>
          <Button type="button" size="sm" variant={modo === "cobrar" ? "secondary" : "outline"} onClick={() => setModo(modo === "cobrar" ? null : "cobrar")}>
            <Megaphone />
            Registrar cobrança
          </Button>
          <Button type="button" size="sm" variant={modo === "perda" ? "secondary" : "ghost"} onClick={() => setModo(modo === "perda" ? null : "perda")}>
            <Wallet />
            {d.recebido > 0 ? "Dar o que falta como perda" : "Dar como perda"}
          </Button>
        </div>
      )}

      {podeEscrever && modo === "receber" && (
        <form action={receber} className="bg-muted/40 grid gap-2 rounded-md p-3 sm:grid-cols-[8rem_10rem_1fr_auto] sm:items-end">
          <input type="hidden" name="fornecimento_id" value={d.fornecimentoId} />
          <label className="grid gap-1 text-xs">
            Quanto voltou
            <Input name="valor" defaultValue={valorBR(saldo)} inputMode="decimal" className="h-8" required />
          </label>
          <label className="grid gap-1 text-xs">
            Em
            <Input name="data" type="date" defaultValue={hojeSP()} max={hojeSP()} className="h-8" required />
          </label>
          <label className="grid gap-1 text-xs">
            Como voltou
            <Input name="obs" placeholder="ex.: estorno na fatura do cartão" className="h-8" />
          </label>
          <Button type="submit" size="sm" disabled={pendente}>
            {recebendo && <Loader2 className="animate-spin" />}
            Registrar
          </Button>
          <p className="text-muted-foreground text-xs sm:col-span-4">
            Menos do que falta? A devolução continua aberta com o saldo; depois, se o resto não vier, dê-o como perda.
          </p>
        </form>
      )}

      {podeEscrever && modo === "cobrar" && (
        <form action={cobrar} className="bg-muted/40 grid gap-2 rounded-md p-3 sm:grid-cols-[10rem_1fr_auto] sm:items-end">
          <input type="hidden" name="fornecimento_id" value={d.fornecimentoId} />
          <label className="grid gap-1 text-xs">
            Cobrado em
            <Input name="data" type="date" defaultValue={hojeSP()} max={hojeSP()} className="h-8" required />
          </label>
          <label className="grid gap-1 text-xs">
            Como (canal, protocolo, resposta)
            <Input name="obs" placeholder="ex.: reclamação no Mercado Livre, protocolo 123" className="h-8" />
          </label>
          <Button type="submit" size="sm" disabled={pendente}>
            {cobrando && <Loader2 className="animate-spin" />}
            Registrar
          </Button>
          <p className="text-muted-foreground text-xs sm:col-span-3">O aviso de devolução parada volta a contar a partir desta data.</p>
        </form>
      )}

      {podeEscrever && modo === "perda" && (
        <form action={perder} className="bg-muted/40 grid gap-2 rounded-md p-3 sm:grid-cols-[1fr_auto] sm:items-end">
          <input type="hidden" name="fornecimento_id" value={d.fornecimentoId} />
          <label className="grid gap-1 text-xs">
            Por que {formatarMoeda(saldo)} não vão voltar
            <Input name="motivo" placeholder="ex.: taxa retida pelo marketplace" className="h-8" required />
          </label>
          <Button type="submit" size="sm" variant="destructive" disabled={pendente}>
            {perdendo && <Loader2 className="animate-spin" />}
            Encerrar com perda
          </Button>
          <p className="text-muted-foreground text-xs sm:col-span-2">
            A devolução sai da lista e a exportação contábil mostra o valor perdido no pagamento da compra.
          </p>
        </form>
      )}

      {ok && <p className="text-success-fg text-xs">{ok}</p>}
      {erro && <p className="text-destructive text-xs">{erro}</p>}
    </li>
  )
}
