"use client"

import { useActionState, useState } from "react"
import { Check, Loader2, Pencil, Plus, Trash2, X } from "lucide-react"

import { Button } from "@/components/ui/button"
import { confirmarEnvio } from "@/components/ui/confirmacao"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { type EstadoForm } from "@/lib/contas"
import {
  type BaseCategoria,
  CATEGORIAS_SISTEMA,
  ROTULO_CATEGORIA_SISTEMA,
} from "@/lib/saude-cadastros"

import {
  atualizarCategoriaAction,
  criarCategoriaAction,
  excluirCategoriaAction,
} from "./actions"

const SELECT =
  "border-input bg-background text-foreground h-9 w-full rounded-md border px-3 text-sm shadow-xs outline-none [color-scheme:light] dark:[color-scheme:dark]"

function SeletorBase({ id, valor }: { id: string; valor?: BaseCategoria }) {
  return (
    <select id={id} name="base" defaultValue={valor ?? "empregador"} className={SELECT} required>
      {CATEGORIAS_SISTEMA.map((b) => (
        <option key={b} value={b}>
          Segue as regras de {ROTULO_CATEGORIA_SISTEMA[b]}
        </option>
      ))}
    </select>
  )
}

function Retorno({ estado }: { estado: EstadoForm }) {
  if (estado.erro) return <p className="text-destructive text-sm">{estado.erro}</p>
  if (estado.ok) return <p className="text-success-fg text-sm">{estado.ok}</p>
  return null
}

export function NovaCategoriaForm() {
  const [estado, acao, pendente] = useActionState<EstadoForm, FormData>(criarCategoriaAction, {})
  return (
    <form
      action={acao}
      className="grid gap-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end"
    >
      <div className="grid gap-1.5">
        <Label htmlFor="nova-nome">Nome *</Label>
        <Input id="nova-nome" name="nome" required maxLength={80} placeholder="Ex.: Órgão público" />
      </div>
      <div className="grid gap-1.5">
        <Label htmlFor="nova-base">Regras do vínculo</Label>
        <SeletorBase id="nova-base" />
      </div>
      <Button type="submit" disabled={pendente}>
        {pendente ? <Loader2 className="animate-spin" /> : <Plus />}
        Criar categoria
      </Button>
      <div className="sm:col-span-3">
        <Retorno estado={estado} />
      </div>
    </form>
  )
}

export function LinhaCategoria({
  id,
  nome,
  base,
  fontes,
}: {
  id: string
  nome: string
  base: BaseCategoria
  fontes: number
}) {
  const [editando, setEditando] = useState(false)
  const [estado, salvar, salvando] = useActionState<EstadoForm, FormData>(
    async (prev, fd) => {
      const r = await atualizarCategoriaAction(prev, fd)
      if (r.ok) setEditando(false)
      return r
    },
    {}
  )
  const [estadoExcluir, excluir, excluindo] = useActionState<EstadoForm, FormData>(
    excluirCategoriaAction,
    {}
  )

  if (editando) {
    return (
      <form action={salvar} className="grid gap-2 py-3 sm:grid-cols-[1fr_1fr_auto] sm:items-center">
        <input type="hidden" name="id" value={id} />
        <Input name="nome" defaultValue={nome} required maxLength={80} aria-label="Nome" />
        <SeletorBase id={`base-${id}`} valor={base} />
        <div className="flex gap-1">
          <Button type="submit" size="sm" disabled={salvando}>
            {salvando ? <Loader2 className="animate-spin" /> : <Check />}
            Salvar
          </Button>
          <Button type="button" size="sm" variant="ghost" onClick={() => setEditando(false)}>
            <X />
          </Button>
        </div>
        <div className="sm:col-span-3">
          <Retorno estado={estado} />
        </div>
      </form>
    )
  }

  return (
    <div className="grid gap-1 py-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="min-w-0">
          <p className="text-sm font-medium">{nome}</p>
          <p className="text-muted-foreground text-xs">
            Segue as regras de {ROTULO_CATEGORIA_SISTEMA[base]} ·{" "}
            {fontes === 0 ? "nenhuma fonte" : `${fontes} fonte${fontes === 1 ? "" : "s"}`}
          </p>
        </div>
        <div className="flex gap-1">
          <Button size="sm" variant="ghost" onClick={() => setEditando(true)}>
            <Pencil />
            Editar
          </Button>
          <form
            action={excluir}
            onSubmit={(e) => confirmarEnvio(e, `Excluir a categoria "${nome}"?`)}
          >
            <input type="hidden" name="id" value={id} />
            <Button
              type="submit"
              size="sm"
              variant="ghost"
              disabled={excluindo || fontes > 0}
              title={fontes > 0 ? "Mude a categoria das fontes antes de excluir" : undefined}
              className="text-destructive hover:text-destructive"
            >
              {excluindo ? <Loader2 className="animate-spin" /> : <Trash2 />}
              Excluir
            </Button>
          </form>
        </div>
      </div>
      <Retorno estado={estado.ok ? estado : estadoExcluir} />
    </div>
  )
}
