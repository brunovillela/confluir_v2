"use client"

import { useActionState } from "react"
import { Check, Link2, Loader2, LockOpen, SquareCheckBig, Undo2, X } from "lucide-react"

import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"

import { definirFinalizado, desvincularCupom, marcarComparecimento, vincularCupom } from "../actions"

const SELECT =
  "border-input bg-background text-foreground h-9 w-full max-w-md truncate rounded-md border px-3 text-sm shadow-xs outline-none [color-scheme:light] dark:[color-scheme:dark]"

/** Assinatura das server actions de formulário (painel ou hotel). */
type AcaoForm = (
  prev: { erro?: string; ok?: string },
  formData: FormData
) => Promise<{ erro?: string; ok?: string }>

/** Finalizar/reabrir a reserva. */
export function FinalizarBotao({
  servicoId,
  finalizado,
  action = definirFinalizado,
}: {
  servicoId: string
  finalizado: boolean
  action?: AcaoForm
}) {
  const [estado, formAction, pendente] = useActionState(action, {})

  return (
    <form
      action={formAction}
      className="flex items-center gap-2"
      onSubmit={(e) => {
        if (
          !finalizado &&
          !confirm("Finalizar esta reserva? Cupons não poderão mais ser vinculados.")
        ) {
          e.preventDefault()
        }
      }}
    >
      <input type="hidden" name="servico_id" value={servicoId} />
      <input type="hidden" name="finalizado" value={String(!finalizado)} />
      {estado.erro && <span className="text-destructive text-xs">{estado.erro}</span>}
      <Button type="submit" variant="secondary" size="sm" disabled={pendente}>
        {pendente ? (
          <Loader2 className="animate-spin" />
        ) : finalizado ? (
          <LockOpen />
        ) : (
          <SquareCheckBig />
        )}
        {finalizado ? "Reabrir reserva" : "Finalizar reserva"}
      </Button>
    </form>
  )
}

/** Comparecimento e desvínculo de um hóspede (cupom) da reserva. */
export function HospedeAcoes({
  servicoId,
  cupomId,
  compareceu,
  podeDesvincular,
  comparecimentoAction = marcarComparecimento,
  desvincularAction = desvincularCupom,
}: {
  servicoId: string
  cupomId: string
  compareceu: boolean
  podeDesvincular: boolean
  comparecimentoAction?: AcaoForm
  desvincularAction?: AcaoForm
}) {
  const [estadoComp, compAction, compPendente] = useActionState(
    comparecimentoAction,
    {}
  )
  const [estadoDesv, desvAction, desvPendente] = useActionState(
    desvincularAction,
    {}
  )

  const erro = estadoComp.erro ?? estadoDesv.erro

  return (
    <div className="flex items-center justify-end gap-1">
      {erro && <span className="text-destructive mr-1 text-xs">{erro}</span>}
      <form action={compAction}>
        <input type="hidden" name="servico_id" value={servicoId} />
        <input type="hidden" name="cupom_id" value={cupomId} />
        <input type="hidden" name="compareceu" value={String(!compareceu)} />
        <Button
          type="submit"
          variant="ghost"
          size="sm"
          disabled={compPendente}
          className="h-7 px-2"
        >
          {compPendente ? (
            <Loader2 className="animate-spin" />
          ) : compareceu ? (
            <Undo2 />
          ) : (
            <Check />
          )}
          {compareceu ? "Desfazer comparecimento" : "Compareceu"}
        </Button>
      </form>
      {podeDesvincular && (
        <form
          action={desvAction}
          onSubmit={(e) => {
            if (!confirm("Desvincular este cupom? Ele volta a aguardar reserva.")) {
              e.preventDefault()
            }
          }}
        >
          <input type="hidden" name="servico_id" value={servicoId} />
          <input type="hidden" name="cupom_id" value={cupomId} />
          <Button
            type="submit"
            variant="ghost"
            size="sm"
            disabled={desvPendente}
            className="text-destructive hover:text-destructive h-7 px-2"
          >
            {desvPendente ? <Loader2 className="animate-spin" /> : <X />}
            Desvincular
          </Button>
        </form>
      )}
    </div>
  )
}

export type CupomDisponivel = {
  id: string
  filiadoNome: string | null
  check_in: string | null
}

/** Vincula à reserva um cupom aguardando do mesmo hotel. */
export function VincularCupomForm({
  servicoId,
  disponiveis,
  action = vincularCupom,
}: {
  servicoId: string
  disponiveis: CupomDisponivel[]
  action?: AcaoForm
}) {
  const [estado, formAction, pendente] = useActionState(action, {})

  if (disponiveis.length === 0) {
    return (
      <p className="text-muted-foreground text-sm">
        Nenhum cupom aguardando reserva neste hotel.
      </p>
    )
  }

  return (
    <form action={formAction} className="grid gap-2">
      {estado.erro && (
        <Alert variant="destructive">
          <AlertDescription>{estado.erro}</AlertDescription>
        </Alert>
      )}
      <div className="flex flex-wrap items-center gap-2">
        <input type="hidden" name="servico_id" value={servicoId} />
        <select
          name="cupom_id"
          required
          defaultValue=""
          aria-label="Cupom para vincular"
          className={SELECT}
        >
          <option value="" disabled>
            Selecione um cupom aguardando
          </option>
          {disponiveis.map((c) => {
            const data = /^(\d{4})-(\d{2})-(\d{2})/.exec(c.check_in ?? "")
            const dataBr = data ? `${data[3]}/${data[2]}/${data[1]}` : "sem data"
            return (
              <option key={c.id} value={c.id}>
                {c.filiadoNome ?? "(sem nome)"} — check-in {dataBr}
              </option>
            )
          })}
        </select>
        <Button type="submit" variant="secondary" size="sm" disabled={pendente}>
          {pendente ? <Loader2 className="animate-spin" /> : <Link2 />}
          Vincular
        </Button>
      </div>
    </form>
  )
}
