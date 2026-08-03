"use client"

import { useActionState, useState } from "react"
import { Check, KeyRound, Loader2, Send, Undo2, X } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"

import {
  atenderAgendamentoAction,
  cancelarAgendamentoAction,
  negarAgendamentoAction,
  registrarDevolucaoAction,
  registrarRetiradaAction,
  solicitarVeiculoAction,
} from "./actions"

const SELECT =
  "border-input bg-background text-foreground h-9 w-full rounded-md border px-3 text-sm shadow-xs outline-none [color-scheme:light] dark:[color-scheme:dark]"

export type OpcaoVeiculo = { id: string; rotulo: string }
export type OpcaoCondutor = { id: string; nome: string }

export function SolicitarVeiculoForm({ sedes }: { sedes: string[] }) {
  const [estado, formAction, pendente] = useActionState(
    solicitarVeiculoAction,
    {}
  )
  return (
    <form action={formAction} className="grid max-w-2xl gap-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="grid gap-1.5">
          <Label htmlFor="motivo">Motivo *</Label>
          <Input
            id="motivo"
            name="motivo"
            required
            placeholder="Reunião setorial, ato, panfletagem…"
          />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="destino">Destino *</Label>
          <Input id="destino" name="destino" required placeholder="Cidade ou local" />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="data_retirada">Data de retirada *</Label>
          <Input
            id="data_retirada"
            name="data_retirada"
            type="date"
            required
            className="[color-scheme:light] dark:[color-scheme:dark]"
          />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="data_retorno">Retorno previsto</Label>
          <Input
            id="data_retorno"
            name="data_retorno"
            type="date"
            className="[color-scheme:light] dark:[color-scheme:dark]"
          />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="sede">Sede de retirada *</Label>
          <select id="sede" name="sede" required className={SELECT} defaultValue="">
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
      </div>
      {estado.erro && <p className="text-destructive text-sm">{estado.erro}</p>}
      <div>
        <Button type="submit" disabled={pendente}>
          {pendente ? <Loader2 className="animate-spin" /> : <Send />}
          Solicitar veículo
        </Button>
      </div>
    </form>
  )
}

export function CancelarAgendamentoForm({
  agendamentoId,
}: {
  agendamentoId: string
}) {
  const [estado, formAction, pendente] = useActionState(
    cancelarAgendamentoAction,
    {}
  )
  return (
    <form
      action={formAction}
      onSubmit={(e) => {
        if (!confirm("Cancelar esta solicitação?")) e.preventDefault()
      }}
      className="inline-flex flex-col items-end gap-1"
    >
      <input type="hidden" name="agendamento_id" value={agendamentoId} />
      <Button type="submit" variant="ghost" size="sm" disabled={pendente}>
        {pendente ? <Loader2 className="animate-spin" /> : <X />}
        Cancelar
      </Button>
      {estado.erro && <span className="text-destructive text-xs">{estado.erro}</span>}
    </form>
  )
}

/** Gestor: atender (escolher veículo) ou negar (com motivo) a solicitação. */
export function TriagemAgendamentoForm({
  agendamentoId,
  veiculos,
}: {
  agendamentoId: string
  veiculos: OpcaoVeiculo[]
}) {
  const [estadoAtender, acaoAtender, pendenteAtender] = useActionState(
    atenderAgendamentoAction,
    {}
  )
  const [estadoNegar, acaoNegar, pendenteNegar] = useActionState(
    negarAgendamentoAction,
    {}
  )
  const [motivoNegativa, setMotivoNegativa] = useState("")

  return (
    <div className="grid gap-2">
      <form action={acaoAtender} className="flex flex-wrap items-center gap-2">
        <input type="hidden" name="agendamento_id" value={agendamentoId} />
        <select
          name="veiculo_id"
          required
          defaultValue=""
          className={`${SELECT} h-8 w-64 max-w-full text-sm`}
        >
          <option value="" disabled>
            Escolher veículo disponível
          </option>
          {veiculos.map((v) => (
            <option key={v.id} value={v.id}>
              {v.rotulo}
            </option>
          ))}
        </select>
        <Button type="submit" size="sm" disabled={pendenteAtender}>
          {pendenteAtender ? <Loader2 className="animate-spin" /> : <Check />}
          Atender
        </Button>
      </form>
      <form
        action={acaoNegar}
        className="flex flex-wrap items-center gap-2"
        onSubmit={(e) => {
          if (!motivoNegativa.trim()) {
            alert("Informe o motivo da negativa.")
            e.preventDefault()
          }
        }}
      >
        <input type="hidden" name="agendamento_id" value={agendamentoId} />
        <Input
          name="motivo"
          value={motivoNegativa}
          onChange={(e) => setMotivoNegativa(e.target.value)}
          placeholder="Motivo da negativa"
          className="h-8 w-64 max-w-full text-sm"
        />
        <Button type="submit" variant="outline" size="sm" disabled={pendenteNegar}>
          {pendenteNegar ? <Loader2 className="animate-spin" /> : <Undo2 />}
          Negar
        </Button>
      </form>
      {(estadoAtender.erro || estadoNegar.erro) && (
        <p className="text-destructive text-xs">
          {estadoAtender.erro ?? estadoNegar.erro}
        </p>
      )}
    </div>
  )
}

/** Gestor: registrar a retirada (de agendamento atendido ou avulsa). */
export function RetiradaForm({
  agendamentoId,
  veiculoFixoId,
  condutorFixoId,
  sedePadrao,
  sedes,
  veiculos,
  condutores,
}: {
  agendamentoId?: string
  veiculoFixoId?: string | null
  condutorFixoId?: string | null
  sedePadrao?: string | null
  sedes: string[]
  veiculos: OpcaoVeiculo[]
  condutores: OpcaoCondutor[]
}) {
  const [estado, formAction, pendente] = useActionState(
    registrarRetiradaAction,
    {}
  )
  return (
    <form action={formAction} className="grid gap-2">
      {agendamentoId && (
        <input type="hidden" name="agendamento_id" value={agendamentoId} />
      )}
      <div className="flex flex-wrap items-center gap-2">
        {veiculoFixoId ? (
          <input type="hidden" name="veiculo_id" value={veiculoFixoId} />
        ) : (
          <select
            name="veiculo_id"
            required
            defaultValue=""
            className={`${SELECT} h-8 w-56 max-w-full text-sm`}
          >
            <option value="" disabled>
              Veículo
            </option>
            {veiculos.map((v) => (
              <option key={v.id} value={v.id}>
                {v.rotulo}
              </option>
            ))}
          </select>
        )}
        {condutorFixoId ? (
          <input type="hidden" name="condutor_usuario_id" value={condutorFixoId} />
        ) : (
          <select
            name="condutor_usuario_id"
            required
            defaultValue=""
            className={`${SELECT} h-8 w-56 max-w-full text-sm`}
          >
            <option value="" disabled>
              Condutor
            </option>
            {condutores.map((c) => (
              <option key={c.id} value={c.id}>
                {c.nome}
              </option>
            ))}
          </select>
        )}
        <Input
          name="hodometro"
          required
          inputMode="numeric"
          placeholder="Hodômetro"
          className="h-8 w-32 text-sm tabular-nums"
        />
        <select
          name="sede"
          required
          defaultValue={sedePadrao ?? ""}
          className={`${SELECT} h-8 w-44 max-w-full text-sm`}
        >
          <option value="" disabled>
            Sede
          </option>
          {sedes.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
        {!agendamentoId && (
          <Input
            name="destino"
            placeholder="Destino (opcional)"
            className="h-8 w-44 text-sm"
          />
        )}
        <Button type="submit" size="sm" disabled={pendente}>
          {pendente ? <Loader2 className="animate-spin" /> : <KeyRound />}
          Registrar retirada
        </Button>
      </div>
      {estado.erro && <p className="text-destructive text-xs">{estado.erro}</p>}
    </form>
  )
}

/** Gestor: registrar a devolução de uma movimentação em aberto. */
export function DevolucaoForm({
  movimentacaoId,
  sedePadrao,
  sedes,
}: {
  movimentacaoId: string
  sedePadrao?: string | null
  sedes: string[]
}) {
  const [estado, formAction, pendente] = useActionState(
    registrarDevolucaoAction,
    {}
  )
  return (
    <form action={formAction} className="grid gap-2">
      <input type="hidden" name="movimentacao_id" value={movimentacaoId} />
      <div className="flex flex-wrap items-center gap-2">
        <Input
          name="hodometro"
          required
          inputMode="numeric"
          placeholder="Hodômetro"
          className="h-8 w-32 text-sm tabular-nums"
        />
        <select
          name="sede"
          required
          defaultValue={sedePadrao ?? ""}
          className={`${SELECT} h-8 w-44 max-w-full text-sm`}
        >
          <option value="" disabled>
            Sede
          </option>
          {sedes.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
        <Input
          name="observacao"
          placeholder="Observação (avarias, pendências…)"
          className="h-8 w-64 max-w-full text-sm"
        />
        <Button type="submit" size="sm" variant="outline" disabled={pendente}>
          {pendente ? <Loader2 className="animate-spin" /> : <Check />}
          Registrar devolução
        </Button>
      </div>
      {estado.erro && <p className="text-destructive text-xs">{estado.erro}</p>}
    </form>
  )
}
