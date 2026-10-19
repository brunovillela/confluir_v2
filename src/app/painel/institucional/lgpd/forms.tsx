"use client"

import { useActionState } from "react"
import { FlaskConical, Loader2, Lock, LockOpen, Save } from "lucide-react"

import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { confirmarEnvio } from "@/components/ui/confirmacao"
import { ErroNoCampo } from "@/components/ui/erro-no-campo"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { type EstadoForm } from "@/lib/contas"

import { criarBloqueioAction, encerrarBloqueioAction, salvarRegraAction, simularAction } from "./actions"

function Aviso({ estado }: { estado: EstadoForm }) {
  if (estado.erro && !estado.campo) {
    return (
      <Alert variant="destructive">
        <AlertDescription>{estado.erro}</AlertDescription>
      </Alert>
    )
  }
  if (estado.ok) {
    return (
      <Alert className="border-success/40 text-success-fg">
        <AlertDescription>{estado.ok}</AlertDescription>
      </Alert>
    )
  }
  return null
}

export function SimularBotao({ codigo, rotulo }: { codigo?: string; rotulo: string }) {
  const [estado, action, pendente] = useActionState<EstadoForm, FormData>(simularAction, {})
  return (
    <form action={action} className="grid gap-2">
      {codigo && <input type="hidden" name="codigo" value={codigo} />}
      <div>
        <Button type="submit" size="sm" variant="outline" disabled={pendente}>
          {pendente ? <Loader2 className="animate-spin" /> : <FlaskConical />}
          {rotulo}
        </Button>
      </div>
      <Aviso estado={estado} />
    </form>
  )
}

export function RegraForm({
  regraId,
  codigo,
  prazoDias,
  prazoPadraoDias,
  prazoMinimoDias,
  prazoNoModulo,
  ativa,
  podeLigar,
}: {
  regraId: string
  codigo: string
  prazoDias: number | null
  prazoPadraoDias: number
  prazoMinimoDias: number
  prazoNoModulo: boolean
  ativa: boolean
  podeLigar: boolean
}) {
  const [estado, action, pendente] = useActionState<EstadoForm, FormData>(salvarRegraAction, {})
  const idPrazo = `prazo_${codigo}`
  const idAtiva = `ativa_${codigo}`
  return (
    <form
      action={action}
      className="grid gap-3"
      onSubmit={(e) => {
        const ligando = !ativa && new FormData(e.currentTarget).get("ativa") !== null
        if (ligando) confirmarEnvio(e, `Ligar a execução real da ${codigo}? No próximo cron mensal os registros vencidos serão apagados de verdade, sem volta.`)
      }}
    >
      <input type="hidden" name="regra_id" value={regraId} />
      <ErroNoCampo estado={estado} />
      <div className="flex flex-wrap items-end gap-4">
        {!prazoNoModulo && (
          <div className="grid gap-1.5">
            <Label htmlFor={idPrazo}>Prazo (dias)</Label>
            <Input
              id={idPrazo}
              name="prazo_dias"
              type="number"
              min={prazoMinimoDias}
              step={1}
              defaultValue={prazoDias ?? ""}
              placeholder={`${prazoPadraoDias} (padrão)`}
              className="w-40"
            />
          </div>
        )}
        <div className="flex items-center gap-2 pb-2">
          <Checkbox id={idAtiva} name="ativa" defaultChecked={ativa} disabled={!ativa && !podeLigar} />
          <Label htmlFor={idAtiva} className="font-normal">
            Execução real ligada
          </Label>
        </div>
        <Button type="submit" size="sm" disabled={pendente}>
          {pendente ? <Loader2 className="animate-spin" /> : <Save />}
          Salvar
        </Button>
      </div>
      <Aviso estado={estado} />
    </form>
  )
}

export function NovoBloqueioForm() {
  const [estado, action, pendente] = useActionState<EstadoForm, FormData>(criarBloqueioAction, {})
  return (
    <form action={action} className="grid gap-3" key={estado.ok ?? "form"}>
      <ErroNoCampo estado={estado} />
      <div className="flex flex-wrap gap-3">
        <div className="grid gap-1.5">
          <Label htmlFor="cpf">CPF</Label>
          <Input id="cpf" name="cpf" inputMode="numeric" placeholder="Só dígitos" className="w-44" maxLength={14} />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="email">ou e-mail</Label>
          <Input id="email" name="email" type="email" className="w-64" />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="processo">Processo (opcional)</Label>
          <Input id="processo" name="processo" className="w-56" maxLength={60} />
        </div>
      </div>
      <div className="grid gap-1.5">
        <Label htmlFor="motivo">Motivo</Label>
        <Input id="motivo" name="motivo" placeholder="Ex.: reclamação trabalhista em curso" maxLength={300} required />
      </div>
      <div>
        <Button type="submit" size="sm" disabled={pendente}>
          {pendente ? <Loader2 className="animate-spin" /> : <Lock />}
          Bloquear descarte
        </Button>
      </div>
      <Aviso estado={estado} />
    </form>
  )
}

export function EncerrarBloqueioBotao({ bloqueioId }: { bloqueioId: string }) {
  const [estado, action, pendente] = useActionState<EstadoForm, FormData>(encerrarBloqueioAction, {})
  return (
    <form
      action={action}
      className="flex items-center gap-2"
      onSubmit={(e) => confirmarEnvio(e, "Encerrar o bloqueio? Os dados desta pessoa voltam a seguir os prazos de retenção.")}
    >
      <input type="hidden" name="bloqueio_id" value={bloqueioId} />
      <Button type="submit" size="sm" variant="ghost" disabled={pendente}>
        {pendente ? <Loader2 className="animate-spin" /> : <LockOpen />}
        Encerrar
      </Button>
      {estado.erro && <span className="text-destructive text-xs">{estado.erro}</span>}
    </form>
  )
}
