"use client"

import { useActionState, useEffect, useState } from "react"
import { Loader2, Lock, Pencil, Plus, Trash2, X } from "lucide-react"

import { Alert, AlertDescription } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import type { CategoriaContrato } from "@/lib/db/contratos"

import {
  atualizarCategoriaAction,
  criarCategoriaAction,
  excluirCategoriaAction,
} from "../actions"

function CheckSigiloso({ defaultChecked }: { defaultChecked?: boolean }) {
  return (
    <label className="flex items-center gap-2 text-sm">
      <input
        type="checkbox"
        name="sigiloso"
        defaultChecked={defaultChecked}
        className="size-4 accent-primary"
      />
      Sigilosa — oculta os contratos de quem não edita
    </label>
  )
}

export function NovaCategoria() {
  const [estado, formAction, pendente] = useActionState(criarCategoriaAction, {})
  return (
    // key troca a cada sucesso → limpa o formulário (React 19 não reseta em action)
    <form key={estado.ok ?? "novo"} action={formAction} className="grid gap-3 sm:max-w-md">
      {estado.erro && (
        <Alert variant="destructive">
          <AlertDescription>{estado.erro}</AlertDescription>
        </Alert>
      )}
      <div className="grid gap-1.5">
        <Label htmlFor="nome">Nome da categoria *</Label>
        <Input id="nome" name="nome" required placeholder="Ex.: Jurídico" />
      </div>
      <CheckSigiloso />
      <div>
        <Button type="submit" size="sm" disabled={pendente}>
          {pendente ? <Loader2 className="animate-spin" /> : <Plus />}
          Adicionar categoria
        </Button>
      </div>
    </form>
  )
}

export function ListaCategorias({
  categorias,
}: {
  categorias: CategoriaContrato[]
}) {
  if (categorias.length === 0) {
    return (
      <p className="text-muted-foreground py-6 text-center text-sm">
        Nenhuma categoria cadastrada ainda.
      </p>
    )
  }
  return (
    <ul className="grid gap-2">
      {categorias.map((c) => (
        <LinhaCategoria key={c.id} categoria={c} />
      ))}
    </ul>
  )
}

function LinhaCategoria({ categoria }: { categoria: CategoriaContrato }) {
  const [editando, setEditando] = useState(false)
  return (
    <li className="border-border rounded-md border p-3">
      {editando ? (
        <EditarCategoria
          categoria={categoria}
          aoFechar={() => setEditando(false)}
        />
      ) : (
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-medium">{categoria.nome ?? "(sem nome)"}</span>
            {categoria.sigiloso && (
              <Badge
                variant="outline"
                className="border-warning/40 text-warning-fg gap-1"
              >
                <Lock className="size-3" />
                Sigilosa
              </Badge>
            )}
            <span className="text-muted-foreground text-xs">
              {categoria.usos} contrato{categoria.usos === 1 ? "" : "s"}
            </span>
          </div>
          <div className="flex items-center gap-1">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setEditando(true)}
            >
              <Pencil />
              Editar
            </Button>
            <ExcluirCategoria categoria={categoria} />
          </div>
        </div>
      )}
    </li>
  )
}

function EditarCategoria({
  categoria,
  aoFechar,
}: {
  categoria: CategoriaContrato
  aoFechar: () => void
}) {
  const [estado, formAction, pendente] = useActionState(
    atualizarCategoriaAction,
    {}
  )
  useEffect(() => {
    if (estado.ok) aoFechar()
  }, [estado.ok, aoFechar])

  return (
    <form action={formAction} className="grid gap-3">
      {estado.erro && (
        <Alert variant="destructive">
          <AlertDescription>{estado.erro}</AlertDescription>
        </Alert>
      )}
      <input type="hidden" name="categoria_id" value={categoria.id} />
      <div className="grid gap-1.5">
        <Label htmlFor={`nome-${categoria.id}`}>Nome da categoria *</Label>
        <Input
          id={`nome-${categoria.id}`}
          name="nome"
          required
          defaultValue={categoria.nome ?? ""}
        />
      </div>
      <CheckSigiloso defaultChecked={categoria.sigiloso} />
      <div className="flex gap-2">
        <Button type="submit" size="sm" disabled={pendente}>
          {pendente && <Loader2 className="animate-spin" />}
          Salvar
        </Button>
        <Button type="button" variant="ghost" size="sm" onClick={aoFechar}>
          <X />
          Cancelar
        </Button>
      </div>
    </form>
  )
}

function ExcluirCategoria({ categoria }: { categoria: CategoriaContrato }) {
  const [estado, formAction, pendente] = useActionState(
    excluirCategoriaAction,
    {}
  )
  return (
    <form
      action={formAction}
      className="inline-flex flex-col items-end"
      onSubmit={(e) => {
        if (!confirm(`Excluir a categoria "${categoria.nome ?? ""}"?`)) {
          e.preventDefault()
        }
      }}
    >
      <input type="hidden" name="categoria_id" value={categoria.id} />
      <Button
        type="submit"
        variant="ghost"
        size="sm"
        className="text-destructive"
        disabled={pendente}
      >
        {pendente ? <Loader2 className="animate-spin" /> : <Trash2 />}
        Excluir
      </Button>
      {estado.erro && (
        <span className="text-destructive mt-1 max-w-72 text-right text-xs">
          {estado.erro}
        </span>
      )}
    </form>
  )
}
