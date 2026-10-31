import Link from "next/link"
import { AlertTriangle, CalendarClock, CalendarDays, CheckCircle2, ChevronDown, ReceiptText } from "lucide-react"

import { Badge } from "@/components/ui/badge"
import type { DiaExtrato, ExtratoOrdens, OrdemLinha } from "@/lib/db/financeiro"
import { formatarData, formatarMoeda } from "@/lib/formato"
import { cn } from "@/lib/utils"

import { SituacaoBadge } from "../situacao-badge"
import { BarraSelecao, MarcarDia, MarcarOrdem, SelecaoExtrato } from "./selecao-extrato"

// O que pode ser pago (e ir para a remessa) a partir do extrato.
const PAGAVEIS = ["A pagar", "Processando"]
const pagavel = (o: OrdemLinha) => PAGAVEIS.includes(o.situacao ?? "")
const valorDe = (o: OrdemLinha) => Number(o.valor_inicial_cobranca ?? o.valor_pago ?? 0)

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

function Linha({ o, data, selecao }: { o: OrdemLinha; data: "vencimento" | "pagamento"; selecao: boolean }) {
  const valor = o.valor_pago ?? o.valor_inicial_cobranca
  return (
    <div className="hover:bg-muted/50 flex items-center">
      {selecao && (
        <span className="flex w-10 shrink-0 justify-center pl-2">
          {pagavel(o) && <MarcarOrdem id={o.id} valor={valorDe(o)} rotulo={o.codigo ?? "ordem"} />}
        </span>
      )}
    <Link
      href={`/painel/financeiro/ordens/${o.id}`}
      className={cn(
        "grid min-w-0 flex-1 grid-cols-[1fr_auto] items-center gap-x-3 gap-y-0.5 py-2.5 pr-4 sm:grid-cols-[minmax(0,1fr)_minmax(0,14rem)_auto_auto]",
        selecao ? "pl-1" : "pl-4"
      )}
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
    </div>
  )
}

function Dia({
  dia,
  hoje,
  data,
  destaque,
  selecao,
}: {
  dia: DiaExtrato
  hoje: string
  data: "vencimento" | "pagamento"
  destaque?: string
  selecao: boolean
}) {
  const rotulo = rotuloDia(dia.data, hoje)
  return (
    <div>
      <div className={cn("bg-muted/40 flex items-center justify-between gap-2 border-y py-1.5 pr-4 text-xs", selecao ? "pl-0" : "pl-4", destaque)}>
        <span className="flex items-center font-medium">
          {selecao && (
            <span className="flex w-10 shrink-0 justify-center pl-2">
              <MarcarDia itens={dia.linhas.filter(pagavel).map((o) => ({ id: o.id, valor: valorDe(o) }))} rotulo={rotulo} />
            </span>
          )}
          <span className={cn("first-letter:uppercase", selecao && "pl-1")}>{rotulo}</span>
        </span>
        <span className="text-muted-foreground tabular-nums">
          {dia.linhas.length} · {formatarMoeda(dia.total)}
        </span>
      </div>
      <div className="divide-y">
        {dia.linhas.map((o) => (
          <Linha key={o.id} o={o} data={data} selecao={selecao} />
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
  ancora,
  selecao,
}: {
  selecao: boolean
  ancora: string
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
    <details id={ancora} open={aberto} className={cn("group bg-card scroll-mt-20 overflow-hidden rounded-xl border", tom === "alerta" && "border-warning/50")}>
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
        dias.map((d) => (
          <Dia key={d.data} dia={d} hoje={hoje} data={data} selecao={selecao} destaque={tom === "alerta" ? "bg-warning/10" : undefined} />
        ))
      )}
      {rodape && <div className="border-t px-4 py-2.5 text-sm">{rodape}</div>}
    </details>
  )
}

/** Resumo do topo: o que falta pagar, por prazo; cada cartão leva à seção. */
function Resumo({ resumo }: { resumo: ExtratoOrdens["resumo"] }) {
  const cartoes = [
    { chave: "vencidas", rotulo: "Vencidas", ancora: "#vencidas", alerta: resumo.vencidas.quantidade > 0 },
    { chave: "hoje", rotulo: "Vencem hoje", ancora: "#hoje", alerta: false },
    { chave: "dias7", rotulo: "Próximos 7 dias", ancora: "#futuros", alerta: false },
    { chave: "dias30", rotulo: "Próximos 30 dias", ancora: "#futuros", alerta: false },
  ] as const
  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      {cartoes.map((c) => {
        const r = resumo[c.chave]
        return (
          <a
            key={c.chave}
            href={c.ancora}
            className={cn(
              "bg-card hover:border-primary/40 rounded-xl border p-3 transition-colors",
              c.alerta && "border-warning/50 bg-warning/5"
            )}
          >
            <span className={cn("text-xs", c.alerta ? "text-warning-fg font-medium" : "text-muted-foreground")}>{c.rotulo}</span>
            <span className="mt-1 block text-lg font-semibold tabular-nums">{formatarMoeda(r.total)}</span>
            <span className="text-muted-foreground text-xs">
              {r.quantidade} orde{r.quantidade === 1 ? "m" : "ns"}
            </span>
          </a>
        )
      })}
    </div>
  )
}

/**
 * Extrato das ordens, como o do banco: o resumo por prazo, lançamentos
 * futuros, o dia de hoje, as vencidas e, abaixo, o que já foi pago, dia a dia.
 */
export function ExtratoOrdensView({
  extrato,
  urlMaisFuturos,
  urlMaisPassado,
  debitos,
}: {
  /** Contas de débito para pagar do extrato; null = sem permissão de pagar. */
  debitos: { id: string; nome: string }[] | null
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
  const selecao = debitos !== null
  const conteudo = (
    <div className="grid gap-4">
      <Resumo resumo={extrato.resumo} />

      <Bloco
        selecao={selecao}
        ancora="futuros"
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
        selecao={selecao}
        ancora="hoje"
        titulo={`Hoje, ${formatarData(hoje)}`}
        icone={CalendarDays}
        dias={extrato.hojeDia.linhas.length ? [extrato.hojeDia] : []}
        hoje={hoje}
        data="vencimento"
        vazio="Nada vence nem foi pago hoje."
      />

      {extrato.atrasadas.length > 0 && (
        <Bloco
          selecao={selecao}
          ancora="vencidas"
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
        selecao={selecao}
        ancora="pagas"
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
      {selecao && <BarraSelecao debitos={debitos} hoje={hoje} />}
    </div>
  )
  return selecao ? <SelecaoExtrato>{conteudo}</SelecaoExtrato> : conteudo
}
