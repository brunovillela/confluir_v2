"use client"

import { useActionState } from "react"
import Link from "next/link"
import { Loader2, Trash2 } from "lucide-react"

import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"

import {
  atualizarApontamento,
  criarApontamento,
  excluirApontamento,
} from "./actions"

export type ApontamentoEditavel = {
  id: string
  data: string | null
  tipo: string | null
  descricao: string | null
}

export function ApontamentoForm({
  filiadoId,
  tipos,
  apontamento,
}: {
  filiadoId: string
  /** Tipos já usados no prontuário (sugestões do datalist). */
  tipos: string[]
  /** Presente = edição de um apontamento existente. */
  apontamento?: ApontamentoEditavel
}) {
  const [estado, formAction, pendente] = useActionState(
    apontamento ? atualizarApontamento : criarApontamento,
    {}
  )

  return (
    <form action={formAction} className="grid gap-3">
      {estado.erro && (
        <Alert variant="destructive">
          <AlertDescription>{estado.erro}</AlertDescription>
        </Alert>
      )}
      <input type="hidden" name="filiado_id" value={filiadoId} />
      {apontamento && (
        <input type="hidden" name="apontamento_id" value={apontamento.id} />
      )}
      <div className="grid gap-3 sm:grid-cols-[10rem_1fr]">
        <div className="grid gap-1.5">
          <Label htmlFor="data">Data</Label>
          <Input
            id="data"
            name="data"
            type="date"
            defaultValue={(
              apontamento?.data ?? new Date().toISOString()
            ).slice(0, 10)}
          />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="tipo">Tipo</Label>
          <Input
            id="tipo"
            name="tipo"
            list="tipos-prontuario"
            defaultValue={apontamento?.tipo ?? ""}
            placeholder="Atualização cadastral, atendimento, homologação…"
          />
          <datalist id="tipos-prontuario">
            {tipos.map((t) => (
              <option key={t} value={t} />
            ))}
          </datalist>
        </div>
      </div>
      <div className="grid gap-1.5">
        <Label htmlFor="descricao">Apontamento *</Label>
        <textarea
          id="descricao"
          name="descricao"
          required
          rows={3}
          defaultValue={apontamento?.descricao ?? ""}
          className="border-input placeholder:text-muted-foreground w-full rounded-md border bg-transparent px-3 py-2 text-sm shadow-xs outline-none"
          placeholder="Descreva a ocorrência…"
        />
      </div>
      <div className="flex justify-end gap-2">
        {apontamento && (
          <Button variant="ghost" size="sm" asChild>
            <Link href={`/painel/filiados/${filiadoId}/prontuario`}>
              Cancelar edição
            </Link>
          </Button>
        )}
        <Button type="submit" size="sm" disabled={pendente}>
          {pendente && <Loader2 className="animate-spin" />}
          {apontamento ? "Salvar alterações" : "Registrar apontamento"}
        </Button>
      </div>
    </form>
  )
}

export function ExcluirApontamento({
  filiadoId,
  apontamentoId,
}: {
  filiadoId: string
  apontamentoId: string
}) {
  const [, formAction, pendente] = useActionState(excluirApontamento, {})
  return (
    <form
      action={formAction}
      onSubmit={(e) => {
        if (!confirm("Excluir este apontamento do prontuário?")) {
          e.preventDefault()
        }
      }}
    >
      <input type="hidden" name="filiado_id" value={filiadoId} />
      <input type="hidden" name="apontamento_id" value={apontamentoId} />
      <Button
        type="submit"
        variant="ghost"
        size="icon"
        disabled={pendente}
        className="text-destructive hover:text-destructive size-7"
        aria-label="Excluir apontamento"
      >
        {pendente ? (
          <Loader2 className="size-3.5 animate-spin" />
        ) : (
          <Trash2 className="size-3.5" />
        )}
      </Button>
    </form>
  )
}
