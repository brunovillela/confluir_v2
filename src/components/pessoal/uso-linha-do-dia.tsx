import { CATEGORIAS_FORA, horaDoDia, textoMinutos, type DiaUso, type TrechoUso } from "@/lib/uso-fora-expediente"

/**
 * Peças do uso do painel fora do expediente, usadas no relatório do
 * departamento de pessoal e no Meu perfil → Ponto do próprio funcionário.
 */

const MESES = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"]

/** Mês atual (AAAA-MM) no horário de São Paulo. */
export function mesAtualSP(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit" }).format(new Date()).slice(0, 7)
}

export function deslocarMes(comp: string, delta: number): string {
  const [a, m] = comp.split("-").map(Number)
  return new Date(Date.UTC(a, m - 1 + delta, 1)).toISOString().slice(0, 7)
}

/** "novembro de 2026" */
export const rotuloMes = (comp: string) => `${MESES[Number(comp.slice(5, 7)) - 1]} de ${comp.slice(0, 4)}`
/** "18/11" */
export const dataBr = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`

const COR: Record<TrechoUso["categoria"], string> = {
  dentro: "bg-success/70",
  antes: "bg-warning",
  depois: "bg-warning",
  intervalo: "bg-warning/60",
  sem_expediente: "bg-destructive/70",
  feriado: "bg-destructive/70",
  afastado: "bg-destructive",
}

/** Linha de 0 a 24 h com os trechos de uso do dia. */
export function LinhaDoDia({ dia }: { dia: DiaUso }) {
  return (
    <div className="bg-muted relative h-3 w-full min-w-40 overflow-hidden rounded-sm" aria-hidden>
      {[6, 12, 18].map((h) => (
        <span key={h} className="bg-border absolute top-0 h-full w-px" style={{ left: `${(h / 24) * 100}%` }} />
      ))}
      {dia.trechos.map((t, i) => (
        <span
          key={i}
          className={`absolute top-0 h-full ${COR[t.categoria]}`}
          style={{ left: `${(t.inicio / 1440) * 100}%`, width: `max(2px, ${((t.fim - t.inicio) / 1440) * 100}%)` }}
        />
      ))}
    </div>
  )
}

/** Legenda das cores da linha do dia. */
export function LegendaLinhaDoDia() {
  const itens: [string, string][] = [
    ["bg-success/70", "dentro da jornada"],
    ["bg-warning", "antes ou depois do horário"],
    ["bg-warning/60", "intervalo"],
    ["bg-destructive/70", "dia sem expediente ou feriado"],
    ["bg-destructive", "férias ou afastamento"],
  ]
  return (
    <div className="text-muted-foreground flex flex-wrap items-center gap-x-4 gap-y-1 text-xs">
      {itens.map(([cor, rotulo]) => (
        <span key={rotulo} className="flex items-center gap-1">
          <span className={`${cor} inline-block size-3 rounded-sm`} /> {rotulo}
        </span>
      ))}
    </div>
  )
}

/** "Depois da saída: 1h15 (21:10–22:25) · Feriado: 40 min (16:00–16:40)" */
export function textoOndeCaiu(dia: DiaUso): string {
  const fora = dia.trechos.filter((t) => t.categoria !== "dentro")
  if (fora.length === 0) return "—"
  return CATEGORIAS_FORA.filter((c) => dia.fora[c.chave] > 0)
    .map(
      (c) =>
        `${c.rotulo}: ${textoMinutos(dia.fora[c.chave])} (${fora
          .filter((t) => t.categoria === c.chave)
          .map((t) => `${horaDoDia(t.inicio)}–${horaDoDia(t.fim)}`)
          .join(", ")})`
    )
    .join(" · ")
}
