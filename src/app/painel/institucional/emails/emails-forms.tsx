"use client"

import { useActionState } from "react"
import { Loader2, Trash2 } from "lucide-react"

import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import type { EmailInstitucional } from "@/lib/db/emails-institucionais"

import {
  atualizarEmailAction,
  criarEmailAction,
  excluirEmailAction,
} from "./actions"

const SELECT =
  "border-input bg-background text-foreground h-9 w-full truncate rounded-md border px-3 text-sm shadow-xs outline-none [color-scheme:light] dark:[color-scheme:dark]"

export type Responsavel = { id: string; nome: string }

function SeletorResponsavel({
  responsaveis,
  padrao,
}: {
  responsaveis: Responsavel[]
  padrao?: string | null
}) {
  return (
    <select name="usuario_id" className={SELECT} defaultValue={padrao ?? ""}>
      <option value="">Sem responsável</option>
      {responsaveis.map((r) => (
        <option key={r.id} value={r.id}>
          {r.nome}
        </option>
      ))}
    </select>
  )
}

/** Formulário de cadastro (dentro de um GrupoColapsavel na página). */
export function AdicionarEmail({
  responsaveis,
}: {
  responsaveis: Responsavel[]
}) {
  const [estado, formAction, pendente] = useActionState(criarEmailAction, {})

  return (
    <form action={formAction} className="grid gap-4">
      {estado.erro && (
        <Alert variant="destructive">
          <AlertDescription>{estado.erro}</AlertDescription>
        </Alert>
      )}
      {estado.ok && (
        <Alert className="border-success/40 text-success-fg">
          <AlertDescription>{estado.ok}</AlertDescription>
        </Alert>
      )}
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="grid gap-1.5">
          <Label htmlFor="novo_endereco">Endereço</Label>
          <Input
            id="novo_endereco"
            name="endereco"
            type="email"
            required
            placeholder="setor@organizacao.org.br"
          />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="novo_responsavel">Responsável</Label>
          <SeletorResponsavel responsaveis={responsaveis} />
        </div>
      </div>
      <div>
        <Button type="submit" disabled={pendente}>
          {pendente && <Loader2 className="animate-spin" />}
          Cadastrar e-mail
        </Button>
      </div>
    </form>
  )
}

/** Formulário de edição (children do CartaoEditavel de cada linha). */
export function EditarEmail({
  email,
  responsaveis,
}: {
  email: EmailInstitucional
  responsaveis: Responsavel[]
}) {
  const [estado, formAction, pendente] = useActionState(
    atualizarEmailAction,
    {}
  )

  return (
    <form action={formAction} className="grid gap-4">
      <input type="hidden" name="id" value={email.id} />
      {estado.erro && (
        <Alert variant="destructive">
          <AlertDescription>{estado.erro}</AlertDescription>
        </Alert>
      )}
      {estado.ok && (
        <Alert className="border-success/40 text-success-fg">
          <AlertDescription>{estado.ok}</AlertDescription>
        </Alert>
      )}
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="grid gap-1.5">
          <Label htmlFor={`end-${email.id}`}>Endereço</Label>
          <Input
            id={`end-${email.id}`}
            name="endereco"
            type="email"
            required
            defaultValue={email.endereco}
          />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor={`resp-${email.id}`}>Responsável</Label>
          <SeletorResponsavel
            responsaveis={responsaveis}
            padrao={email.usuarioId}
          />
        </div>
      </div>
      <div>
        <Button type="submit" size="sm" disabled={pendente}>
          {pendente && <Loader2 className="animate-spin" />}
          Salvar
        </Button>
      </div>
    </form>
  )
}

export function BotaoExcluirEmail({ id }: { id: string }) {
  const [estado, formAction, pendente] = useActionState(excluirEmailAction, {})

  return (
    <form action={formAction}>
      <input type="hidden" name="id" value={id} />
      {estado.erro && (
        <p className="text-destructive mb-1 text-xs">{estado.erro}</p>
      )}
      <Button
        type="submit"
        variant="ghost"
        size="sm"
        disabled={pendente}
        aria-label="Remover e-mail"
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
