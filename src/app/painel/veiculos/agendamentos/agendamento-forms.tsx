"use client"

import { useActionState, useState } from "react"
import { ArrowLeftRight, Check, Loader2, Pencil, Send, Undo2, X } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"

import {
  atenderAgendamentoAction,
  cancelarAgendamentoAction,
  cancelarAgendamentoRecepcaoAction,
  editarAgendamentoAction,
  negarAgendamentoAction,
  solicitarVeiculoAction,
} from "./actions"

export const SELECT =
  "border-input bg-background text-foreground h-9 w-full rounded-md border px-3 text-sm shadow-xs outline-none [color-scheme:light] dark:[color-scheme:dark]"

export type OpcaoVeiculo = { id: string; rotulo: string }
export type OpcaoCondutor = { id: string; nome: string }

/** Valores de uma solicitação, para pré-preencher a edição. */
export type ValoresAgendamento = {
  motivo: string | null
  destino: string | null
  data_retirada: string | null
  data_retorno: string | null
  sede_retirada: string | null
}

/** Campos comuns a solicitar e editar. */
function CamposAgendamento({
  sedes,
  valores,
}: {
  sedes: string[]
  valores?: ValoresAgendamento
}) {
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <div className="grid gap-1.5">
        <Label htmlFor="motivo">Motivo *</Label>
        <Input
          id="motivo"
          name="motivo"
          required
          defaultValue={valores?.motivo ?? ""}
          placeholder="Reunião setorial, ato, panfletagem…"
        />
      </div>
      <div className="grid gap-1.5">
        <Label htmlFor="destino">Destino *</Label>
        <Input
          id="destino"
          name="destino"
          required
          defaultValue={valores?.destino ?? ""}
          placeholder="Cidade ou local"
        />
      </div>
      <div className="grid gap-1.5">
        <Label htmlFor="data_retirada">Data de retirada *</Label>
        <Input
          id="data_retirada"
          name="data_retirada"
          type="date"
          required
          defaultValue={valores?.data_retirada ?? ""}
          className="[color-scheme:light] dark:[color-scheme:dark]"
        />
      </div>
      <div className="grid gap-1.5">
        <Label htmlFor="data_retorno">Retorno previsto</Label>
        <Input
          id="data_retorno"
          name="data_retorno"
          type="date"
          defaultValue={valores?.data_retorno ?? ""}
          className="[color-scheme:light] dark:[color-scheme:dark]"
        />
      </div>
      <div className="grid gap-1.5">
        <Label htmlFor="sede">Sede de retirada *</Label>
        <select
          id="sede"
          name="sede"
          required
          className={SELECT}
          defaultValue={valores?.sede_retirada ?? ""}
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
    </div>
  )
}

/** Condutor: nova solicitação (painel inicial). */
export function SolicitarVeiculoForm({
  sedes,
  voltar = "/painel",
}: {
  sedes: string[]
  voltar?: string
}) {
  const [estado, formAction, pendente] = useActionState(
    solicitarVeiculoAction,
    {}
  )
  return (
    <form action={formAction} className="grid max-w-2xl gap-4">
      <input type="hidden" name="voltar" value={voltar} />
      <CamposAgendamento sedes={sedes} />
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

/** Condutor: edita a própria solicitação em aberto (abre sob demanda). */
export function EditarAgendamentoForm({
  agendamentoId,
  valores,
  sedes,
  voltar = "/painel",
}: {
  agendamentoId: string
  valores: ValoresAgendamento
  sedes: string[]
  voltar?: string
}) {
  const [aberto, setAberto] = useState(false)
  const [estado, formAction, pendente] = useActionState(
    editarAgendamentoAction,
    {}
  )
  if (!aberto) {
    return (
      <Button
        type="button"
        variant="ghost"
        size="sm"
        onClick={() => setAberto(true)}
      >
        <Pencil />
        Editar
      </Button>
    )
  }
  return (
    <form action={formAction} className="grid gap-3 rounded-md border p-3">
      <input type="hidden" name="agendamento_id" value={agendamentoId} />
      <input type="hidden" name="voltar" value={voltar} />
      <CamposAgendamento sedes={sedes} valores={valores} />
      {estado.erro && <p className="text-destructive text-sm">{estado.erro}</p>}
      <div className="flex flex-wrap gap-2">
        <Button type="submit" size="sm" disabled={pendente}>
          {pendente ? <Loader2 className="animate-spin" /> : <Check />}
          Salvar alterações
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => setAberto(false)}
        >
          Fechar
        </Button>
      </div>
    </form>
  )
}

/**
 * Cancelar uma solicitação. Cancelar não apaga: ela fica como cancelada.
 * `recepcao` usa a ação que alcança qualquer solicitação (e avisa o condutor).
 */
export function CancelarAgendamentoForm({
  agendamentoId,
  recepcao = false,
  voltar = "/painel",
}: {
  agendamentoId: string
  recepcao?: boolean
  voltar?: string
}) {
  const [estado, formAction, pendente] = useActionState(
    recepcao ? cancelarAgendamentoRecepcaoAction : cancelarAgendamentoAction,
    {}
  )
  return (
    <form
      action={formAction}
      onSubmit={(e) => {
        if (!confirm("Cancelar esta solicitação? Ela fica registrada como cancelada."))
          e.preventDefault()
      }}
      className="inline-flex flex-col items-end gap-1"
    >
      <input type="hidden" name="agendamento_id" value={agendamentoId} />
      <input type="hidden" name="voltar" value={voltar} />
      <Button type="submit" variant="ghost" size="sm" disabled={pendente}>
        {pendente ? <Loader2 className="animate-spin" /> : <X />}
        Cancelar
      </Button>
      {estado.erro && <span className="text-destructive text-xs">{estado.erro}</span>}
    </form>
  )
}

/** Recepção: atender (escolher veículo) ou negar (com motivo) a solicitação. */
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
        <input type="hidden" name="voltar" value="/painel/veiculos/agendamentos" />
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
        <input type="hidden" name="voltar" value="/painel/veiculos/agendamentos" />
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

/** Recepção: transfere a reserva para outro veículo disponível. */
export function TransferirVeiculoForm({
  agendamentoId,
  veiculos,
}: {
  agendamentoId: string
  veiculos: OpcaoVeiculo[]
}) {
  const [estado, formAction, pendente] = useActionState(
    atenderAgendamentoAction,
    {}
  )
  return (
    <form action={formAction} className="flex flex-wrap items-center gap-2">
      <input type="hidden" name="agendamento_id" value={agendamentoId} />
      <input type="hidden" name="voltar" value="/painel/veiculos/agendamentos" />
      <select
        name="veiculo_id"
        required
        defaultValue=""
        className={`${SELECT} h-8 w-64 max-w-full text-sm`}
      >
        <option value="" disabled>
          Transferir para outro veículo
        </option>
        {veiculos.map((v) => (
          <option key={v.id} value={v.id}>
            {v.rotulo}
          </option>
        ))}
      </select>
      <Button type="submit" variant="outline" size="sm" disabled={pendente}>
        {pendente ? <Loader2 className="animate-spin" /> : <ArrowLeftRight />}
        Transferir
      </Button>
      {estado.erro && <p className="text-destructive text-xs">{estado.erro}</p>}
    </form>
  )
}
