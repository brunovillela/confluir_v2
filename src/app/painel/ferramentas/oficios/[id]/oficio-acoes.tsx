"use client"

import { useActionState } from "react"
import { Ban, Check, Loader2, Plus, Send, Trash2 } from "lucide-react"

import { Button } from "@/components/ui/button"
import { type EstadoForm } from "@/lib/contas"
import { type CandidatoFiliado } from "@/lib/db/oficios"
import { formatarData } from "@/lib/formato"

import {
  adicionarCandidatosAction,
  adicionarManualAction,
  cancelarOficioAction,
  emitirOficioAction,
  removerFiliadoAction,
} from "../actions"

const INPUT =
  "border-input bg-background text-foreground h-9 rounded-md border px-3 text-sm shadow-xs outline-none"

export function EmitirOficio({
  oficioId,
  proximoNumero,
}: {
  oficioId: string
  proximoNumero: number
}) {
  const [estado, formAction, pendente] = useActionState<EstadoForm, FormData>(
    emitirOficioAction,
    {}
  )
  return (
    <form action={formAction} className="flex flex-wrap items-end gap-2">
      <input type="hidden" name="oficio_id" value={oficioId} />
      <label className="grid gap-1 text-xs">
        Número
        <input
          name="numero"
          type="number"
          min={1}
          defaultValue={proximoNumero}
          className={`${INPUT} w-28 tabular-nums`}
        />
      </label>
      <Button type="submit" disabled={pendente}>
        {pendente ? <Loader2 className="animate-spin" /> : <Send />}
        Emitir
      </Button>
      {estado.erro && (
        <p className="text-destructive w-full text-sm">{estado.erro}</p>
      )}
    </form>
  )
}

export function CancelarOficio({ oficioId }: { oficioId: string }) {
  const [estado, formAction, pendente] = useActionState<EstadoForm, FormData>(
    cancelarOficioAction,
    {}
  )
  return (
    <form
      action={formAction}
      onSubmit={(e) => {
        if (!confirm("Cancelar este ofício?")) e.preventDefault()
      }}
    >
      <input type="hidden" name="oficio_id" value={oficioId} />
      <Button type="submit" variant="outline" size="sm" disabled={pendente}>
        {pendente ? <Loader2 className="animate-spin" /> : <Ban />}
        Cancelar
      </Button>
      {estado.erro && <span className="text-destructive text-xs">{estado.erro}</span>}
    </form>
  )
}

export function AdicionarManual({ oficioId }: { oficioId: string }) {
  const [estado, formAction, pendente] = useActionState<EstadoForm, FormData>(
    adicionarManualAction,
    {}
  )
  return (
    <form action={formAction} className="flex flex-wrap items-end gap-2">
      <input type="hidden" name="oficio_id" value={oficioId} />
      <label className="grid gap-1 text-xs">
        Nome
        <input name="nome" required className={`${INPUT} w-64`} />
      </label>
      <label className="grid gap-1 text-xs">
        Matrícula
        <input name="matricula" className={`${INPUT} w-40`} />
      </label>
      <Button type="submit" size="sm" variant="outline" disabled={pendente}>
        {pendente ? <Loader2 className="animate-spin" /> : <Plus />}
        Adicionar
      </Button>
      {estado.erro && (
        <p className="text-destructive w-full text-sm">{estado.erro}</p>
      )}
    </form>
  )
}

export function RemoverFiliado({
  filiadoId,
  oficioId,
}: {
  filiadoId: string
  oficioId: string
}) {
  const [, formAction, pendente] = useActionState<EstadoForm, FormData>(
    removerFiliadoAction,
    {}
  )
  return (
    <form action={formAction}>
      <input type="hidden" name="filiado_id" value={filiadoId} />
      <input type="hidden" name="oficio_id" value={oficioId} />
      <Button
        type="submit"
        variant="ghost"
        size="sm"
        disabled={pendente}
        aria-label="Remover"
      >
        {pendente ? (
          <Loader2 className="animate-spin" />
        ) : (
          <Trash2 className="text-destructive" />
        )}
      </Button>
    </form>
  )
}

export function CandidatosForm({
  oficioId,
  empresaId,
  tipo,
  candidatos,
}: {
  oficioId: string
  empresaId: string
  tipo: string
  candidatos: CandidatoFiliado[]
}) {
  const [estado, formAction, pendente] = useActionState<EstadoForm, FormData>(
    adicionarCandidatosAction,
    {}
  )

  if (candidatos.length === 0) {
    return (
      <p className="text-muted-foreground text-sm">
        Nenhum {tipo === "desfiliacao" ? "desfiliado" : "filiado"} pendente
        nesta fonte pagadora.
      </p>
    )
  }

  return (
    <form action={formAction} className="grid gap-2">
      <input type="hidden" name="oficio_id" value={oficioId} />
      <input type="hidden" name="empresa_id" value={empresaId} />
      <input type="hidden" name="tipo" value={tipo} />
      <div className="max-h-72 overflow-y-auto rounded-md border">
        {candidatos.map((c) => (
          <label
            key={c.vinculoId}
            className="hover:bg-muted/50 flex items-center gap-3 border-b px-3 py-2 text-sm last:border-b-0"
          >
            <input type="checkbox" name="sel" value={c.vinculoId} className="size-4" />
            <span className="flex-1">{c.nome ?? "(sem nome)"}</span>
            {c.matricula && (
              <span className="text-muted-foreground tabular-nums">
                mat. {c.matricula}
              </span>
            )}
            <span className="text-muted-foreground text-xs">
              {c.data ? formatarData(c.data) : ""}
            </span>
          </label>
        ))}
      </div>
      <div className="flex items-center gap-3">
        <Button type="submit" size="sm" disabled={pendente}>
          {pendente ? <Loader2 className="animate-spin" /> : <Check />}
          Adicionar selecionados
        </Button>
        {estado.erro && <span className="text-destructive text-sm">{estado.erro}</span>}
        {estado.ok && (
          <span className="text-success-fg text-sm">{estado.ok}</span>
        )}
      </div>
    </form>
  )
}
