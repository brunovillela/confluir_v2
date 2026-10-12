import { CalendarClock } from "lucide-react"

import { ContagemRegressiva } from "@/components/portal/contagem-regressiva"
import { Badge } from "@/components/ui/badge"
import { formatarData } from "@/lib/formato"
import { estadoPrazo } from "@/lib/oposicao-constantes"
import { diasDoPeriodo } from "@/lib/periodo-dias"

/** Dias que faltam a partir dos quais o prazo ganha destaque de atenção. */
const DIAS_URGENTE = 3

/**
 * Fim do prazo como instante: 23:59:59 de Brasília (A185). A data do banco é
 * dia de calendário; sem o fuso, o navegador a leria no relógio do aparelho
 * e a contagem acabaria horas antes (ou depois) do que o servidor aceita.
 */
export function fimDoPrazoISO(prazoFim: string): string {
  return `${prazoFim.slice(0, 10)}T23:59:59-03:00`
}

/**
 * O prazo da campanha dito ao trabalhador (A106): "Encerra em N dias (dd/mm)",
 * "Abre em dd/mm", "Encerrou em dd/mm" — calculado no servidor, com o dia de
 * São Paulo (`hoje`). Nos últimos dias, o selo fica em atenção; no último, a
 * contagem regressiva até as 23:59 de Brasília.
 */
export function PrazoOposicao({
  inicio,
  fim,
  hoje,
}: {
  inicio: string | null
  fim: string | null
  hoje: string
}) {
  const estado = estadoPrazo(inicio, fim, hoje)
  if (estado === "sem_prazo" || !inicio || !fim) return null

  if (estado === "antes") {
    return (
      <Badge variant="outline">
        <CalendarClock />
        Abre em {formatarData(inicio)}
      </Badge>
    )
  }
  if (estado === "depois") {
    return (
      <Badge variant="secondary">
        <CalendarClock />
        Encerrou em {formatarData(fim)}
      </Badge>
    )
  }

  // Dias depois de hoje até o último dia do prazo (0 = hoje é o último).
  const faltam = diasDoPeriodo(hoje.slice(0, 10), fim.slice(0, 10)) - 1
  if (faltam <= 0) {
    return (
      <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
        <Badge variant="warning">
          <CalendarClock />
          Último dia para se opor
        </Badge>
        <span className="text-xs">
          <ContagemRegressiva ate={fimDoPrazoISO(fim)} /> (até 23h59, horário de Brasília)
        </span>
      </span>
    )
  }
  return (
    <Badge variant={faltam <= DIAS_URGENTE ? "warning" : "outline"}>
      <CalendarClock />
      {faltam === 1
        ? `Encerra amanhã (${formatarData(fim)})`
        : `Encerra em ${faltam} dias (${formatarData(fim)})`}
    </Badge>
  )
}
