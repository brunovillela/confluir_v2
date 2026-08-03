"use client"

import { useActionState } from "react"
import { Loader2, Trash2 } from "lucide-react"

import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import type { NoticiaCompleta } from "@/lib/db/painel"

import {
  atualizarNoticiaAction,
  criarNoticiaAction,
  excluirNoticiaAction,
} from "./actions"

const FILE =
  "border-input bg-background text-foreground w-full rounded-md border px-3 py-1.5 text-sm shadow-xs outline-none file:mr-3 file:rounded file:border-0 file:bg-muted file:px-2 file:py-1 file:text-sm"

function CamposNoticia({
  noticia,
}: {
  noticia?: NoticiaCompleta
}) {
  return (
    <>
      <div className="grid gap-1.5">
        <Label htmlFor="manchete">Manchete</Label>
        <Input
          id="manchete"
          name="manchete"
          required
          maxLength={300}
          defaultValue={noticia?.manchete ?? ""}
          placeholder="Título da notícia"
        />
      </div>
      <div className="grid gap-1.5">
        <Label htmlFor="noticia">Conteúdo</Label>
        <Textarea
          id="noticia"
          name="noticia"
          rows={8}
          defaultValue={noticia?.noticia ?? ""}
          placeholder="Texto da notícia"
        />
      </div>
      <div className="grid gap-1.5">
        <Label htmlFor="imagem">
          Imagem {noticia ? "(deixe vazio para manter a atual)" : "(opcional)"}
        </Label>
        <input
          id="imagem"
          name="imagem"
          type="file"
          accept="image/*"
          className={FILE}
        />
      </div>
    </>
  )
}

export function NovaNoticiaForm() {
  const [estado, formAction, pendente] = useActionState(
    criarNoticiaAction,
    {}
  )
  return (
    <form action={formAction} className="grid gap-4">
      {estado.erro && (
        <Alert variant="destructive">
          <AlertDescription>{estado.erro}</AlertDescription>
        </Alert>
      )}
      <CamposNoticia />
      <div>
        <Button type="submit" disabled={pendente}>
          {pendente && <Loader2 className="animate-spin" />}
          Publicar notícia
        </Button>
      </div>
    </form>
  )
}

export function EditarNoticiaForm({
  noticia,
  aoCancelarHref,
}: {
  noticia: NoticiaCompleta
  aoCancelarHref: string
}) {
  const [estado, formAction, pendente] = useActionState(
    atualizarNoticiaAction,
    {}
  )
  return (
    <form action={formAction} className="grid gap-4">
      <input type="hidden" name="id" value={noticia.id} />
      {estado.erro && (
        <Alert variant="destructive">
          <AlertDescription>{estado.erro}</AlertDescription>
        </Alert>
      )}
      <CamposNoticia noticia={noticia} />
      <div className="flex gap-2">
        <Button type="submit" disabled={pendente}>
          {pendente && <Loader2 className="animate-spin" />}
          Salvar
        </Button>
        <Button type="button" variant="ghost" asChild>
          <a href={aoCancelarHref}>Cancelar</a>
        </Button>
      </div>
    </form>
  )
}

export function BotaoExcluirNoticia({ id }: { id: string }) {
  const [estado, formAction, pendente] = useActionState(
    excluirNoticiaAction,
    {}
  )
  return (
    <form action={formAction}>
      <input type="hidden" name="id" value={id} />
      {estado.erro && (
        <p className="text-destructive mb-1 text-xs">{estado.erro}</p>
      )}
      <Button
        type="submit"
        variant="outline"
        size="sm"
        disabled={pendente}
        onClick={(e) => {
          if (!confirm("Excluir esta notícia?")) e.preventDefault()
        }}
      >
        {pendente ? (
          <Loader2 className="animate-spin" />
        ) : (
          <Trash2 className="text-destructive" />
        )}
        Excluir
      </Button>
    </form>
  )
}
