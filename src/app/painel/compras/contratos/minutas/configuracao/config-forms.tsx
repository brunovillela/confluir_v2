"use client"

import { useActionState, useState } from "react"
import { Loader2, Save, Trash2 } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import type { ClausulaFixa, TipoMinutaConfig } from "@/lib/contratos-minutas-constantes"

import {
  excluirClausulaFixaAction,
  salvarClausulaFixaAction,
  salvarTipoMinutaAction,
} from "../actions"

function Rodape({ pendente, ok, erro }: { pendente: boolean; ok?: string; erro?: string }) {
  return (
    <div className="flex items-center gap-3">
      <Button type="submit" size="sm" disabled={pendente}>
        {pendente ? <Loader2 className="animate-spin" /> : <Save />}
        Salvar
      </Button>
      {ok && <span className="text-success-fg text-xs">{ok}</span>}
      {erro && <span className="text-destructive text-xs">{erro}</span>}
    </div>
  )
}

export function TipoForm({ tipo }: { tipo?: TipoMinutaConfig }) {
  const [estado, acao, pendente] = useActionState(salvarTipoMinutaAction, {})
  return (
    <form action={acao} className="grid gap-3">
      {tipo && <input type="hidden" name="id" value={tipo.id} />}
      <div className="grid gap-3 md:grid-cols-[1fr_7rem]">
        <div className="grid gap-1.5">
          <Label htmlFor={`nome-${tipo?.id ?? "novo"}`}>Nome *</Label>
          <Input
            id={`nome-${tipo?.id ?? "novo"}`}
            name="nome"
            required
            defaultValue={tipo?.nome ?? ""}
            placeholder="Ex.: Prestação de serviços por prazo determinado"
          />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor={`ordem-${tipo?.id ?? "novo"}`}>Ordem</Label>
          <Input id={`ordem-${tipo?.id ?? "novo"}`} name="ordem" inputMode="numeric" defaultValue={tipo?.ordem ?? 0} />
        </div>
      </div>
      <div className="grid gap-1.5">
        <Label htmlFor={`descricao-${tipo?.id ?? "novo"}`}>Explicação para quem escolhe</Label>
        <Input
          id={`descricao-${tipo?.id ?? "novo"}`}
          name="descricao"
          defaultValue={tipo?.descricao ?? ""}
          placeholder="Aparece embaixo do nome na hora de criar a minuta"
        />
      </div>
      <div className="grid gap-1.5">
        <Label htmlFor={`orientacao-${tipo?.id ?? "novo"}`}>Orientação para a IA</Label>
        <Textarea
          id={`orientacao-${tipo?.id ?? "novo"}`}
          name="orientacao"
          rows={3}
          defaultValue={tipo?.orientacao ?? ""}
          placeholder="O que a minuta desse tipo precisa conter: prazo, forma de preço, reajuste, entrega, garantias…"
        />
      </div>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" name="ativo" defaultChecked={tipo?.ativo ?? true} className="accent-primary size-4" />
        Ativo — aparece na criação de minutas
      </label>
      <Rodape pendente={pendente} ok={estado.ok} erro={estado.erro} />
    </form>
  )
}

export function ClausulaForm({
  clausula,
  tipos,
}: {
  clausula?: ClausulaFixa
  tipos: TipoMinutaConfig[]
}) {
  const [estado, acao, pendente] = useActionState(salvarClausulaFixaAction, {})
  const [todos, setTodos] = useState((clausula?.tipos.length ?? 0) === 0)
  const sufixo = clausula?.id ?? "nova"
  return (
    <form action={acao} className="grid gap-3">
      {clausula && <input type="hidden" name="id" value={clausula.id} />}
      <div className="grid gap-3 md:grid-cols-[1fr_7rem]">
        <div className="grid gap-1.5">
          <Label htmlFor={`titulo-${sufixo}`}>Título *</Label>
          <Input
            id={`titulo-${sufixo}`}
            name="titulo"
            required
            defaultValue={clausula?.titulo ?? ""}
            placeholder="Ex.: Da responsabilidade por vícios do produto ou serviço"
          />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor={`ordem-${sufixo}`}>Ordem</Label>
          <Input id={`ordem-${sufixo}`} name="ordem" inputMode="numeric" defaultValue={clausula?.ordem ?? 0} />
        </div>
      </div>
      <div className="grid gap-1.5">
        <Label htmlFor={`texto-${sufixo}`}>Texto da cláusula *</Label>
        <Textarea
          id={`texto-${sufixo}`}
          name="texto"
          rows={6}
          required
          defaultValue={clausula?.texto ?? ""}
          placeholder="Escreva o texto exatamente como deve sair no contrato. A IA não altera uma palavra — só numera e encaixa."
        />
        <span className="text-muted-foreground text-xs">
          Use “CONTRATANTE” e “CONTRATADA” para as partes, como em qualquer contrato.
        </span>
      </div>
      <fieldset className="grid gap-2">
        <legend className="mb-1 text-sm font-medium">Vale para</legend>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            name="todos_tipos"
            checked={todos}
            onChange={(e) => setTodos(e.target.checked)}
            className="accent-primary size-4"
          />
          Todos os tipos de contrato
        </label>
        {!todos && (
          <div className="grid gap-1 sm:grid-cols-2">
            {tipos.map((t) => (
              <label key={t.id} className="flex items-start gap-2 text-sm">
                <input
                  type="checkbox"
                  name="tipos"
                  value={t.id}
                  defaultChecked={clausula?.tipos.includes(t.id)}
                  className="accent-primary mt-0.5 size-4"
                />
                <span className={t.ativo ? "" : "text-muted-foreground"}>
                  {t.nome}
                  {t.ativo ? "" : " (inativo)"}
                </span>
              </label>
            ))}
          </div>
        )}
      </fieldset>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" name="ativa" defaultChecked={clausula?.ativa ?? true} className="accent-primary size-4" />
        Ativa — entra nas minutas novas
      </label>
      <Rodape pendente={pendente} ok={estado.ok} erro={estado.erro} />
    </form>
  )
}

export function ExcluirClausula({ id }: { id: string }) {
  return (
    <form
      action={excluirClausulaFixaAction}
      onSubmit={(e) => {
        if (!confirm("Excluir esta cláusula fixa? Minutas já redigidas não mudam.")) e.preventDefault()
      }}
    >
      <input type="hidden" name="id" value={id} />
      <Button type="submit" variant="ghost" size="sm" className="text-destructive">
        <Trash2 />
        Excluir
      </Button>
    </form>
  )
}
