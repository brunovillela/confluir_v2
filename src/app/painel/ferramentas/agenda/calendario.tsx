"use client"

import { useActionState, useEffect, useRef, useState, useSyncExternalStore } from "react"
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
  camposDaVaga,
  COOKIE_VISAO_AGENDA,
  diaDaSemana,
  distribuirNaSemana,
  distribuirNoDia,
  ehFaixa,
  horaDeMinutos,
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

import { salvarCompromissoAction } from "./actions"
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

export function Calendario({ visao, dia, dias, hoje, eventos, podeCriar, consulta }: Props) {
  const [vaga, setVaga] = useState<VagaNaAgenda | null>(null)
  const [aberto, setAberto] = useState<EventoLinha | null>(null)

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
      </div>

      <div className="bg-card overflow-hidden rounded-xl border">
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
          Clique em um dia ou horário livre para marcar um compromisso.
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
}: {
  evento: EventoLinha
  coluna: number
  span: number
  linha: number
  continuaAntes: boolean
  continuaDepois: boolean
  aoAbrir: (e: EventoLinha) => void
}) {
  const faixa = ehFaixa(evento)
  const titulo = evento.atividade ?? "(sem título)"
  return (
    <button
      type="button"
      onClick={() => aoAbrir(evento)}
      style={{ gridColumn: `${coluna + 1} / span ${span}`, gridRow: linha + 1 }}
      title={`${titulo} — ${rotuloPeriodo(evento)}`}
      className={cn(
        "pointer-events-auto mx-0.5 flex min-w-0 items-center gap-1 overflow-hidden rounded-sm border-l-[3px] px-1 text-left text-xs leading-5 hover:brightness-95 dark:hover:brightness-125",
        corDoEvento(evento),
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
    </button>
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
}: Comuns & { semana: string[]; mes: string }) {
  const { barras, ocultos } = distribuirNaSemana(eventos, semana, LINHAS_NO_MES)
  return (
    <div className="relative border-b last:border-b-0">
      {/* Fundo: cada dia é o alvo do clique; as barras ficam por cima. */}
      <div className="absolute inset-0 grid grid-cols-7">
        {semana.map((d) => {
          const classe = cn("border-l first:border-l-0", d.slice(0, 7) !== mes && "bg-muted/40")
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

function GradeDeHoras({ dias, eventos, hoje, podeCriar, href, aoCriar, aoAbrir }: Comuns) {
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
            <div className="relative min-h-7" style={{ gridColumn: `2 / span ${dias.length}` }}>
              <div className="absolute inset-0 grid" style={{ gridTemplateColumns: `repeat(${dias.length}, minmax(0, 1fr))` }}>
                {dias.map((d) =>
                  podeCriar ? (
                    <button
                      key={d}
                      type="button"
                      onClick={() => aoCriar({ dia: d, diaTodo: true })}
                      aria-label={`Novo compromisso de dia todo em ${rotuloDia(d)}`}
                      className="hover:bg-accent/60 cursor-pointer border-l outline-none focus-visible:ring-2 focus-visible:ring-inset"
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
}: {
  dia: string
  eventos: EventoLinha[]
  podeCriar: boolean
  agora: number | null
  aoCriar: (v: VagaNaAgenda) => void
  aoAbrir: (e: EventoLinha) => void
}) {
  const blocos = distribuirNoDia(eventos, dia)
  return (
    <div className="relative border-l" style={{ height: ALTURA_HORA * 24 }}>
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
        return (
          <button
            key={b.evento.id}
            type="button"
            onClick={() => aoAbrir(b.evento)}
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
              curto && "flex items-center gap-1"
            )}
          >
            <span className="block truncate font-medium">{titulo}</span>
            <span className="text-muted-foreground block truncate">
              {horaDeMinutos(b.inicioMin)}
              {b.evento.termino ? ` – ${horaDeMinutos(b.fimMin)}` : ""}
            </span>
          </button>
        )
      })}
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
