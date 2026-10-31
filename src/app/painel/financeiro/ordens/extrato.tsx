import Link from "next/link"
import { AlertTriangle, CalendarClock, CalendarDays, CheckCircle2, ChevronDown, ReceiptText } from "lucide-react"

import { Badge } from "@/components/ui/badge"
import type { DiaExtrato, ExtratoOrdens, OrdemLinha } from "@/lib/db/financeiro"
import { formatarData, formatarMoeda } from "@/lib/formato"
import { cn } from "@/lib/utils"

import { SituacaoBadge } from "../situacao-badge"

const DIAS_SEMANA = ["domingo", "segunda", "terça", "quarta", "quinta", "sexta", "sábado"]

/** "Hoje", "Amanhã", "Ontem" ou "seg., 03/11/2026". */
function rotuloDia(data: string, hoje: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(data)) return "Sem vencimento"
  const dif = Math.round((Date.parse(`${data}T12:00:00Z`) - Date.parse(`${hoje}T12:00:00Z`)) / 86_400_000)
  if (dif === 0) return "Hoje"
  if (dif === 1) return "Amanhã"
  if (dif === -1) return "Ontem"
  const semana = DIAS_SEMANA[new Date(`${data}T12:00:00Z`).getUTCDay()]
  return `${semana}, ${formatarData(data)}`
}

function Linha({ o, data }: { o: OrdemLinha; data: "vencimento" | "pagamento" }) {
  const valor = o.valor_pago ?? o.valor_inicial_cobranca
  return (
    <Link
      href={`/painel/financeiro/ordens/${o.id}`}
      className="hover:bg-muted/50 grid grid-cols-[1fr_auto] items-center gap-x-3 gap-y-0.5 px-4 py-2.5 sm:grid-cols-[minmax(0,1fr)_minmax(0,14rem)_auto_auto]"
    >
      <span className="min-w-0">
        <span className="block truncate text-sm font-medium">{o.favorecido ?? o.descricao ?? "—"}</span>
        <span className="text-muted-foreground block truncate text-xs">
          <span className="font-mono">{o.codigo ?? "—"}</span>
          {o.favorecido && o.descricao ? ` · ${o.descricao}` : ""}
          {data === "pagamento" && o.vencimento ? ` · venceu ${formatarData(o.vencimento)}` : ""}
        </span>
      </span>
      <span className="text-muted-foreground hidden truncate text-xs sm:block">
        {[o.tipo, o.forma_pagamento].filter(Boolean).join(" · ") || "—"}
      </span>
      <span className="hidden sm:block">
        <SituacaoBadge situacao={o.situacao} />
      </span>
      <span className="text-right text-sm font-medium whitespace-nowrap tabular-nums">{formatarMoeda(valor)}</span>
    </Link>
  )
}

function Dia({ dia, hoje, data, destaque }: { dia: DiaExtrato; hoje: string; data: "vencimento" | "pagamento"; destaque?: string }) {
  return (
    <div>
      <div className={cn("bg-muted/40 flex items-baseline justify-between gap-2 border-y px-4 py-1.5 text-xs", destaque)}>
        <span className="font-medium first-letter:uppercase">{rotuloDia(dia.data, hoje)}</span>
        <span className="text-muted-foreground tabular-nums">
          {dia.linhas.length} · {formatarMoeda(dia.total)}
        </span>
      </div>
      <div className="divide-y">
        {dia.linhas.map((o) => (
          <Linha key={o.id} o={o} data={data} />
        ))}
      </div>
    </div>
  )
}

function Bloco({
  titulo,
  icone: Icone,
  dias,
  hoje,
  data,
  vazio,
  aberto = true,
  tom,
  rodape,
}: {
  titulo: string
  icone: typeof CalendarDays
  dias: DiaExtrato[]
  hoje: string
  data: "vencimento" | "pagamento"
  vazio: string
  aberto?: boolean
  tom?: "alerta"
  rodape?: React.ReactNode
}) {
  const quantidade = dias.reduce((n, d) => n + d.linhas.length, 0)
  const total = Math.round(dias.reduce((s, d) => s + d.total, 0) * 100) / 100
  return (
    <details open={aberto} className={cn("group bg-card overflow-hidden rounded-xl border", tom === "alerta" && "border-warning/50")}>
      <summary className="flex cursor-pointer items-center justify-between gap-3 px-4 py-3 select-none [&::-webkit-details-marker]:hidden">
        <span className="flex items-center gap-2 text-sm font-semibold">
          <Icone className={cn("size-4", tom === "alerta" ? "text-warning-fg" : "text-muted-foreground")} />
          {titulo}
          <Badge variant={tom === "alerta" && quantidade ? "warning" : "secondary"}>{quantidade}</Badge>
        </span>
        <span className="flex items-center gap-2">
          <span className="text-sm font-medium tabular-nums">{formatarMoeda(total)}</span>
          <ChevronDown className="text-muted-foreground size-4 transition-transform group-open:rotate-180" />
        </span>
      </summary>
      {quantidade === 0 ? (
        <p className="text-muted-foreground border-t px-4 py-6 text-center text-sm">{vazio}</p>
      ) : (
        dias.map((d) => <Dia key={d.data} dia={d} hoje={hoje} data={data} destaque={tom === "alerta" ? "bg-warning/10" : undefined} />)
      )}
      {rodape && <div className="border-t px-4 py-2.5 text-sm">{rodape}</div>}
    </details>
  )
}

/**
 * Extrato das ordens, como o do banco: lançamentos futuros, o dia de hoje,
 * as vencidas e, abaixo, o que já foi pago, dia a dia.
 */
export function ExtratoOrdensView({
  extrato,
  urlMaisFuturos,
  urlMaisPassado,
}: {
  extrato: ExtratoOrdens
  /** Link que mostra todos os futuros (null quando já mostra). */
  urlMaisFuturos: string | null
  urlMaisPassado: string
}) {
  const { hoje } = extrato
  const vazioGeral =
    extrato.futuros.length + extrato.atrasadas.length + extrato.realizados.length + extrato.hojeDia.linhas.length === 0 &&
    extrato.futurosAlem.quantidade === 0
  if (vazioGeral) {
    return (
      <div className="text-muted-foreground flex h-40 flex-col items-center justify-center gap-2 rounded-xl border text-center">
        <ReceiptText className="size-6" />
        <p className="text-sm">Nenhuma ordem no período com esses filtros.</p>
      </div>
    )
  }
  return (
    <div className="grid gap-4">
      <Bloco
        titulo="Lançamentos futuros"
        icone={CalendarClock}
        dias={extrato.futuros}
        hoje={hoje}
        data="vencimento"
        vazio="Nada a vencer nos próximos dias."
        rodape={
          extrato.futurosAlem.quantidade > 0 && urlMaisFuturos ? (
            <Link href={urlMaisFuturos} scroll={false} className="text-primary hover:underline">
              Mais {extrato.futurosAlem.quantidade} depois disso ({formatarMoeda(extrato.futurosAlem.total)}) — mostrar todos
            </Link>
          ) : null
        }
      />

      <Bloco
        titulo={`Hoje, ${formatarData(hoje)}`}
        icone={CalendarDays}
        dias={extrato.hojeDia.linhas.length ? [extrato.hojeDia] : []}
        hoje={hoje}
        data="vencimento"
        vazio="Nada vence nem foi pago hoje."
      />

      {extrato.atrasadas.length > 0 && (
        <Bloco
          titulo="Vencidas, ainda não pagas"
          icone={AlertTriangle}
          dias={extrato.atrasadas}
          hoje={hoje}
          data="vencimento"
          vazio=""
          tom="alerta"
        />
      )}

      <Bloco
        titulo={`Pagas desde ${formatarData(extrato.realizadosDe)}`}
        icone={CheckCircle2}
        dias={extrato.realizados}
        hoje={hoje}
        data="pagamento"
        vazio="Nenhum pagamento no período."
        rodape={
          <Link href={urlMaisPassado} scroll={false} className="text-primary hover:underline">
            Ver mais 30 dias para trás
          </Link>
        }
      />
    </div>
  )
}
