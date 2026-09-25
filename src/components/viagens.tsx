import { BedDouble, Plane } from "lucide-react"

import { Badge } from "@/components/ui/badge"
import type { ItemViagem } from "@/lib/db/viagens"
import { formatarData } from "@/lib/formato"
import {
  descreverHorario,
  ROTULO_MODAL,
  ROTULO_SITUACAO_VIAGEM,
  type SituacaoViagem,
} from "@/lib/viagens-constantes"

const COR_SITUACAO: Record<SituacaoViagem, string> = {
  solicitada: "border-warning/40 text-warning-fg",
  em_atendimento: "border-info/40 text-info-fg",
  atendida: "border-success/40 text-success-fg",
  cancelada: "text-muted-foreground",
  recusada: "border-destructive/40 text-destructive",
}

/** Badge de situação da viagem (quem pede e gestão). */
export function SituacaoViagemBadge({ situacao }: { situacao: SituacaoViagem }) {
  return (
    <Badge variant="outline" className={COR_SITUACAO[situacao]}>
      {ROTULO_SITUACAO_VIAGEM[situacao]}
    </Badge>
  )
}

/** Uma linha por item: "Aérea Rio → Brasília, 10/10" · "Hotel em Brasília, 10/10–12/10". */
export function ResumoItensViagem({ itens }: { itens: ItemViagem[] }) {
  if (itens.length === 0) return <span className="text-muted-foreground">—</span>
  return (
    <ul className="grid gap-0.5">
      {itens.map((i) => (
        <li key={i.id} className="flex items-start gap-1.5">
          {i.tipo === "passagem" ? (
            <>
              <Plane className="text-muted-foreground mt-0.5 size-3.5 shrink-0" />
              <span>
                {i.origem} → {i.destino}
                {i.dataViagem && (
                  <span className="text-muted-foreground"> · {formatarData(i.dataViagem)}</span>
                )}
              </span>
            </>
          ) : (
            <>
              <BedDouble className="text-muted-foreground mt-0.5 size-3.5 shrink-0" />
              <span>
                {i.cidade}
                {i.checkin && (
                  <span className="text-muted-foreground">
                    {" "}
                    · {formatarData(i.checkin)}
                    {i.checkout && <>–{formatarData(i.checkout)}</>}
                  </span>
                )}
              </span>
            </>
          )}
        </li>
      ))}
    </ul>
  )
}

/** Detalhe completo de cada item, com o que foi reservado quando já houver. */
export function ItensViagemDetalhe({ itens }: { itens: ItemViagem[] }) {
  return (
    <div className="grid gap-3">
      {itens.map((i, indice) => (
        <div key={i.id} className="rounded-lg border p-4 text-sm">
          <p className="flex items-center gap-2 font-semibold">
            {i.tipo === "passagem" ? (
              <Plane className="text-muted-foreground size-4" />
            ) : (
              <BedDouble className="text-muted-foreground size-4" />
            )}
            Item {indice + 1} —{" "}
            {i.tipo === "passagem"
              ? `passagem ${i.modal ? ROTULO_MODAL[i.modal].toLowerCase() : ""}`
              : "hospedagem"}
          </p>
          <dl className="mt-3 grid gap-x-6 gap-y-2 sm:grid-cols-2">
            {i.tipo === "passagem" ? (
              <>
                <Campo rotulo="Trecho" valor={`${i.origem ?? "—"} → ${i.destino ?? "—"}`} />
                <Campo rotulo="Data" valor={i.dataViagem ? formatarData(i.dataViagem) : null} />
                <Campo rotulo="Saída" valor={descreverHorario(i.saidaCriterio, i.saidaHora)} />
                <Campo
                  rotulo="Chegada"
                  valor={descreverHorario(i.chegadaCriterio, i.chegadaHora)}
                />
                <Campo
                  rotulo="Bagagem extra"
                  valor={i.bagagemExtra ? (i.bagagemDescricao ?? "Sim") : "Não"}
                />
              </>
            ) : (
              <>
                <Campo rotulo="Cidade" valor={i.cidade} />
                <Campo
                  rotulo="Período"
                  valor={
                    i.checkin && i.checkout
                      ? `${formatarData(i.checkin)} a ${formatarData(i.checkout)}`
                      : null
                  }
                />
              </>
            )}
            <Campo rotulo="Necessidades especiais" valor={i.necessidadesEspeciais} />
            <Campo rotulo="Observações" valor={i.observacoes} />
            {(i.localizador || i.reservaDescricao) && (
              <>
                <Campo rotulo="Localizador" valor={i.localizador} />
                <Campo rotulo="Reserva" valor={i.reservaDescricao} />
              </>
            )}
          </dl>
        </div>
      ))}
    </div>
  )
}

function Campo({ rotulo, valor }: { rotulo: string; valor: string | null }) {
  return (
    <div>
      <dt className="text-muted-foreground text-xs">{rotulo}</dt>
      <dd className="whitespace-pre-line">{valor ?? "—"}</dd>
    </div>
  )
}
