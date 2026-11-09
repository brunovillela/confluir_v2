import Link from "next/link"
import { CalendarCheck2, CheckCircle2, ChevronRight, ListTodo } from "lucide-react"

import { Button } from "@/components/ui/button"
import { lembreteDeFechamento, nomeDoMes } from "@/lib/db/fechamento-pendencias"
import { filasDoFinanceiro } from "@/lib/db/financeiro-filas"
import { cn } from "@/lib/utils"

/**
 * "O que fazer hoje" no topo do Financeiro (07/11/2026): as filas de trabalho
 * com a quantidade e o atalho. As urgentes (vencido, parado, possível erro)
 * vêm primeiro e em destaque; fila vazia não aparece.
 *
 * 09/11/2026: o lembrete do fechamento do mês veio para dentro do mesmo quadro.
 * Processando, a pagar vencidas, sem comprovante e extrato já são filas; do
 * fechamento só entra o que as filas não mostram (sem centro, sem débito).
 */

/** Pendências do fechamento que já aparecem como fila do dia. */
const JA_SAO_FILAS = new Set(["processando", "a_pagar", "sem_comprovante", "extrato"])

export async function FilasDoDia({
  veAvaliacoes,
  veFilas,
  veFechamento,
}: {
  veAvaliacoes: boolean
  veFilas: boolean
  veFechamento: boolean
}) {
  const [filas, fechamento] = await Promise.all([
    veFilas ? filasDoFinanceiro({ veAvaliacoes }).catch(() => null) : Promise.resolve(null),
    veFechamento ? lembreteDeFechamento().catch(() => null) : Promise.resolve(null),
  ])
  if (!filas && !fechamento) return null
  const proprias = fechamento?.pendencias.filter((p) => !JA_SAO_FILAS.has(p.codigo)) ?? []
  const nasFilas = fechamento?.pendencias.filter((p) => JA_SAO_FILAS.has(p.codigo)).reduce((s, p) => s + p.quantidade, 0) ?? 0

  return (
    <section className="bg-card rounded-xl border p-4">
      {filas && (
        <>
          <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold">
            <ListTodo className="text-muted-foreground size-4" />
            O que fazer hoje
          </h2>
          {filas.length === 0 ? (
            <p className="text-success-fg flex items-center gap-2 text-sm">
              <CheckCircle2 className="size-4" />
              Nenhuma fila pendente: nada vencido, parado ou para conferir.
            </p>
          ) : (
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {filas.map((f) => (
                <Link
                  key={f.codigo}
                  href={f.href}
                  className={cn(
                    "hover:bg-muted/50 flex items-baseline gap-2 rounded-lg border px-3 py-2 text-sm",
                    f.urgente && "border-warning/50 bg-warning/5"
                  )}
                >
                  <span className={cn("text-xl font-semibold tabular-nums", f.urgente && "text-warning-fg")}>
                    {f.quantidade.toLocaleString("pt-BR")}
                  </span>
                  <span className="text-muted-foreground">{f.rotulo}</span>
                </Link>
              ))}
            </div>
          )}
        </>
      )}

      {fechamento && (
        <div className={cn(filas && "mt-4 border-t pt-4")}>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <h2 className="flex items-center gap-2 text-sm font-semibold">
                <CalendarCheck2 className="text-info-fg size-4" />
                Fechar {nomeDoMes(fechamento.mes)} para a contabilidade
              </h2>
              <p className="text-muted-foreground mt-0.5 text-xs">
                {fechamento.abertosAntes > 0
                  ? `Há também ${fechamento.abertosAntes} ${fechamento.abertosAntes > 1 ? "meses anteriores abertos" : "mês anterior aberto"} nos últimos 12. `
                  : ""}
                {fechamento.total === 0
                  ? "Nada pendente: o mês pode ser fechado."
                  : nasFilas > 0 && filas
                    ? `${nasFilas} ${nasFilas > 1 ? "itens das filas acima são" : "item das filas acima é"} deste mês${proprias.length > 0 ? "; além deles, falta:" : " — resolva antes de fechar."}`
                    : `${fechamento.total} pendência${fechamento.total > 1 ? "s" : ""} para acertar antes de fechar.`}
              </p>
            </div>
            <Button size="sm" variant={fechamento.total === 0 ? "default" : "outline"} asChild>
              <Link href="/painel/financeiro/contabil#fechamento">Ir para o fechamento</Link>
            </Button>
          </div>
          {/* Sem as filas na tela (outra permissão), o fechamento lista tudo. */}
          {(filas ? proprias : fechamento.pendencias).length > 0 && (
            <ul className="mt-2 divide-y text-sm">
              {(filas ? proprias : fechamento.pendencias).map((p) => (
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
          )}
        </div>
      )}
    </section>
  )
}

/** Esqueleto enquanto as filas são contadas. */
export function FilasDoDiaCarregando() {
  return <section className="bg-card h-28 animate-pulse rounded-xl border" aria-label="Carregando as filas do dia" />
}
