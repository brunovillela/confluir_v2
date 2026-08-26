"use client"

import { useActionState } from "react"
import { HandHelping, Loader2, Undo2 } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { Input } from "@/components/ui/input"
import { type EstadoForm } from "@/lib/contas"

import { encerrarCautelaAction, registrarCautelaAction } from "../actions"

const SELECT =
  "border-input bg-background text-foreground h-9 w-full rounded-md border px-3 text-sm shadow-xs outline-none [color-scheme:light] dark:[color-scheme:dark]"
const DATA =
  "[color-scheme:light] dark:[color-scheme:dark]"

type Opcao = { id: string; nome: string }

/** Formulário para dar um item em cautela a um responsável. */
export function RegistrarCautelaForm({
  itemId,
  usuarios,
  hoje,
  podeEditar = true,
}: {
  itemId: string
  usuarios: Opcao[]
  hoje: string
  podeEditar?: boolean
}) {
  const [estado, formAction, pendente] = useActionState<EstadoForm, FormData>(
    registrarCautelaAction,
    {}
  )
  if (!podeEditar) return null
  return (
    <form action={formAction} className="grid max-w-xl gap-4">
      <input type="hidden" name="item_id" value={itemId} />
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="grid gap-1.5 sm:col-span-2">
          <Label htmlFor="responsavel_id">Responsável *</Label>
          <select
            id="responsavel_id"
            name="responsavel_id"
            required
            defaultValue=""
            className={SELECT}
          >
            <option value="" disabled>
              Escolha o funcionário/diretor
            </option>
            {usuarios.map((u) => (
              <option key={u.id} value={u.id}>
                {u.nome}
              </option>
            ))}
          </select>
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="inicio">Início</Label>
          <Input
            id="inicio"
            name="inicio"
            type="date"
            defaultValue={hoje}
            className={DATA}
          />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="arquivo_cautela_file">Termo de cautela (PDF)</Label>
          <Input
            id="arquivo_cautela_file"
            name="arquivo_cautela_file"
            type="file"
            accept="application/pdf,image/*"
          />
        </div>
      </div>
      {estado.erro && <p className="text-destructive text-sm">{estado.erro}</p>}
      <div>
        <Button type="submit" disabled={pendente}>
          {pendente ? <Loader2 className="animate-spin" /> : <HandHelping />}
          Registrar cautela
        </Button>
      </div>
    </form>
  )
}

/** Encerra a cautela em aberto de um item (devolução). */
export function EncerrarCautelaForm({
  itemId,
  cautelaId,
  hoje,
  podeEditar = true,
}: {
  itemId: string
  cautelaId: string
  hoje: string
  podeEditar?: boolean
}) {
  const [estado, formAction, pendente] = useActionState<EstadoForm, FormData>(
    encerrarCautelaAction,
    {}
  )
  if (!podeEditar) return null
  return (
    <form
      action={formAction}
      className="flex flex-wrap items-end gap-3"
      onSubmit={(e) => {
        if (!confirm("Encerrar a cautela deste item (devolução)?")) {
          e.preventDefault()
        }
      }}
    >
      <input type="hidden" name="item_id" value={itemId} />
      <input type="hidden" name="cautela_id" value={cautelaId} />
      <div className="grid gap-1.5">
        <Label htmlFor="termino">Devolução</Label>
        <Input
          id="termino"
          name="termino"
          type="date"
          defaultValue={hoje}
          className={DATA}
        />
      </div>
      <Button type="submit" variant="outline" disabled={pendente}>
        {pendente ? <Loader2 className="animate-spin" /> : <Undo2 />}
        Encerrar cautela
      </Button>
      {estado.erro && (
        <p className="text-destructive w-full text-sm">{estado.erro}</p>
      )}
    </form>
  )
}
