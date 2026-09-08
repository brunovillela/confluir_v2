"use client"

import { useActionState } from "react"
import { Loader2, Plus, Save, Trash2 } from "lucide-react"

import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import type { CategoriaConvenio } from "@/lib/db/filiacao-convenios-edicao"

import { excluirCategoriaAction, salvarCategoriaAction } from "../actions"

/** Categorias de convênio: renomear na linha, criar embaixo, excluir só as vazias. */
export function Categorias({ categorias }: { categorias: CategoriaConvenio[] }) {
  return (
    <div className="grid gap-2">
      {categorias.map((c) => (
        <LinhaCategoria key={c.id} categoria={c} />
      ))}
      <NovaCategoria />
    </div>
  )
}

function LinhaCategoria({ categoria }: { categoria: CategoriaConvenio }) {
  const [salvar, salvarAction, salvando] = useActionState(salvarCategoriaAction, {})
  const [excluir, excluirAction, excluindo] = useActionState(excluirCategoriaAction, {})
  const erro = salvar.erro ?? excluir.erro

  return (
    <div className="grid gap-1">
      <div className="flex items-center gap-2">
        <form action={salvarAction} className="flex flex-1 items-center gap-2">
          <input type="hidden" name="categoria_id" value={categoria.id} />
          <Input name="categoria" defaultValue={categoria.categoria ?? ""} required className="max-w-sm" />
          <Button type="submit" size="sm" variant="secondary" disabled={salvando}>
            {salvando ? <Loader2 className="animate-spin" /> : <Save />}
            Salvar
          </Button>
        </form>
        <span className="text-muted-foreground w-24 text-right text-xs tabular-nums">
          {categoria.total} convênio(s)
        </span>
        <form action={excluirAction}>
          <input type="hidden" name="categoria_id" value={categoria.id} />
          <Button
            type="submit"
            variant="ghost"
            size="icon-sm"
            aria-label="Excluir categoria"
            className="text-destructive hover:text-destructive"
            disabled={excluindo || categoria.total > 0}
            title={categoria.total > 0 ? "Mova os convênios antes de excluir" : undefined}
          >
            <Trash2 />
          </Button>
        </form>
      </div>
      {erro && (
        <Alert variant="destructive">
          <AlertDescription>{erro}</AlertDescription>
        </Alert>
      )}
    </div>
  )
}

function NovaCategoria() {
  const [estado, formAction, pendente] = useActionState(salvarCategoriaAction, {})
  return (
    <form action={formAction} className="mt-2 grid gap-1 border-t pt-3">
      <div className="flex items-center gap-2">
        <Input name="categoria" placeholder="Nova categoria (Ótica, Educação, Saúde…)" required className="max-w-sm" />
        <Button type="submit" size="sm" disabled={pendente}>
          {pendente ? <Loader2 className="animate-spin" /> : <Plus />}
          Criar
        </Button>
      </div>
      {estado.erro && (
        <Alert variant="destructive">
          <AlertDescription>{estado.erro}</AlertDescription>
        </Alert>
      )}
    </form>
  )
}
