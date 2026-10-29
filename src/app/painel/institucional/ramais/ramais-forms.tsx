"use client"

import { startTransition, useActionState, useState, type ReactNode } from "react"
import { Loader2, Pencil, Save, Trash2, X } from "lucide-react"

import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { confirmarEnvio } from "@/components/ui/confirmacao"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { type EstadoForm } from "@/lib/contas"
import type { ResponsavelLinha } from "@/lib/db/linhas-institucionais"
import type { Ramal } from "@/lib/db/ramais"
import { formatarTelefone } from "@/lib/formato"

import { atualizarRamalAction, criarRamalAction, excluirRamalAction } from "./actions"

const SELECT =
  "border-input bg-background text-foreground h-9 w-full truncate rounded-md border px-3 text-sm shadow-xs outline-none [color-scheme:light] dark:[color-scheme:dark]"

function Mensagem({ estado }: { estado: EstadoForm }) {
  if (estado.erro)
    return (
      <Alert variant="destructive">
        <AlertDescription>{estado.erro}</AlertDescription>
      </Alert>
    )
  if (estado.ok)
    return (
      <Alert className="border-success/40 text-success-fg">
        <AlertDescription>{estado.ok}</AlertDescription>
      </Alert>
    )
  return null
}

/**
 * Formulário do ramal (novo ou edição). Envio por startTransition: com
 * `action={...}` o React 19 reinicia o formulário depois de um erro.
 */
export function FormularioRamal({
  ramal,
  responsaveis,
  aoSalvar,
}: {
  ramal?: Ramal
  responsaveis: ResponsavelLinha[]
  aoSalvar?: () => void
}) {
  const [estado, formAction, pendente] = useActionState<EstadoForm, FormData>(
    async (prev, dados) => {
      const r = await (ramal ? atualizarRamalAction : criarRamalAction)(prev, dados)
      if (r.ok) aoSalvar?.()
      return r
    },
    {}
  )
  const p = ramal ? `r${ramal.id.slice(0, 8)}` : "novo"
  const grupos = [...new Set(responsaveis.map((r) => r.origem))]
  return (
    <form
      key={estado.ok && !ramal ? "limpo" : "form"}
      onSubmit={(e) => {
        e.preventDefault()
        const dados = new FormData(e.currentTarget)
        startTransition(() => formAction(dados))
      }}
      className="grid gap-3"
    >
      {ramal && <input type="hidden" name="id" value={ramal.id} />}
      <Mensagem estado={estado} />
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div className="grid gap-1.5">
          <Label htmlFor={`${p}-ramal`}>Ramal</Label>
          <Input id={`${p}-ramal`} name="ramal" inputMode="numeric" placeholder="2104" defaultValue={ramal?.ramal ?? ""} />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor={`${p}-direto`}>Telefone direto (com DDD)</Label>
          <Input
            id={`${p}-direto`}
            name="telefone_direto"
            inputMode="tel"
            placeholder="(22) 2765-9550"
            defaultValue={ramal?.telefoneDireto ? formatarTelefone(ramal.telefoneDireto) : ""}
          />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor={`${p}-local`}>Local</Label>
          <Input id={`${p}-local`} name="local" placeholder="Sala da secretaria" defaultValue={ramal?.local ?? ""} />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor={`${p}-usuario`}>Quem atende</Label>
          <select id={`${p}-usuario`} name="usuario_id" className={SELECT} defaultValue={ramal?.usuarioId ?? ""}>
            <option value="">Uso geral (sem pessoa)</option>
            {grupos.map((g) => (
              <optgroup key={g} label={g}>
                {responsaveis
                  .filter((r) => r.origem === g)
                  .map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.nome}
                    </option>
                  ))}
              </optgroup>
            ))}
          </select>
        </div>
        <div className="grid gap-1.5 sm:col-span-2 lg:col-span-4">
          <Label htmlFor={`${p}-obs`}>Observação</Label>
          <Input id={`${p}-obs`} name="observacao" defaultValue={ramal?.observacao ?? ""} />
        </div>
      </div>
      <div className="flex justify-end">
        <Button type="submit" disabled={pendente}>
          {pendente ? <Loader2 className="animate-spin" /> : <Save />}
          {ramal ? "Salvar" : "Cadastrar ramal"}
        </Button>
      </div>
    </form>
  )
}

/** Uma linha da lista: os dados (children), o lápis e a lixeira; o lápis troca a linha pelo formulário. */
export function LinhaRamal({
  ramal,
  responsaveis,
  children,
}: {
  ramal: Ramal
  responsaveis: ResponsavelLinha[]
  children: ReactNode
}) {
  const [editando, setEditando] = useState(false)
  const [estado, formAction, pendente] = useActionState<EstadoForm, FormData>(excluirRamalAction, {})
  if (editando) {
    return (
      <li className="bg-muted/30 grid gap-2 rounded-lg border p-3">
        <div className="flex items-center justify-between">
          <span className="text-sm font-medium">Editar ramal</span>
          <Button variant="ghost" size="sm" onClick={() => setEditando(false)}>
            <X />
            Fechar
          </Button>
        </div>
        <FormularioRamal ramal={ramal} responsaveis={responsaveis} aoSalvar={() => setEditando(false)} />
      </li>
    )
  }
  return (
    <li className="flex items-center gap-3 py-2">
      <div className="min-w-0 flex-1">{children}</div>
      {estado.erro && <span className="text-destructive text-xs">{estado.erro}</span>}
      <Button variant="ghost" size="sm" className="h-7 px-2" onClick={() => setEditando(true)} aria-label="Editar ramal">
        <Pencil />
      </Button>
      <form action={formAction} onSubmit={(e) => confirmarEnvio(e, "Remover este ramal do cadastro?")}>
        <input type="hidden" name="id" value={ramal.id} />
        <Button
          type="submit"
          variant="ghost"
          size="sm"
          className="text-destructive hover:text-destructive h-7 px-2"
          disabled={pendente}
          aria-label="Remover ramal"
        >
          {pendente ? <Loader2 className="animate-spin" /> : <Trash2 />}
        </Button>
      </form>
    </li>
  )
}
