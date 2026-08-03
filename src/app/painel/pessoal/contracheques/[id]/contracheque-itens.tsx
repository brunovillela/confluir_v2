"use client"

import { useActionState } from "react"
import { Loader2, Plus, Trash2 } from "lucide-react"

import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"

import {
  alternarLiberadoContracheque,
  criarContracheque,
  excluirContracheque,
} from "../actions"

const SELECT =
  "border-input bg-background text-foreground h-9 w-full rounded-md border px-3 text-sm shadow-xs outline-none [color-scheme:light] dark:[color-scheme:dark]"

export function NovoContrachequeForm({
  remessaId,
  funcionarios,
}: {
  remessaId: string
  funcionarios: { usuarioId: string; nome: string }[]
}) {
  const [estado, formAction, pendente] = useActionState(criarContracheque, {})

  return (
    <form
      action={formAction}
      className="grid items-end gap-3 sm:grid-cols-[1fr_1fr_auto_auto]"
    >
      {estado.erro && (
        <div className="sm:col-span-4">
          <Alert variant="destructive">
            <AlertDescription>{estado.erro}</AlertDescription>
          </Alert>
        </div>
      )}
      {estado.ok && (
        <div className="sm:col-span-4">
          <Alert className="border-success/40 text-success-fg">
            <AlertDescription>{estado.ok}</AlertDescription>
          </Alert>
        </div>
      )}
      <input type="hidden" name="remessa_id" value={remessaId} />
      <div className="grid gap-1.5">
        <Label htmlFor="funcionario_id">Funcionário *</Label>
        <select
          id="funcionario_id"
          name="funcionario_id"
          required
          defaultValue=""
          className={SELECT}
        >
          <option value="" disabled>
            Escolha o funcionário
          </option>
          {funcionarios.map((f) => (
            <option key={f.usuarioId} value={f.usuarioId}>
              {f.nome}
            </option>
          ))}
        </select>
      </div>
      <div className="grid gap-1.5">
        <Label htmlFor="arquivo">Contracheque (PDF) *</Label>
        <Input id="arquivo" name="arquivo" type="file" accept="application/pdf" required />
      </div>
      <label className="text-muted-foreground flex items-center gap-2 pb-2 text-sm">
        <Checkbox name="liberado" defaultChecked />
        Liberado
      </label>
      <Button type="submit" variant="secondary" disabled={pendente}>
        {pendente ? <Loader2 className="animate-spin" /> : <Plus />}
        Adicionar
      </Button>
    </form>
  )
}

export function AcoesContracheque({
  id,
  remessaId,
  liberado,
}: {
  id: string
  remessaId: string
  liberado: boolean
}) {
  const [estadoLib, libAction, libPendente] = useActionState(
    alternarLiberadoContracheque,
    {}
  )
  const [estadoExc, excAction, excPendente] = useActionState(
    excluirContracheque,
    {}
  )
  const erro = estadoLib.erro ?? estadoExc.erro

  return (
    <div className="flex items-center justify-end gap-1">
      {erro && <span className="text-destructive mr-1 text-xs">{erro}</span>}
      <form action={libAction}>
        <input type="hidden" name="id" value={id} />
        <input type="hidden" name="remessa_id" value={remessaId} />
        <input type="hidden" name="liberado" value={String(!liberado)} />
        <Button
          type="submit"
          variant="ghost"
          size="sm"
          disabled={libPendente}
          className="h-7 px-2"
        >
          {libPendente && <Loader2 className="animate-spin" />}
          {liberado ? "Bloquear" : "Liberar"}
        </Button>
      </form>
      <form
        action={excAction}
        onSubmit={(e) => {
          if (!confirm("Excluir este contracheque?")) e.preventDefault()
        }}
      >
        <input type="hidden" name="id" value={id} />
        <input type="hidden" name="remessa_id" value={remessaId} />
        <Button
          type="submit"
          variant="ghost"
          size="sm"
          disabled={excPendente}
          className="text-destructive hover:text-destructive h-7 px-2"
        >
          {excPendente ? <Loader2 className="animate-spin" /> : <Trash2 />}
        </Button>
      </form>
    </div>
  )
}
