"use client"

import { useActionState } from "react"
import { Loader2, UserCog } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { type EstadoForm } from "@/lib/contas"

import { definirResponsavelRecintoAction } from "../../actions"

const SELECT =
  "border-input bg-background text-foreground h-9 w-full rounded-md border px-3 text-sm shadow-xs outline-none [color-scheme:light] dark:[color-scheme:dark]"

type Opcao = { id: string; nome: string }

/** Define o responsável atual do recinto (encerra o anterior automaticamente). */
export function DefinirResponsavelForm({
  recintoId,
  usuarios,
  hoje,
  podeEditar = true,
}: {
  recintoId: string
  usuarios: Opcao[]
  hoje: string
  podeEditar?: boolean
}) {
  const [estado, formAction, pendente] = useActionState<EstadoForm, FormData>(
    definirResponsavelRecintoAction,
    {}
  )
  if (!podeEditar) return null
  return (
    <form action={formAction} className="grid max-w-xl gap-4">
      <input type="hidden" name="recinto_id" value={recintoId} />
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="grid gap-1.5 sm:col-span-2">
          <Label htmlFor="funcionario_id">Novo responsável *</Label>
          <select
            id="funcionario_id"
            name="funcionario_id"
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
            className="[color-scheme:light] dark:[color-scheme:dark]"
          />
        </div>
      </div>
      {estado.erro && <p className="text-destructive text-sm">{estado.erro}</p>}
      <div>
        <Button type="submit" disabled={pendente}>
          {pendente ? <Loader2 className="animate-spin" /> : <UserCog />}
          Definir responsável
        </Button>
      </div>
    </form>
  )
}
