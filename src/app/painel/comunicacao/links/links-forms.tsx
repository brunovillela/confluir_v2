"use client"

import { useActionState } from "react"
import {
  ArrowDown,
  ArrowUp,
  Eye,
  EyeOff,
  Loader2,
  Pencil,
  X,
} from "lucide-react"

import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"

import {
  adicionarLink,
  alternarAtivoLink,
  atualizarLink,
  excluirLink,
  moverLink,
  salvarConfigLinks,
} from "./actions"

type Estado = { erro?: string; ok?: string }
type ActionForm = (p: Estado, fd: FormData) => Promise<Estado>

export function ConfigLinksForm({
  config,
  nomeEntidade,
}: {
  config: { titulo: string | null; bio: string | null; publicada: boolean }
  nomeEntidade: string
}) {
  const [estado, action, pend] = useActionState(salvarConfigLinks, {})
  return (
    <form action={action} className="grid gap-4">
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
      <div className="grid gap-1.5">
        <Label htmlFor="titulo">Título da página</Label>
        <Input
          id="titulo"
          name="titulo"
          placeholder={nomeEntidade}
          defaultValue={config.titulo ?? ""}
        />
        <p className="text-muted-foreground text-xs">
          Vazio usa o nome da entidade.
        </p>
      </div>
      <div className="grid gap-1.5">
        <Label htmlFor="bio">Bio (frase curta sob o título)</Label>
        <Textarea
          id="bio"
          name="bio"
          rows={2}
          placeholder="Ex.: Todos os nossos canais num só lugar."
          defaultValue={config.bio ?? ""}
        />
      </div>
      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          name="publicada"
          defaultChecked={config.publicada}
          className="size-4"
        />
        Página publicada (visível para quem acessar o link)
      </label>
      <div className="flex justify-end">
        <Button type="submit" variant="secondary" disabled={pend}>
          {pend && <Loader2 className="animate-spin" />}
          Salvar página
        </Button>
      </div>
    </form>
  )
}

export function NovoLinkForm() {
  const [estado, action, pend] = useActionState(adicionarLink, {})
  return (
    <form action={action} className="grid gap-3">
      {estado.erro && (
        <Alert variant="destructive">
          <AlertDescription>{estado.erro}</AlertDescription>
        </Alert>
      )}
      <div className="grid gap-2 sm:grid-cols-2">
        <Input name="titulo" placeholder="Título do link *" required />
        <Input name="url" inputMode="url" placeholder="https://… *" required />
      </div>
      <div className="flex items-end gap-2">
        <Input
          name="descricao"
          placeholder="Descrição curta (opcional)"
          className="flex-1"
        />
        <Button type="submit" variant="secondary" disabled={pend}>
          {pend && <Loader2 className="animate-spin" />}
          Adicionar link
        </Button>
      </div>
    </form>
  )
}

function BotaoIcone({
  action,
  hidden,
  title,
  children,
  destrutivo,
}: {
  action: ActionForm
  hidden: Record<string, string>
  title: string
  children: React.ReactNode
  destrutivo?: boolean
}) {
  const [, act, pend] = useActionState(action, {})
  return (
    <form action={act}>
      {Object.entries(hidden).map(([k, v]) => (
        <input key={k} type="hidden" name={k} value={v} />
      ))}
      <Button
        type="submit"
        variant="ghost"
        size="sm"
        disabled={pend}
        title={title}
        className={
          destrutivo
            ? "text-destructive hover:text-destructive h-7 px-2"
            : "h-7 px-2"
        }
      >
        {pend ? <Loader2 className="size-3.5 animate-spin" /> : children}
      </Button>
    </form>
  )
}

export function LinhaLink({
  link,
  primeiro,
  ultimo,
}: {
  link: {
    id: string
    titulo: string | null
    descricao: string | null
    url: string | null
    ativo: boolean
    cliques: number
  }
  primeiro: boolean
  ultimo: boolean
}) {
  const [estadoEdit, editAction, editPend] = useActionState(atualizarLink, {})
  return (
    <li className={`px-3 py-2 ${link.ativo ? "" : "opacity-60"}`}>
      <div className="flex items-center gap-1">
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium">
            {link.titulo ?? "(sem título)"}
            {!link.ativo && (
              <span className="text-muted-foreground ml-2 text-xs">(oculto)</span>
            )}
          </p>
          <p className="text-muted-foreground truncate text-xs">
            {link.url ?? "—"}
            {link.descricao ? ` · ${link.descricao}` : ""}
          </p>
        </div>
        <span
          className="text-muted-foreground shrink-0 text-xs tabular-nums"
          title="Cliques"
        >
          {link.cliques} clique{link.cliques === 1 ? "" : "s"}
        </span>
        {!primeiro && (
          <BotaoIcone
            action={moverLink}
            hidden={{ id: link.id, direcao: "subir" }}
            title="Subir"
          >
            <ArrowUp className="size-3.5" />
          </BotaoIcone>
        )}
        {!ultimo && (
          <BotaoIcone
            action={moverLink}
            hidden={{ id: link.id, direcao: "descer" }}
            title="Descer"
          >
            <ArrowDown className="size-3.5" />
          </BotaoIcone>
        )}
        <BotaoIcone
          action={alternarAtivoLink}
          hidden={{ id: link.id, ativar: link.ativo ? "0" : "1" }}
          title={link.ativo ? "Ocultar da página" : "Mostrar na página"}
        >
          {link.ativo ? (
            <EyeOff className="size-3.5" />
          ) : (
            <Eye className="size-3.5" />
          )}
        </BotaoIcone>
        <BotaoIcone
          action={excluirLink}
          hidden={{ id: link.id }}
          title="Excluir link"
          destrutivo
        >
          <X className="size-3.5" />
        </BotaoIcone>
      </div>
      <details className="mt-1">
        <summary className="text-muted-foreground hover:text-foreground cursor-pointer text-xs">
          <Pencil className="mr-1 inline size-3 align-[-1px]" />
          Editar
        </summary>
        <form action={editAction} className="mt-2 grid gap-2">
          {estadoEdit.erro && (
            <Alert variant="destructive">
              <AlertDescription>{estadoEdit.erro}</AlertDescription>
            </Alert>
          )}
          <input type="hidden" name="id" value={link.id} />
          <div className="grid gap-2 sm:grid-cols-2">
            <Input name="titulo" defaultValue={link.titulo ?? ""} required />
            <Input
              name="url"
              inputMode="url"
              defaultValue={link.url ?? ""}
              required
            />
          </div>
          <div className="flex items-end gap-2">
            <Input
              name="descricao"
              placeholder="Descrição curta (opcional)"
              defaultValue={link.descricao ?? ""}
              className="flex-1"
            />
            <Button type="submit" variant="secondary" size="sm" disabled={editPend}>
              {editPend && <Loader2 className="animate-spin" />}
              Salvar
            </Button>
          </div>
        </form>
      </details>
    </li>
  )
}
