import Link from "next/link"
import { CalendarCheck2, ChevronRight } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { lembreteDeFechamento, nomeDoMes } from "@/lib/db/fechamento-pendencias"

/**
 * Lembrete do fechamento (07/11/2026): a partir do dia 5, o mês anterior ainda
 * aberto aparece no topo do Financeiro com o que falta acertar antes de
 * entregá-lo à contabilidade.
 */
export async function LembreteFechamento() {
  const l = await lembreteDeFechamento().catch(() => null)
  if (!l) return null
  return (
    <Card className="border-info/40">
      <CardHeader>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <CardTitle className="flex items-center gap-2 text-base">
              <CalendarCheck2 className="text-info-fg size-4" />
              Fechar {nomeDoMes(l.mes)} para a contabilidade
            </CardTitle>
            <CardDescription className="text-xs">
              {l.total === 0
                ? "Nada pendente: o mês pode ser fechado."
                : `${l.total} pendência${l.total > 1 ? "s" : ""} para acertar antes de fechar.`}
              {l.abertosAntes > 0
                ? ` Há também ${l.abertosAntes} ${l.abertosAntes > 1 ? "meses anteriores abertos" : "mês anterior aberto"} nos últimos 12.`
                : ""}{" "}
              Fechado, nenhum pagamento entra, sai ou muda no mês, e a contabilidade recebe o relatório de RPAs.
            </CardDescription>
          </div>
          <Button size="sm" variant={l.total === 0 ? "default" : "outline"} asChild>
            <Link href="/painel/financeiro/contabil#fechamento">Ir para o fechamento</Link>
          </Button>
        </div>
      </CardHeader>
      {l.pendencias.length > 0 && (
        <CardContent>
          <ul className="divide-y text-sm">
            {l.pendencias.map((p) => (
              <li key={p.codigo}>
                <Link href={p.href} className="hover:bg-muted/50 -mx-2 flex items-center gap-3 rounded-md px-2 py-2">
                  <span className="bg-muted min-w-8 rounded px-1.5 text-center text-xs font-semibold tabular-nums">{p.quantidade}</span>
                  <span className="min-w-0 flex-1">
                    <span className="block font-medium">{p.rotulo}</span>
                    <span className="text-muted-foreground block text-xs">{p.explicacao}</span>
                  </span>
                  <ChevronRight className="text-muted-foreground size-4" />
                </Link>
              </li>
            ))}
          </ul>
        </CardContent>
      )}
    </Card>
  )
}
