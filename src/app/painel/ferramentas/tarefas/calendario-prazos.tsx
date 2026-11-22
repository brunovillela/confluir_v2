import Link from "next/link"
import { ChevronLeft, ChevronRight, Flag, ListChecks, SquareCheck } from "lucide-react"

import { Button } from "@/components/ui/button"
import { deslocarMes, semanasDoMes } from "@/lib/nucleo-constantes"
import { cn } from "@/lib/utils"

export type ItemCalendario = {
  id: string
  data: string
  tipo: "tarefa" | "marco" | "demanda"
  titulo: string
  /** Detalhe curto (responsável, projeto). */
  detalhe?: string | null
  href?: string | null
  concluido: boolean
  atrasado: boolean
}

const MESES = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"]
const DIAS = ["Seg", "Ter", "Qua", "Qui", "Sex", "Sáb", "Dom"]
const ICONE = { tarefa: SquareCheck, marco: Flag, demanda: ListChecks } as const
const ROTULO = { tarefa: "Tarefa", marco: "Marco de projeto", demanda: "Prazo de demanda" } as const
/** Itens visíveis por dia; o resto vira "+N". */
const POR_DIA = 4

/**
 * Calendário de prazos: tarefas, marcos de projeto e prazos de demanda no
 * mesmo mês (segunda a domingo). Atrasado em vermelho, concluído riscado.
 */
export function CalendarioPrazos({
  mes,
  hoje,
  itens,
  linkMes,
}: {
  mes: string
  hoje: string
  itens: ItemCalendario[]
  linkMes: (mes: string) => string
}) {
  const semanas = semanasDoMes(mes)
  const porDia = new Map<string, ItemCalendario[]>()
  for (const i of itens) porDia.set(i.data, [...(porDia.get(i.data) ?? []), i])
  const [a, m] = mes.split("-").map(Number)

  return (
    <div className="grid gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-1">
          <Button variant="outline" size="icon" className="size-8" asChild>
            <Link href={linkMes(deslocarMes(mes, -1))} aria-label="Mês anterior">
              <ChevronLeft />
            </Link>
          </Button>
          <h2 className="min-w-40 text-center text-base font-medium">
            {MESES[m - 1].charAt(0).toUpperCase() + MESES[m - 1].slice(1)} de {a}
          </h2>
          <Button variant="outline" size="icon" className="size-8" asChild>
            <Link href={linkMes(deslocarMes(mes, 1))} aria-label="Próximo mês">
              <ChevronRight />
            </Link>
          </Button>
          <Button variant="ghost" size="sm" asChild>
            <Link href={linkMes(hoje.slice(0, 7))}>Hoje</Link>
          </Button>
        </div>
        <ul className="text-muted-foreground flex flex-wrap gap-3 text-xs">
          {(["tarefa", "marco", "demanda"] as const).map((t) => {
            const Icone = ICONE[t]
            return (
              <li key={t} className="flex items-center gap-1">
                <Icone className="size-3.5" /> {ROTULO[t]}
              </li>
            )
          })}
        </ul>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full min-w-[42rem] table-fixed border-collapse text-xs">
          <thead>
            <tr>
              {DIAS.map((d) => (
                <th key={d} className="text-muted-foreground pb-1 text-left font-medium">
                  {d}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {semanas.map((semana) => (
              <tr key={semana[0]}>
                {semana.map((dia) => {
                  const doDia = porDia.get(dia) ?? []
                  const foraDoMes = !dia.startsWith(mes)
                  return (
                    <td
                      key={dia}
                      className={cn(
                        "h-28 border p-1 align-top",
                        foraDoMes && "bg-muted/30 text-muted-foreground",
                        dia === hoje && "bg-primary/5"
                      )}
                    >
                      <span className={cn("mb-1 inline-block tabular-nums", dia === hoje && "bg-primary text-primary-foreground rounded px-1")}>
                        {Number(dia.slice(8))}
                      </span>
                      <ul className="grid gap-0.5">
                        {doDia.slice(0, POR_DIA).map((i) => {
                          const Icone = ICONE[i.tipo]
                          const conteudo = (
                            <>
                              <Icone className="size-3 shrink-0" aria-label={ROTULO[i.tipo]} />
                              <span className={cn("truncate", i.concluido && "line-through")}>{i.titulo}</span>
                            </>
                          )
                          const classe = cn(
                            "flex items-center gap-1 rounded px-1 py-0.5",
                            i.atrasado ? "bg-destructive/10 text-destructive" : i.concluido ? "text-muted-foreground" : "bg-muted"
                          )
                          const titulo = [ROTULO[i.tipo], i.titulo, i.detalhe].filter(Boolean).join(" · ")
                          return (
                            <li key={`${i.tipo}-${i.id}`} title={titulo}>
                              {i.href ? (
                                <Link href={i.href} className={cn(classe, "hover:underline")}>
                                  {conteudo}
                                </Link>
                              ) : (
                                <span className={classe}>{conteudo}</span>
                              )}
                            </li>
                          )
                        })}
                        {doDia.length > POR_DIA && (
                          <li className="text-muted-foreground px-1" title={doDia.slice(POR_DIA).map((i) => i.titulo).join(" · ")}>
                            +{doDia.length - POR_DIA}
                          </li>
                        )}
                      </ul>
                    </td>
                  )
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
