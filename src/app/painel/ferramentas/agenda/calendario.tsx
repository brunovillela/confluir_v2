"use client"

import {
  startTransition,
  useActionState,
  useEffect,
  useOptimistic,
  useRef,
  useState,
  useSyncExternalStore,
  type DragEvent,
  type KeyboardEvent,
} from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { ChevronLeft, ChevronRight, ExternalLink, Eye, Loader2, Pencil, Save } from "lucide-react"

import { Alert, AlertDescription } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { TIPOS_AGENDA_AVULSA, TITULO_MAX_AGENDA } from "@/lib/agenda-constantes"
import {
  aplicarMovimento,
  camposDaVaga,
  COOKIE_VISAO_AGENDA,
  deslocarDias,
  diaDaSemana,
  diasDoDestino,
  diferencaDias,
  distribuirNaSemana,
  distribuirNoDia,
  duracaoEmMinutos,
  ehFaixa,
  encaixarMinuto,
  horaDeMinutos,
  inicioNoHorario,
  minutosSP,
  navegar,
  rotuloDia,
  rotuloPeriodo,
  tituloDaVisao,
  type VagaNaAgenda,
  type VisaoAgenda,
  type VisaoCalendario,
} from "@/lib/agenda-calendario"
import type { EventoLinha } from "@/lib/db/agenda"
import { cn } from "@/lib/utils"
import { useEnvioFormulario } from "@/hooks/use-envio-formulario"

import { moverCompromissoAction, salvarCompromissoAction } from "./actions"
import { ExcluirCompromissoBotao } from "./agenda-forms"

const BASE = "/painel/ferramentas/agenda"
const SELECT =
  "border-input bg-background text-foreground h-9 w-full truncate rounded-md border px-3 text-sm shadow-xs outline-none [color-scheme:light] dark:[color-scheme:dark]"
const DIAS_SEMANA = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"]
/** Compromissos visíveis por dia no mês; o resto vira "+N mais". */
const LINHAS_NO_MES = 3
const ALTURA_HORA = 48
/** A grade de horas abre aqui; a madrugada fica acima, na rolagem. */
const HORA_DE_ABERTURA = 7

// ── Cores ───────────────────────────────────────────────────────────────────

/** Texto sempre em foreground (contraste AA); a cor só acompanha, na borda e no fundo. */
const CORES = {
  votacao: "bg-primary/15 border-primary",
  sindical: "bg-info/15 border-info",
  reuniao: "bg-success/15 border-success",
  curso: "bg-warning/15 border-warning",
  evento: "bg-accent border-foreground/60",
  outro: "bg-muted border-muted-foreground/50",
} as const

const LEGENDA: { cor: keyof typeof CORES; rotulo: string }[] = [
  { cor: "votacao", rotulo: "Assembleia" },
  { cor: "sindical", rotulo: "Atividade sindical" },
  { cor: "reuniao", rotulo: "Reunião" },
  { cor: "curso", rotulo: "Curso" },
  { cor: "evento", rotulo: "Evento" },
  { cor: "outro", rotulo: "Outros" },
]

function corDoEvento(e: EventoLinha): string {
  if (e.origem === "votacao" || e.tipo === "Assembleia") return CORES.votacao
  if (e.tipo === "Atividade sindical") return CORES.sindical
  if (e.tipo === "Reunião") return CORES.reuniao
  if (e.tipo === "Curso") return CORES.curso
  if (e.tipo === "Evento" || e.tipo === "Evento social") return CORES.evento
  return CORES.outro
}

// ── Alternar visão ──────────────────────────────────────────────────────────

const ROTULOS_VISAO: Record<VisaoAgenda, string> = { lista: "Lista", mes: "Mês", semana: "Semana", dia: "Dia" }

function lembrarVisao(visao: VisaoAgenda) {
  document.cookie = `${COOKIE_VISAO_AGENDA}=${visao}; path=/painel/ferramentas/agenda; max-age=31536000; samesite=lax`
}

/** Lista · Mês · Semana · Dia. A última escolha fica lembrada no navegador. */
export function AlternarVisao({ atual, consulta }: { atual: VisaoAgenda; consulta: string }) {
  return (
    <div role="group" aria-label="Forma de ver a agenda" className="bg-muted inline-flex rounded-lg p-0.5">
      {(Object.keys(ROTULOS_VISAO) as VisaoAgenda[]).map((v) => {
        const qs = new URLSearchParams(consulta)
        qs.set("visao", v)
        return (
          <Link
            key={v}
            href={`${BASE}?${qs}`}
            onClick={() => lembrarVisao(v)}
            aria-current={v === atual ? "page" : undefined}
            className={cn(
              "rounded-md px-3 py-1.5 text-sm pointer-coarse:py-2.5",
              v === atual ? "bg-background font-medium shadow-xs" : "text-muted-foreground hover:text-foreground"
            )}
          >
            {ROTULOS_VISAO[v]}
          </Link>
        )
      })}
    </div>
  )
}

// ── Calendário ──────────────────────────────────────────────────────────────

type Props = {
  visao: VisaoCalendario
  /** O dia em foco ("AAAA-MM-DD"). */
  dia: string
  dias: string[]
  hoje: string
  eventos: EventoLinha[]
  podeCriar: boolean
  /** Filtros (busca, tipo) a manter ao navegar. */
  consulta: string
}

/** O compromisso sendo arrastado e o ponto em que foi pego. */
type Arrastado = { evento: EventoLinha; diaPego: string; minutosPegos: number }
/** Onde ele cairia: `minuto` só na grade de horas. */
type Alvo = { dia: string; minuto?: number }

type ControleArrasto = {
  atual: Arrastado | null
  alvo: Alvo | null
  pode: (e: EventoLinha) => boolean
  iniciar: (ev: DragEvent<HTMLElement>, evento: EventoLinha, pego: { dia: string; minutos?: number }) => void
  sobreDias: (ev: DragEvent<HTMLElement>, dias: string[], soFaixas?: boolean) => void
  soltarNosDias: (ev: DragEvent<HTMLElement>, dias: string[], soFaixas?: boolean) => void
  sobreHoras: (ev: DragEvent<HTMLElement>, dia: string) => void
  soltarNasHoras: (ev: DragEvent<HTMLElement>, dia: string) => void
  terminar: () => void
}

function diaNoPonto(ev: DragEvent<HTMLElement>, dias: string[]): string {
  const caixa = ev.currentTarget.getBoundingClientRect()
  const i = Math.floor(((ev.clientX - caixa.left) / caixa.width) * dias.length)
  return dias[Math.max(0, Math.min(dias.length - 1, i))]
}

export function Calendario({ visao, dia, dias, hoje, eventos: eventosDoServidor, podeCriar, consulta }: Props) {
  const [vaga, setVaga] = useState<VagaNaAgenda | null>(null)
  const [aberto, setAberto] = useState<EventoLinha | null>(null)
  // Move na hora; se o servidor recusar, o compromisso volta sozinho.
  const [eventos, aplicar] = useOptimistic(
    eventosDoServidor,
    (atual, m: { id: string; inicio: string }) =>
      atual.map((e) => (e.id === m.id ? { ...e, ...aplicarMovimento(e, m.inicio) } : e))
  )
  const pego = useRef<Arrastado | null>(null)
  const [atual, setAtual] = useState<Arrastado | null>(null)
  const [alvo, setAlvo] = useState<Alvo | null>(null)
  const [erroMover, setErroMover] = useState<string | null>(null)
  const [movido, setMovido] = useState<{ evento: EventoLinha; inicioAnterior: string; rotulo: string } | null>(null)

  function mover(evento: EventoLinha, novoInicio: string, desfazendo = false) {
    const inicioAnterior = evento.inicio
    setErroMover(null)
    startTransition(async () => {
      aplicar({ id: evento.id, inicio: novoInicio })
      const { erro } = await moverCompromissoAction(evento.id, novoInicio)
      if (erro) {
        setErroMover(erro)
        setMovido(null)
      } else if (desfazendo || !inicioAnterior) {
        setMovido(null)
      } else {
        const novo = { ...evento, ...aplicarMovimento(evento, novoInicio) }
        setMovido({ evento: novo, inicioAnterior, rotulo: rotuloPeriodo(novo) })
      }
    })
  }

  function terminar() {
    pego.current = null
    setAtual(null)
    setAlvo(null)
  }

  function marcarAlvo(novo: Alvo) {
    setAlvo((a) => (a?.dia === novo.dia && a?.minuto === novo.minuto ? a : novo))
  }

  const minutoNoPonto = (ev: DragEvent<HTMLElement>, a: Arrastado) =>
    encaixarMinuto(
      ((ev.clientY - ev.currentTarget.getBoundingClientRect().top) / ALTURA_HORA) * 60 - a.minutosPegos,
      duracaoEmMinutos(a.evento)
    )

  const arrasto: ControleArrasto = {
    atual,
    alvo,
    pode: (e) => podeCriar && e.origem === "avulso" && Boolean(e.inicio),
    iniciar(ev, evento, ponto) {
      ev.dataTransfer.effectAllowed = "move"
      ev.dataTransfer.setData("text/plain", evento.atividade ?? "Compromisso")
      const a = { evento, diaPego: ponto.dia, minutosPegos: ponto.minutos ?? 0 }
      pego.current = a
      setMovido(null)
      // Mudar a tela durante o dragstart cancela o arrasto no Chrome.
      setTimeout(() => setAtual(pego.current), 0)
    },
    sobreDias(ev, diasAlvo, soFaixas) {
      const a = pego.current
      if (!a || (soFaixas && !ehFaixa(a.evento))) return
      ev.preventDefault()
      ev.dataTransfer.dropEffect = "move"
      marcarAlvo({ dia: diaNoPonto(ev, diasAlvo) })
    },
    soltarNosDias(ev, diasAlvo, soFaixas) {
      const a = pego.current
      if (!a || !a.evento.inicio || (soFaixas && !ehFaixa(a.evento))) return
      ev.preventDefault()
      const n = diferencaDias(a.diaPego, diaNoPonto(ev, diasAlvo))
      terminar()
      if (n !== 0) mover(a.evento, deslocarDias(a.evento.inicio, n))
    },
    sobreHoras(ev, diaAlvo) {
      const a = pego.current
      if (!a || ehFaixa(a.evento)) return
      ev.preventDefault()
      ev.dataTransfer.dropEffect = "move"
      marcarAlvo({ dia: diaAlvo, minuto: minutoNoPonto(ev, a) })
    },
    soltarNasHoras(ev, diaAlvo) {
      const a = pego.current
      if (!a || !a.evento.inicio || ehFaixa(a.evento)) return
      ev.preventDefault()
      const novo = inicioNoHorario(diaAlvo, minutoNoPonto(ev, a))
      terminar()
      if (new Date(novo).getTime() !== new Date(a.evento.inicio).getTime()) mover(a.evento, novo)
    },
    terminar,
  }

  const href = (v: VisaoCalendario, d: string) => {
    const qs = new URLSearchParams(consulta)
    qs.set("visao", v)
    qs.set("data", d)
    return `${BASE}?${qs}`
  }
  const comuns = {
    eventos,
    hoje,
    podeCriar,
    href,
    aoCriar: setVaga,
    aoAbrir: setAberto,
    arrasto,
  }

  return (
    <>
      <div className="flex flex-wrap items-center gap-2">
        <Button variant="outline" size="sm" asChild>
          <Link href={href(visao, hoje)}>Hoje</Link>
        </Button>
        <div className="flex items-center">
          <Button variant="ghost" size="icon" asChild title="Anterior" aria-label="Período anterior">
            <Link href={href(visao, navegar(visao, dia, -1))}>
              <ChevronLeft />
            </Link>
          </Button>
          <Button variant="ghost" size="icon" asChild title="Seguinte" aria-label="Período seguinte">
            <Link href={href(visao, navegar(visao, dia, 1))}>
              <ChevronRight />
            </Link>
          </Button>
        </div>
        <h2 aria-live="polite" className="text-lg font-semibold first-letter:uppercase">
          {tituloDaVisao(visao, dia)}
        </h2>
        {movido && (
          <p role="status" className="text-muted-foreground ml-auto flex flex-wrap items-center gap-x-2 text-xs">
            <span>Movido para {movido.rotulo}.</span>
            <button
              type="button"
              className="text-primary font-medium hover:underline"
              onClick={() => mover(movido.evento, movido.inicioAnterior, true)}
            >
              Desfazer
            </button>
          </p>
        )}
      </div>

      {erroMover && (
        <Alert variant="destructive">
          <AlertDescription>{erroMover}</AlertDescription>
        </Alert>
      )}

      <div
        className="bg-card overflow-hidden rounded-xl border"
        onDragLeave={(ev) => {
          if (!ev.currentTarget.contains(ev.relatedTarget as Node | null)) setAlvo(null)
        }}
      >
        {visao === "mes" ? (
          <GradeDoMes {...comuns} dias={dias} mes={dia.slice(0, 7)} />
        ) : (
          <GradeDeHoras key={visao} {...comuns} dias={dias} />
        )}
      </div>

      <ul className="text-muted-foreground flex flex-wrap gap-x-4 gap-y-1 text-xs">
        {LEGENDA.map((l) => (
          <li key={l.rotulo} className="flex items-center gap-1.5">
            <span aria-hidden className={cn("size-3 rounded-sm border-l-[3px]", CORES[l.cor])} />
            {l.rotulo}
          </li>
        ))}
      </ul>
      {podeCriar && (
        <p className="text-muted-foreground text-xs">
          Clique em um dia ou horário livre para marcar um compromisso. Arraste para mudar de dia ou horário.
        </p>
      )}

      <Dialog open={vaga !== null} onOpenChange={(o) => !o && setVaga(null)}>
        <DialogContent className="sm:max-w-lg">{vaga && <NovoRapido vaga={vaga} aoFechar={() => setVaga(null)} />}</DialogContent>
      </Dialog>
      <Dialog open={aberto !== null} onOpenChange={(o) => !o && setAberto(null)}>
        <DialogContent>
          {aberto && <DetalheRapido evento={aberto} podeEditar={podeCriar} aoFechar={() => setAberto(null)} />}
        </DialogContent>
      </Dialog>
    </>
  )
}

type Comuns = {
  eventos: EventoLinha[]
  dias: string[]
  hoje: string
  podeCriar: boolean
  href: (v: VisaoCalendario, d: string) => string
  aoCriar: (v: VagaNaAgenda) => void
  aoAbrir: (e: EventoLinha) => void
  arrasto: ControleArrasto
}

/** Clique, teclado e arrasto do compromisso. É div: o Firefox não arrasta <button>. */
function propsDoCompromisso(
  evento: EventoLinha,
  aoAbrir: (e: EventoLinha) => void,
  arrasto: ControleArrasto,
  ponto: (ev: DragEvent<HTMLElement>) => { dia: string; minutos?: number }
) {
  const pode = arrasto.pode(evento)
  return {
    role: "button",
    tabIndex: 0,
    draggable: pode,
    onClick: () => aoAbrir(evento),
    onKeyDown: (ev: KeyboardEvent) => {
      if (ev.key === "Enter" || ev.key === " ") {
        ev.preventDefault()
        aoAbrir(evento)
      }
    },
    onDragStart: (ev: DragEvent<HTMLElement>) => arrasto.iniciar(ev, evento, ponto(ev)),
    onDragEnd: arrasto.terminar,
    classe: cn(
      pode ? "cursor-grab active:cursor-grabbing" : "cursor-pointer",
      arrasto.atual?.evento.id === evento.id && "opacity-40"
    ),
  }
}

/** O dia recebe o compromisso que está sendo arrastado? */
function diaDestacado(arrasto: ControleArrasto, dia: string): boolean {
  const { atual, alvo } = arrasto
  if (!atual || !alvo || alvo.minuto !== undefined) return false
  const destino = diasDoDestino(atual.evento, atual.diaPego, alvo.dia)
  return Boolean(destino) && dia >= destino!.de && dia <= destino!.ate
}

function NumeroDoDia({ dia, hoje, href, apagado }: { dia: string; hoje: string; href: string; apagado?: boolean }) {
  return (
    <Link
      href={href}
      title={`Ver ${rotuloDia(dia)}`}
      aria-label={`Ver ${rotuloDia(dia)}`}
      aria-current={dia === hoje ? "date" : undefined}
      className={cn(
        "pointer-events-auto flex size-7 pointer-coarse:size-9 items-center justify-center rounded-full text-xs hover:underline",
        dia === hoje ? "bg-primary text-primary-foreground font-semibold" : apagado && "text-muted-foreground"
      )}
    >
      {Number(dia.slice(8))}
    </Link>
  )
}

/** Barra de compromisso na faixa do mês ou no topo da semana. */
function BarraEvento({
  evento,
  coluna,
  span,
  linha,
  continuaAntes,
  continuaDepois,
  aoAbrir,
  dias,
  arrasto,
}: {
  evento: EventoLinha
  coluna: number
  span: number
  linha: number
  continuaAntes: boolean
  continuaDepois: boolean
  aoAbrir: (e: EventoLinha) => void
  dias: string[]
  arrasto: ControleArrasto
}) {
  const faixa = ehFaixa(evento)
  const titulo = evento.atividade ?? "(sem título)"
  const { classe, ...acoes } = propsDoCompromisso(evento, aoAbrir, arrasto, (ev) => {
    // Em barra de vários dias, conta o dia em que ela foi pega.
    const caixa = ev.currentTarget.getBoundingClientRect()
    const i = Math.floor(((ev.clientX - caixa.left) / caixa.width) * span)
    return { dia: dias[coluna + Math.max(0, Math.min(span - 1, i))] }
  })
  return (
    <div
      {...acoes}
      style={{ gridColumn: `${coluna + 1} / span ${span}`, gridRow: linha + 1 }}
      title={`${titulo} — ${rotuloPeriodo(evento)}`}
      className={cn(
        "pointer-events-auto mx-0.5 flex min-w-0 items-center gap-1 overflow-hidden rounded-sm border-l-[3px] px-1 text-left text-xs leading-5 hover:brightness-95 dark:hover:brightness-125",
        corDoEvento(evento),
        classe,
        continuaAntes && "ml-0 rounded-l-none",
        continuaDepois && "mr-0 rounded-r-none"
      )}
    >
      {!faixa && evento.inicio && (
        <span className="text-muted-foreground hidden shrink-0 sm:inline">
          {horaDeMinutos(minutosSP(evento.inicio))}
        </span>
      )}
      <span className="truncate font-medium">{titulo}</span>
    </div>
  )
}

// ── Mês ─────────────────────────────────────────────────────────────────────

function GradeDoMes(props: Comuns & { mes: string }) {
  const { dias } = props
  const semanas = Array.from({ length: dias.length / 7 }, (_, i) => dias.slice(i * 7, i * 7 + 7))
  return (
    <div>
      <div className="grid grid-cols-7 border-b">
        {DIAS_SEMANA.map((d) => (
          <div key={d} className="text-muted-foreground py-1.5 text-center text-xs font-medium">
            {d}
          </div>
        ))}
      </div>
      {semanas.map((s) => (
        <SemanaDoMes key={s[0]} {...props} semana={s} />
      ))}
    </div>
  )
}

function SemanaDoMes({
  semana,
  mes,
  eventos,
  hoje,
  podeCriar,
  href,
  aoCriar,
  aoAbrir,
  arrasto,
}: Comuns & { semana: string[]; mes: string }) {
  const { barras, ocultos } = distribuirNaSemana(eventos, semana, LINHAS_NO_MES)
  return (
    <div
      className="relative border-b last:border-b-0"
      onDragOver={(ev) => arrasto.sobreDias(ev, semana)}
      onDrop={(ev) => arrasto.soltarNosDias(ev, semana)}
    >
      {/* Fundo: cada dia é o alvo do clique; as barras ficam por cima. */}
      <div className="absolute inset-0 grid grid-cols-7">
        {semana.map((d) => {
          const classe = cn(
            "border-l first:border-l-0",
            diaDestacado(arrasto, d) ? "bg-primary/20" : d.slice(0, 7) !== mes && "bg-muted/40"
          )
          return podeCriar ? (
            <button
              key={d}
              type="button"
              onClick={() => aoCriar({ dia: d })}
              aria-label={`Novo compromisso em ${rotuloDia(d)}`}
              className={cn(classe, "hover:bg-accent/60 cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-inset")}
            />
          ) : (
            <div key={d} className={classe} />
          )
        })}
      </div>
      <div className="pointer-events-none relative">
        <div className="grid grid-cols-7">
          {semana.map((d) => (
            <div key={d} className="flex justify-center py-1">
              <NumeroDoDia dia={d} hoje={hoje} href={href("dia", d)} apagado={d.slice(0, 7) !== mes} />
            </div>
          ))}
        </div>
        <div
          className="grid grid-cols-7 gap-y-0.5 pb-1"
          style={{ gridTemplateRows: `repeat(${LINHAS_NO_MES + 1}, 1.25rem)` }}
        >
          {barras.map((b) => (
            <BarraEvento
              key={`${b.evento.id}-${b.coluna}`}
              evento={b.evento}
              coluna={b.coluna}
              span={b.span}
              linha={b.linha}
              continuaAntes={b.continuaAntes}
              continuaDepois={b.continuaDepois}
              aoAbrir={aoAbrir}
              dias={semana}
              arrasto={arrasto}
            />
          ))}
          {ocultos.map((n, i) =>
            n > 0 ? (
              <Link
                key={semana[i]}
                href={href("dia", semana[i])}
                style={{ gridColumn: i + 1, gridRow: LINHAS_NO_MES + 1 }}
                className="text-muted-foreground hover:text-foreground pointer-events-auto truncate px-1.5 text-xs leading-5 hover:underline"
              >
                +{n} <span className="hidden sm:inline">mais</span>
              </Link>
            ) : null
          )}
        </div>
      </div>
    </div>
  )
}

// ── Semana e dia ────────────────────────────────────────────────────────────

/** Minuto atual em Brasília; `null` no servidor, para não divergir na hidratação. */
function useMinutoAtual(): number | null {
  return useSyncExternalStore(
    (avisar) => {
      const t = setInterval(avisar, 60_000)
      return () => clearInterval(t)
    },
    () => minutosSP(new Date()),
    () => null
  )
}

function GradeDeHoras({ dias, eventos, hoje, podeCriar, href, aoCriar, aoAbrir, arrasto }: Comuns) {
  const rolagem = useRef<HTMLDivElement>(null)
  const agora = useMinutoAtual()
  const faixas = eventos.filter(ehFaixa)
  const { barras } = distribuirNaSemana(faixas, dias)
  const linhas = barras.reduce((m, b) => Math.max(m, b.linha + 1), 0)
  const colunas = `3.5rem repeat(${dias.length}, minmax(0, 1fr))`

  useEffect(() => {
    if (rolagem.current) rolagem.current.scrollTop = HORA_DE_ABERTURA * ALTURA_HORA
  }, [])

  return (
    <div ref={rolagem} className="max-h-[70vh] overflow-auto">
      <div style={{ minWidth: dias.length > 1 ? "44rem" : undefined }}>
        {/* Cabeçalho fixo: dias e faixas de dia todo */}
        <div className="bg-card sticky top-0 z-20 border-b">
          <div className="grid" style={{ gridTemplateColumns: colunas }}>
            <div className="bg-card sticky left-0 z-10" />
            {dias.map((d) => (
              <div key={d} className="flex flex-col items-center gap-0.5 border-l py-1.5">
                <span className="text-muted-foreground text-xs">{DIAS_SEMANA[diaDaSemana(d)]}</span>
                <NumeroDoDia dia={d} hoje={hoje} href={href("dia", d)} />
              </div>
            ))}
          </div>
          <div className="relative grid" style={{ gridTemplateColumns: colunas }}>
            <div className="text-muted-foreground bg-card sticky left-0 z-10 flex items-start justify-end pt-1 pr-1.5 text-[0.65rem]">
              dia todo
            </div>
            <div
              className="relative min-h-7"
              style={{ gridColumn: `2 / span ${dias.length}` }}
              onDragOver={(ev) => arrasto.sobreDias(ev, dias, true)}
              onDrop={(ev) => arrasto.soltarNosDias(ev, dias, true)}
            >
              <div className="absolute inset-0 grid" style={{ gridTemplateColumns: `repeat(${dias.length}, minmax(0, 1fr))` }}>
                {dias.map((d) =>
                  podeCriar ? (
                    <button
                      key={d}
                      type="button"
                      onClick={() => aoCriar({ dia: d, diaTodo: true })}
                      aria-label={`Novo compromisso de dia todo em ${rotuloDia(d)}`}
                      className={cn(
                        "hover:bg-accent/60 cursor-pointer border-l outline-none focus-visible:ring-2 focus-visible:ring-inset",
                        diaDestacado(arrasto, d) && "bg-primary/20"
                      )}
                    />
                  ) : (
                    <div key={d} className="border-l" />
                  )
                )}
              </div>
              <div
                className="pointer-events-none relative grid gap-y-0.5 py-0.5"
                style={{
                  gridTemplateColumns: `repeat(${dias.length}, minmax(0, 1fr))`,
                  gridTemplateRows: linhas ? `repeat(${linhas}, 1.25rem)` : undefined,
                }}
              >
                {barras.map((b) => (
                  <BarraEvento
                    key={`${b.evento.id}-${b.coluna}`}
                    evento={b.evento}
                    coluna={b.coluna}
                    span={b.span}
                    linha={b.linha}
                    continuaAntes={b.continuaAntes}
                    continuaDepois={b.continuaDepois}
                    aoAbrir={aoAbrir}
                    dias={dias}
                    arrasto={arrasto}
                  />
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* Horas */}
        <div className="grid" style={{ gridTemplateColumns: colunas }}>
          <div className="bg-card sticky left-0 z-10">
            {Array.from({ length: 24 }, (_, h) => (
              <div key={h} style={{ height: ALTURA_HORA }} className="text-muted-foreground pr-1.5 text-right text-[0.65rem] leading-none">
                {h > 0 && <span className="relative -top-1.5">{String(h).padStart(2, "0")}:00</span>}
              </div>
            ))}
          </div>
          {dias.map((d) => (
            <ColunaDoDia
              key={d}
              dia={d}
              eventos={eventos}
              podeCriar={podeCriar}
              agora={d === hoje ? agora : null}
              aoCriar={aoCriar}
              aoAbrir={aoAbrir}
              arrasto={arrasto}
            />
          ))}
        </div>
      </div>
    </div>
  )
}

function ColunaDoDia({
  dia,
  eventos,
  podeCriar,
  agora,
  aoCriar,
  aoAbrir,
  arrasto,
}: {
  dia: string
  eventos: EventoLinha[]
  podeCriar: boolean
  agora: number | null
  aoCriar: (v: VagaNaAgenda) => void
  aoAbrir: (e: EventoLinha) => void
  arrasto: ControleArrasto
}) {
  const blocos = distribuirNoDia(eventos, dia)
  const { atual, alvo } = arrasto
  const destino = atual && alvo?.dia === dia && alvo.minuto !== undefined ? alvo.minuto : null
  const duracaoDestino = atual ? duracaoEmMinutos(atual.evento) : 60
  return (
    <div
      className="relative border-l"
      style={{ height: ALTURA_HORA * 24 }}
      onDragOver={(ev) => arrasto.sobreHoras(ev, dia)}
      onDrop={(ev) => arrasto.soltarNasHoras(ev, dia)}
    >
      {Array.from({ length: 24 }, (_, h) =>
        podeCriar ? (
          <button
            key={h}
            type="button"
            aria-label={`Novo compromisso em ${rotuloDia(dia)} às ${String(h).padStart(2, "0")}:00`}
            onClick={(e) => {
              // Metade de baixo da hora marca :30; pelo teclado (detail 0), a hora cheia.
              const caixa = e.currentTarget.getBoundingClientRect()
              const meia = e.detail > 0 && e.clientY - caixa.top >= caixa.height / 2
              aoCriar({ dia, minuto: h * 60 + (meia ? 30 : 0) })
            }}
            style={{ height: ALTURA_HORA }}
            className="hover:bg-accent/60 block w-full cursor-pointer border-b outline-none last:border-b-0 focus-visible:ring-2 focus-visible:ring-inset"
          />
        ) : (
          <div key={h} style={{ height: ALTURA_HORA }} className="border-b last:border-b-0" />
        )
      )}
      {blocos.map((b) => {
        const titulo = b.evento.atividade ?? "(sem título)"
        const curto = b.fimMin - b.inicioMin < 45
        const { classe, ...acoes } = propsDoCompromisso(b.evento, aoAbrir, arrasto, (ev) => ({
          dia,
          minutos: ((ev.clientY - ev.currentTarget.getBoundingClientRect().top) / ALTURA_HORA) * 60,
        }))
        return (
          <div
            key={b.evento.id}
            {...acoes}
            title={`${titulo} — ${rotuloPeriodo(b.evento)}`}
            style={{
              top: (b.inicioMin / 60) * ALTURA_HORA,
              height: ((b.fimMin - b.inicioMin) / 60) * ALTURA_HORA - 1,
              left: `${(b.coluna / b.colunas) * 100}%`,
              width: `calc(${100 / b.colunas}% - 4px)`,
            }}
            className={cn(
              "absolute overflow-hidden rounded-sm border-l-[3px] px-1 text-left text-xs leading-4 hover:brightness-95 dark:hover:brightness-125",
              corDoEvento(b.evento),
              classe,
              curto && "flex items-center gap-1"
            )}
          >
            <span className="block truncate font-medium">{titulo}</span>
            <span className="text-muted-foreground block truncate">
              {horaDeMinutos(b.inicioMin)}
              {b.evento.termino ? ` – ${horaDeMinutos(b.fimMin)}` : ""}
            </span>
          </div>
        )
      })}
      {destino !== null && (
        <div
          aria-hidden
          className="border-primary bg-primary/20 pointer-events-none absolute inset-x-0.5 z-10 overflow-hidden rounded-sm border-2 border-dashed px-1 text-xs font-medium"
          style={{ top: (destino / 60) * ALTURA_HORA, height: (duracaoDestino / 60) * ALTURA_HORA - 1 }}
        >
          {horaDeMinutos(destino)} – {horaDeMinutos(destino + duracaoDestino)}
        </div>
      )}
      {agora !== null && (
        <div
          aria-hidden
          className="bg-primary pointer-events-none absolute inset-x-0 z-10 h-0.5"
          style={{ top: (agora / 60) * ALTURA_HORA }}
        >
          <span className="bg-primary absolute -top-1 -left-1 size-2.5 rounded-full" />
        </div>
      )}
    </div>
  )
}

// ── Criação rápida ──────────────────────────────────────────────────────────

function NovoRapido({ vaga, aoFechar }: { vaga: VagaNaAgenda; aoFechar: () => void }) {
  const router = useRouter()
  const [estado, acao, pendente] = useActionState(salvarCompromissoAction, {})
  const envio = useEnvioFormulario(acao, estado, { manter: true })
  const campos = camposDaVaga(vaga)
  const [diaTodo, setDiaTodo] = useState(campos.diaTodo)

  useEffect(() => {
    if (estado.ok) aoFechar()
  }, [estado.ok, aoFechar])

  /** Leva o que já foi digitado para o formulário completo. */
  function maisOpcoes() {
    const fd = new FormData(envio.ref.current ?? undefined)
    const qs = new URLSearchParams()
    for (const c of ["atividade", "tipo", "local", "inicio", "termino", "data_inicio", "data_termino"]) {
      const v = String(fd.get(c) ?? "").trim()
      if (v) qs.set(c, v)
    }
    if (diaTodo) qs.set("dia_todo", "1")
    router.push(`${BASE}/novo?${qs}`)
  }

  return (
    <form action={acao} {...envio} className="grid gap-4">
      <input type="hidden" name="ficar" value="1" />
      <DialogHeader>
        <DialogTitle>Novo compromisso</DialogTitle>
        <DialogDescription className="first-letter:uppercase">{rotuloDia(vaga.dia)}</DialogDescription>
      </DialogHeader>
      {estado.erro && (
        <Alert variant="destructive">
          <AlertDescription>{estado.erro}</AlertDescription>
        </Alert>
      )}
      <div className="grid gap-1.5">
        <Label htmlFor="rapido-atividade">Título *</Label>
        <Input
          id="rapido-atividade"
          name="atividade"
          required
          autoFocus
          maxLength={TITULO_MAX_AGENDA}
          placeholder="Ex.: Reunião com a base do Edise"
        />
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="grid gap-1.5">
          <Label htmlFor="rapido-tipo">Tipo *</Label>
          <select id="rapido-tipo" name="tipo" required defaultValue="" className={SELECT}>
            <option value="" disabled>
              Escolha o tipo
            </option>
            {TIPOS_AGENDA_AVULSA.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        </div>
        <label className="flex items-center gap-2 self-end pb-2 text-sm">
          <input
            type="checkbox"
            name="dia_todo"
            checked={diaTodo}
            onChange={(e) => setDiaTodo(e.target.checked)}
            className="size-4"
          />
          Dia todo
        </label>
        {diaTodo ? (
          <>
            <div className="grid gap-1.5">
              <Label htmlFor="rapido-data-inicio">Data *</Label>
              <input id="rapido-data-inicio" name="data_inicio" type="date" required defaultValue={campos.data} className={SELECT} />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="rapido-data-termino">Até (opcional)</Label>
              <input id="rapido-data-termino" name="data_termino" type="date" className={SELECT} />
            </div>
          </>
        ) : (
          <>
            <div className="grid gap-1.5">
              <Label htmlFor="rapido-inicio">Início *</Label>
              <input id="rapido-inicio" name="inicio" type="datetime-local" required defaultValue={campos.inicio} className={SELECT} />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="rapido-termino">Término (opcional)</Label>
              <input id="rapido-termino" name="termino" type="datetime-local" defaultValue={campos.termino} className={SELECT} />
            </div>
          </>
        )}
      </div>
      <div className="grid gap-1.5">
        <Label htmlFor="rapido-local">Local</Label>
        <Input id="rapido-local" name="local" placeholder="Ex.: Auditório da sede, ou link da reunião on-line" />
      </div>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Button type="button" variant="ghost" onClick={maisOpcoes}>
          Mais opções
        </Button>
        <div className="flex gap-2">
          <Button type="button" variant="outline" onClick={aoFechar}>
            Cancelar
          </Button>
          <Button type="submit" disabled={pendente}>
            {pendente ? <Loader2 className="animate-spin" /> : <Save />}
            Salvar
          </Button>
        </div>
      </div>
    </form>
  )
}

// ── Detalhe rápido ──────────────────────────────────────────────────────────

function DetalheRapido({
  evento: e,
  podeEditar,
  aoFechar,
}: {
  evento: EventoLinha
  podeEditar: boolean
  aoFechar: () => void
}) {
  const campos = [
    { rotulo: "Local", valor: e.local },
    { rotulo: "Sede", valor: e.sedeNome },
    { rotulo: "Departamento", valor: e.departamentoNome },
  ].filter((c) => c.valor)
  return (
    <div className="grid gap-4">
      <DialogHeader>
        <DialogTitle className="pr-6">{e.atividade ?? "(sem título)"}</DialogTitle>
        <DialogDescription>{rotuloPeriodo(e)}</DialogDescription>
      </DialogHeader>
      {e.tipo && (
        <div>
          <Badge variant="outline">{e.tipo}</Badge>
        </div>
      )}
      {campos.length > 0 && (
        <dl className="grid gap-2 text-sm">
          {campos.map((c) => (
            <div key={c.rotulo}>
              <dt className="text-muted-foreground text-xs">{c.rotulo}</dt>
              <dd className="break-words">{c.valor}</dd>
            </div>
          ))}
        </dl>
      )}
      {e.origem !== "avulso" && (
        <p className="text-muted-foreground text-xs">
          {e.origem === "evento"
            ? "Este compromisso vem do módulo Eventos e é alterado por lá."
            : "Este compromisso vem de uma assembleia e é alterado em Votações."}
        </p>
      )}
      <div className="flex flex-wrap items-center justify-end gap-2">
        {podeEditar && e.origem === "avulso" && <ExcluirCompromissoBotao id={e.id} aoExcluir={aoFechar} />}
        <Button variant="outline" asChild>
          <Link href={`${BASE}/${e.id}`}>
            <Eye />
            Ver detalhes
          </Link>
        </Button>
        {podeEditar && e.origem === "avulso" && (
          <Button asChild>
            <Link href={`${BASE}/${e.id}?editar=1`}>
              <Pencil />
              Editar
            </Link>
          </Button>
        )}
        {podeEditar && e.origem !== "avulso" && e.linkOrigem && (
          <Button asChild>
            <Link href={e.linkOrigem}>
              <ExternalLink />
              {e.origem === "evento" ? "Editar em Eventos" : "Editar em Votações"}
            </Link>
          </Button>
        )}
      </div>
    </div>
  )
}
