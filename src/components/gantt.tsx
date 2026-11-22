import { layoutGantt, ordenarPorDependencia } from "@/lib/gantt"
import { cn } from "@/lib/utils"

export type TarefaGantt = {
  id: string
  titulo: string | null
  inicio: string | null
  prazo: string | null
  concluido: boolean
  atrasada: boolean
  dependeDe: string[]
  responsavel: string | null
}

export type MarcoGantt = { id: string; titulo: string; data: string; concluido: boolean }

const DIA = 28 // px por dia
const LINHA = 34 // px por linha
const MESES = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"]

function somar(data: string, n: number): string {
  const d = new Date(`${data}T12:00:00Z`)
  d.setUTCDate(d.getUTCDate() + n)
  return d.toISOString().slice(0, 10)
}

/**
 * Gráfico de Gantt das tarefas: uma barra do início ao prazo, as setas das
 * dependências (da tarefa anterior para a que espera por ela), a linha de
 * hoje e, no alto, os marcos do projeto. Bloqueada (a anterior não terminou)
 * fica tracejada; a que começa antes de a anterior terminar ganha o aviso.
 */
export function Gantt({ tarefas, marcos = [], hoje }: { tarefas: TarefaGantt[]; marcos?: MarcoGantt[]; hoje: string }) {
  const ordenadas = ordenarPorDependencia(tarefas)
  const layout = layoutGantt(
    [
      ...ordenadas.map((t) => ({ id: t.id, inicio: t.inicio, prazo: t.prazo, concluido: t.concluido, dependeDe: t.dependeDe })),
      // Os marcos entram na escala (sem barra).
      ...marcos.map((m) => ({ id: `marco:${m.id}`, inicio: m.data, prazo: m.data, concluido: true, dependeDe: [] })),
    ],
    hoje
  )
  const barras = new Map(layout.barras.map((b) => [b.id, b]))
  const linhas = ordenadas.filter((t) => barras.has(t.id))
  const titulo = new Map(tarefas.map((t) => [t.id, t.titulo ?? "(sem título)"]))
  const semData = ordenadas.filter((t) => layout.semData.includes(t.id))
  const temMarcos = marcos.length > 0
  const topo = temMarcos ? LINHA : 0
  const largura = layout.totalDias * DIA
  const altura = topo + linhas.length * LINHA
  const linhaDe = new Map(linhas.map((t, i) => [t.id, i]))

  if (linhas.length === 0 && !temMarcos) {
    return (
      <p className="text-muted-foreground py-8 text-center text-sm">
        Nenhuma tarefa com início ou prazo para mostrar na linha do tempo.
      </p>
    )
  }

  const dias = Array.from({ length: layout.totalDias }, (_, i) => somar(layout.de, i))
  const setas = linhas.flatMap((t) =>
    t.dependeDe
      .filter((d) => linhaDe.has(d))
      .map((d) => {
        const a = barras.get(d)!
        const b = barras.get(t.id)!
        const x1 = (a.inicio + a.duracao) * DIA
        const y1 = topo + linhaDe.get(d)! * LINHA + LINHA / 2
        const x2 = b.inicio * DIA
        const y2 = topo + linhaDe.get(t.id)! * LINHA + LINHA / 2
        const meio = Math.max(x1 + 8, Math.min(x2 - 8, x1 + 12))
        return { id: `${d}-${t.id}`, d: `M ${x1} ${y1} H ${meio} V ${y2} H ${x2 - 2}`, conflito: (b.conflitos ?? []).includes(d) }
      })
  )

  return (
    <div className="grid gap-2">
      <div className="flex overflow-hidden rounded-md border">
        {/* Nomes */}
        <div className="bg-card z-10 w-56 shrink-0 border-r">
          <div className="text-muted-foreground flex h-12 items-end border-b px-2 pb-1 text-xs">Tarefa</div>
          {temMarcos && <div className="text-muted-foreground flex items-center border-b px-2 text-xs" style={{ height: LINHA }}>Marcos</div>}
          {linhas.map((t) => {
            const b = barras.get(t.id)!
            return (
              <div key={t.id} className="flex items-center gap-1 border-b px-2 text-xs" style={{ height: LINHA }} title={t.titulo ?? ""}>
                <span className={cn("truncate", t.concluido && "text-muted-foreground line-through")}>{t.titulo ?? "(sem título)"}</span>
                {b.bloqueada && <span className="text-muted-foreground shrink-0 text-[10px]">· aguardando</span>}
              </div>
            )
          })}
        </div>

        {/* Linha do tempo */}
        <div className="overflow-x-auto">
          <div style={{ width: largura }}>
            {/* Cabeçalho: mês e dia */}
            <div className="flex h-12 border-b">
              {dias.map((d) => {
                const fimDeSemana = [0, 6].includes(new Date(`${d}T12:00:00Z`).getUTCDay())
                const primeiro = d.endsWith("-01") || d === layout.de
                return (
                  <div
                    key={d}
                    className={cn("flex shrink-0 flex-col justify-end border-r pb-1 text-center text-[10px]", fimDeSemana && "bg-muted/50", d === hoje && "text-primary font-semibold")}
                    style={{ width: DIA }}
                  >
                    {primeiro && <span className="text-muted-foreground">{MESES[Number(d.slice(5, 7)) - 1]}</span>}
                    <span className="tabular-nums">{Number(d.slice(8))}</span>
                  </div>
                )
              })}
            </div>

            <div className="relative" style={{ height: altura }}>
              {/* Fundo: fins de semana e linhas */}
              {dias.map((d, i) =>
                [0, 6].includes(new Date(`${d}T12:00:00Z`).getUTCDay()) ? (
                  <div key={d} className="bg-muted/40 absolute top-0 bottom-0" style={{ left: i * DIA, width: DIA }} />
                ) : null
              )}
              {Array.from({ length: (temMarcos ? 1 : 0) + linhas.length }, (_, i) => (
                <div key={i} className="absolute right-0 left-0 border-b" style={{ top: (i + 1) * LINHA - 1 }} />
              ))}
              {/* Hoje */}
              <div className="bg-primary absolute top-0 bottom-0 w-0.5" style={{ left: layout.hoje * DIA + DIA / 2 }} title="Hoje" />

              {/* Marcos */}
              {marcos.map((m) => {
                const b = barras.get(`marco:${m.id}`)
                if (!b) return null
                return (
                  <div
                    key={m.id}
                    className={cn("absolute size-3 rotate-45 border", m.concluido ? "bg-success border-success" : m.data < hoje ? "bg-destructive border-destructive" : "bg-warning border-warning")}
                    style={{ left: b.inicio * DIA + DIA / 2 - 6, top: LINHA / 2 - 6 }}
                    title={`Marco: ${m.titulo} (${m.data.split("-").reverse().join("/")})`}
                  />
                )
              })}

              {/* Setas das dependências */}
              <svg className="pointer-events-none absolute inset-0" width={largura} height={altura} aria-hidden>
                <defs>
                  <marker id="gantt-seta" markerWidth="6" markerHeight="6" refX="5" refY="3" orient="auto">
                    <path d="M0,0 L6,3 L0,6 Z" className="fill-muted-foreground" />
                  </marker>
                  <marker id="gantt-seta-conflito" markerWidth="6" markerHeight="6" refX="5" refY="3" orient="auto">
                    <path d="M0,0 L6,3 L0,6 Z" className="fill-destructive" />
                  </marker>
                </defs>
                {setas.map((s) => (
                  <path
                    key={s.id}
                    d={s.d}
                    fill="none"
                    strokeWidth={1.5}
                    className={s.conflito ? "stroke-destructive" : "stroke-muted-foreground"}
                    markerEnd={`url(#${s.conflito ? "gantt-seta-conflito" : "gantt-seta"})`}
                  />
                ))}
              </svg>

              {/* Barras */}
              {linhas.map((t, i) => {
                const b = barras.get(t.id)!
                const conflitos = b.conflitos.map((c) => titulo.get(c)).filter(Boolean)
                const dica = [
                  t.titulo ?? "(sem título)",
                  t.inicio || t.prazo ? `${(t.inicio ?? t.prazo)!.split("-").reverse().join("/")} a ${(t.prazo ?? t.inicio)!.split("-").reverse().join("/")}` : "",
                  t.responsavel,
                  t.concluido ? "Concluída" : t.atrasada ? "Atrasada" : b.bloqueada ? "Aguardando tarefas anteriores" : "",
                  conflitos.length ? `Começa antes de terminar: ${conflitos.join(", ")}` : "",
                ]
                  .filter(Boolean)
                  .join(" · ")
                return (
                  <div
                    key={t.id}
                    title={dica}
                    className={cn(
                      "absolute flex items-center overflow-hidden rounded px-1.5 text-[10px] font-medium",
                      t.concluido
                        ? "bg-success/25 text-success-fg"
                        : t.atrasada
                          ? "bg-destructive/80 text-white"
                          : b.bloqueada
                            ? "bg-muted text-muted-foreground border border-dashed border-current"
                            : "bg-primary/80 text-primary-foreground",
                      conflitos.length > 0 && "ring-destructive ring-2"
                    )}
                    style={{ left: b.inicio * DIA + 2, width: b.duracao * DIA - 4, top: topo + i * LINHA + 7, height: LINHA - 14 }}
                  >
                    <span className="truncate">{t.responsavel ?? ""}</span>
                  </div>
                )
              })}
            </div>
          </div>
        </div>
      </div>

      <ul className="text-muted-foreground flex flex-wrap gap-x-4 gap-y-1 text-xs">
        <li className="flex items-center gap-1"><span className="bg-primary/80 inline-block h-2.5 w-5 rounded" /> Em aberto</li>
        <li className="flex items-center gap-1"><span className="bg-destructive/80 inline-block h-2.5 w-5 rounded" /> Atrasada</li>
        <li className="flex items-center gap-1"><span className="bg-muted inline-block h-2.5 w-5 rounded border border-dashed border-current" /> Aguardando as anteriores</li>
        <li className="flex items-center gap-1"><span className="bg-success/25 inline-block h-2.5 w-5 rounded" /> Concluída</li>
        <li className="flex items-center gap-1"><span className="ring-destructive inline-block h-2.5 w-5 rounded ring-2" /> Começa antes de a anterior terminar</li>
        {temMarcos && <li className="flex items-center gap-1"><span className="bg-warning inline-block size-2.5 rotate-45" /> Marco</li>}
        <li className="flex items-center gap-1"><span className="bg-primary inline-block h-3 w-0.5" /> Hoje</li>
      </ul>
      {semData.length > 0 && (
        <p className="text-muted-foreground text-xs">
          Sem início nem prazo (fora da linha do tempo): {semData.map((t) => t.titulo ?? "(sem título)").join(", ")}.
        </p>
      )}
    </div>
  )
}
