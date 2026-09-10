"use client"

import { useActionState, useState } from "react"
import { Check, KeyRound, Loader2 } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"

import {
  registrarEntradaAction,
  registrarSaidaAction,
} from "../agendamentos/actions"
import { SELECT, type OpcaoCondutor } from "../agendamentos/agendamento-forms"

/** Solicitação que pode ser baixada por esta saída. */
export type ReservaVinculavel = {
  id: string
  condutorId: string | null
  rotulo: string
  destino: string | null
  data_retorno: string | null
  /** Já tem ESTE veículo reservado (atendida) ou ainda só solicitada. */
  atendida: boolean
}

/**
 * SAÍDA — o veículo está na garagem. A recepção escolhe o condutor (ou a
 * reserva, que já traz condutor e destino), informa hodômetro e sede, e
 * opcionalmente destino e previsão de retorno.
 */
export function SaidaVeiculoForm({
  veiculoId,
  sedes,
  sedePadrao,
  condutores,
  reservas,
}: {
  veiculoId: string
  sedes: string[]
  sedePadrao?: string | null
  condutores: OpcaoCondutor[]
  reservas: ReservaVinculavel[]
}) {
  const [estado, formAction, pendente] = useActionState(registrarSaidaAction, {})
  const [reservaId, setReservaId] = useState("")
  const [condutorId, setCondutorId] = useState("")
  const [destino, setDestino] = useState("")
  const [previsao, setPrevisao] = useState("")

  const reserva = reservas.find((r) => r.id === reservaId) ?? null
  const condutorDaReserva = reserva?.condutorId ?? null
  const condutorConhecido =
    condutorDaReserva && condutores.some((c) => c.id === condutorDaReserva)

  function escolherReserva(id: string) {
    setReservaId(id)
    const r = reservas.find((x) => x.id === id)
    if (!r) return
    if (r.condutorId) setCondutorId(r.condutorId)
    if (r.destino && !destino) setDestino(r.destino)
    if (r.data_retorno && !previsao) setPrevisao(r.data_retorno)
  }

  return (
    <form action={formAction} className="grid gap-4">
      <input type="hidden" name="veiculo_id" value={veiculoId} />
      <input type="hidden" name="voltar" value={`/painel/veiculos/${veiculoId}`} />
      {reservaId && <input type="hidden" name="agendamento_id" value={reservaId} />}

      <div className="grid gap-4 sm:grid-cols-2">
        {reservas.length > 0 && (
          <div className="grid gap-1.5 sm:col-span-2">
            <Label htmlFor="reserva">Vincular a uma solicitação</Label>
            <select
              id="reserva"
              className={SELECT}
              value={reservaId}
              onChange={(e) => escolherReserva(e.target.value)}
            >
              <option value="">Saída avulsa (sem solicitação)</option>
              {reservas.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.rotulo}
                </option>
              ))}
            </select>
            <p className="text-muted-foreground text-xs">
              Vincular dá baixa na solicitação: ela passa a “veículo retirado”.
            </p>
          </div>
        )}
        <div className="grid gap-1.5">
          <Label htmlFor="condutor_usuario_id">Condutor *</Label>
          {condutorDaReserva && !condutorConhecido ? (
            <>
              <input type="hidden" name="condutor_usuario_id" value={condutorDaReserva} />
              <p className="text-muted-foreground text-sm">
                Condutor da solicitação (não está na lista de aptos — a saída
                será recusada se ele não estiver autorizado).
              </p>
            </>
          ) : (
            <select
              id="condutor_usuario_id"
              name="condutor_usuario_id"
              required
              className={SELECT}
              value={condutorId}
              onChange={(e) => setCondutorId(e.target.value)}
            >
              <option value="" disabled>
                Escolha o condutor
              </option>
              {condutores.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.nome}
                </option>
              ))}
            </select>
          )}
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="hodometro">Hodômetro na saída *</Label>
          <Input
            id="hodometro"
            name="hodometro"
            required
            inputMode="numeric"
            placeholder="Ex.: 48.350"
            className="tabular-nums"
          />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="sede">Sede de saída *</Label>
          <select
            id="sede"
            name="sede"
            required
            className={SELECT}
            defaultValue={sedePadrao ?? (sedes.length === 1 ? sedes[0] : "")}
          >
            <option value="" disabled>
              Escolha a sede
            </option>
            {sedes.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="destino">Destino</Label>
          <Input
            id="destino"
            name="destino"
            value={destino}
            onChange={(e) => setDestino(e.target.value)}
            placeholder="Facultativo"
          />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="previsao_retorno">Previsão de retorno</Label>
          <Input
            id="previsao_retorno"
            name="previsao_retorno"
            type="date"
            value={previsao}
            onChange={(e) => setPrevisao(e.target.value)}
            className="[color-scheme:light] dark:[color-scheme:dark]"
          />
        </div>
      </div>
      {estado.erro && <p className="text-destructive text-sm">{estado.erro}</p>}
      <div>
        <Button type="submit" disabled={pendente}>
          {pendente ? <Loader2 className="animate-spin" /> : <KeyRound />}
          Registrar saída
        </Button>
      </div>
    </form>
  )
}

/** ENTRADA — o veículo está fora. A recepção registra a devolução. */
export function EntradaVeiculoForm({
  veiculoId,
  movimentacaoId,
  sedes,
  sedePadrao,
}: {
  veiculoId: string
  movimentacaoId: string
  sedes: string[]
  sedePadrao?: string | null
}) {
  const [estado, formAction, pendente] = useActionState(
    registrarEntradaAction,
    {}
  )
  return (
    <form action={formAction} className="grid gap-4">
      <input type="hidden" name="veiculo_id" value={veiculoId} />
      <input type="hidden" name="movimentacao_id" value={movimentacaoId} />
      <input type="hidden" name="voltar" value={`/painel/veiculos/${veiculoId}`} />
      <div className="grid gap-4 sm:grid-cols-3">
        <div className="grid gap-1.5">
          <Label htmlFor="hodometro">Hodômetro na entrada *</Label>
          <Input
            id="hodometro"
            name="hodometro"
            required
            inputMode="numeric"
            placeholder="Ex.: 48.512"
            className="tabular-nums"
          />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="sede">Sede de entrada *</Label>
          <select
            id="sede"
            name="sede"
            required
            className={SELECT}
            defaultValue={sedePadrao ?? (sedes.length === 1 ? sedes[0] : "")}
          >
            <option value="" disabled>
              Escolha a sede
            </option>
            {sedes.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="observacao">Observação</Label>
          <Input
            id="observacao"
            name="observacao"
            placeholder="Avarias, pendências, combustível…"
          />
        </div>
      </div>
      {estado.erro && <p className="text-destructive text-sm">{estado.erro}</p>}
      <div>
        <Button type="submit" disabled={pendente}>
          {pendente ? <Loader2 className="animate-spin" /> : <Check />}
          Registrar entrada
        </Button>
      </div>
    </form>
  )
}
