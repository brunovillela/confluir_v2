import Link from "next/link"
import { CheckCircle2, ListTodo } from "lucide-react"

import { filasDoFinanceiro } from "@/lib/db/financeiro-filas"
import { cn } from "@/lib/utils"

/**
 * "O que fazer hoje" no topo do Financeiro (07/11/2026): as filas de trabalho
 * com a quantidade e o atalho. As urgentes (vencido, parado, possível erro)
 * vêm primeiro e em destaque; fila vazia não aparece.
 */
export async function FilasDoDia({ veAvaliacoes }: { veAvaliacoes: boolean }) {
  const filas = await filasDoFinanceiro({ veAvaliacoes }).catch(() => null)
  if (!filas) return null
  return (
    <section className="bg-card rounded-xl border p-4">
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
    </section>
  )
}

/** Esqueleto enquanto as filas são contadas. */
export function FilasDoDiaCarregando() {
  return <section className="bg-card h-28 animate-pulse rounded-xl border" aria-label="Carregando as filas do dia" />
}
