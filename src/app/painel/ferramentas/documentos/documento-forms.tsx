"use client"

import { useActionState, useState } from "react"
import { Loader2, Trash2, Upload } from "lucide-react"

import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"

import {
  atualizarDocumentoAction,
  criarDocumentoAction,
  criarVersaoAction,
  excluirDocumentoAction,
  excluirVersaoAction,
} from "./actions"

const DATA =
  "border-input bg-background text-foreground h-9 w-full rounded-md border px-3 text-sm shadow-xs outline-none [color-scheme:light] dark:[color-scheme:dark]"

type Opcao = { id: string; nome: string | null }

/** Campos de vigência reusados no cadastro e na nova versão. */
function CamposVigencia({
  inicio,
  termino,
  semVigencia,
}: {
  inicio?: string | null
  termino?: string | null
  semVigencia?: boolean
}) {
  const [sem, setSem] = useState(semVigencia ?? false)
  return (
    <div className="grid gap-3">
      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          name="sem_vigencia"
          checked={sem}
          onChange={(e) => setSem(e.target.checked)}
          className="size-4 accent-primary"
        />
        Sem vigência definida (validade indeterminada)
      </label>
      {!sem && (
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="grid gap-1.5">
            <Label htmlFor="vigencia_inicio">Início da vigência</Label>
            <input
              id="vigencia_inicio"
              name="vigencia_inicio"
              type="date"
              className={DATA}
              defaultValue={inicio ?? ""}
            />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="vigencia_termino">Término da vigência</Label>
            <input
              id="vigencia_termino"
              name="vigencia_termino"
              type="date"
              className={DATA}
              defaultValue={termino ?? ""}
            />
          </div>
        </div>
      )}
    </div>
  )
}

function CategoriasCheck({
  categorias,
  marcadas = [],
}: {
  categorias: Opcao[]
  marcadas?: string[]
}) {
  if (categorias.length === 0) {
    return (
      <p className="text-muted-foreground text-xs">
        Nenhuma categoria cadastrada ainda — crie em “Categorias”.
      </p>
    )
  }
  return (
    <div className="flex flex-wrap gap-x-4 gap-y-2">
      {categorias.map((c) => (
        <label key={c.id} className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            name="categoria_id"
            value={c.id}
            defaultChecked={marcadas.includes(c.id)}
            className="size-4 accent-primary"
          />
          {c.nome ?? "(sem nome)"}
        </label>
      ))}
    </div>
  )
}

export function DocumentoForm({
  documento,
  categorias,
  aoCancelarHref,
}: {
  documento?: { id: string; documento: string | null; categoriaIds: string[] }
  categorias: Opcao[]
  aoCancelarHref: string
}) {
  const [estado, formAction, pendente] = useActionState(
    documento ? atualizarDocumentoAction : criarDocumentoAction,
    {}
  )
  const novo = !documento

  return (
    <form action={formAction} className="grid gap-4">
      {estado.erro && (
        <Alert variant="destructive">
          <AlertDescription>{estado.erro}</AlertDescription>
        </Alert>
      )}
      {documento && (
        <input type="hidden" name="documento_id" value={documento.id} />
      )}

      <div className="grid gap-1.5">
        <Label htmlFor="documento">Título do documento *</Label>
        <Input
          id="documento"
          name="documento"
          required
          defaultValue={documento?.documento ?? ""}
          placeholder="Ex.: Alvará da Sede Macaé"
        />
      </div>

      <fieldset className="grid gap-2">
        <legend className="text-sm font-medium">Categorias</legend>
        <CategoriasCheck
          categorias={categorias}
          marcadas={documento?.categoriaIds}
        />
      </fieldset>

      {novo && (
        <fieldset className="grid gap-3 rounded-md border p-3">
          <legend className="px-1 text-sm font-medium">
            Primeiro arquivo (opcional)
          </legend>
          <div className="grid gap-1.5">
            <Label htmlFor="versao_nome">Nome da versão</Label>
            <Input
              id="versao_nome"
              name="versao_nome"
              placeholder="Ex.: Emissão 2024"
            />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="arquivo">Arquivo (PDF, até 20 MB)</Label>
            <input
              id="arquivo"
              name="arquivo"
              type="file"
              accept="application/pdf"
              className="text-muted-foreground file:bg-muted file:text-foreground file:mr-3 file:rounded-md file:border-0 file:px-3 file:py-1.5 file:text-sm text-sm"
            />
          </div>
          <CamposVigencia />
        </fieldset>
      )}

      <div className="flex justify-end gap-2">
        <Button type="button" variant="outline" asChild>
          <a href={aoCancelarHref}>Cancelar</a>
        </Button>
        <Button type="submit" disabled={pendente}>
          {pendente && <Loader2 className="animate-spin" />}
          {novo ? "Criar documento" : "Salvar alterações"}
        </Button>
      </div>
    </form>
  )
}

export function NovaVersaoForm({ documentoId }: { documentoId: string }) {
  const [estado, formAction, pendente] = useActionState(criarVersaoAction, {})
  return (
    <form action={formAction} className="grid gap-4">
      {estado.erro && (
        <Alert variant="destructive">
          <AlertDescription>{estado.erro}</AlertDescription>
        </Alert>
      )}
      <input type="hidden" name="documento_id" value={documentoId} />
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="grid gap-1.5">
          <Label htmlFor="versao_nome">Nome da versão</Label>
          <Input
            id="versao_nome"
            name="versao_nome"
            placeholder="Ex.: Renovação 2026"
          />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="arquivo">Arquivo (PDF, até 20 MB) *</Label>
          <input
            id="arquivo"
            name="arquivo"
            type="file"
            accept="application/pdf"
            required
            className="text-muted-foreground file:bg-muted file:text-foreground file:mr-3 file:rounded-md file:border-0 file:px-3 file:py-1.5 file:text-sm text-sm"
          />
        </div>
      </div>
      <CamposVigencia />
      <div>
        <Button type="submit" disabled={pendente}>
          {pendente ? <Loader2 className="animate-spin" /> : <Upload />}
          Adicionar versão
        </Button>
      </div>
    </form>
  )
}

export function BotaoExcluirDocumento({ documentoId }: { documentoId: string }) {
  const [estado, formAction, pendente] = useActionState(
    excluirDocumentoAction,
    {}
  )
  return (
    <form
      action={formAction}
      className="inline-flex flex-col items-end gap-1"
      onSubmit={(e) => {
        if (
          !confirm(
            "Excluir este documento? Todas as versões e arquivos serão apagados."
          )
        ) {
          e.preventDefault()
        }
      }}
    >
      <input type="hidden" name="documento_id" value={documentoId} />
      <Button type="submit" variant="destructive" size="sm" disabled={pendente}>
        {pendente ? <Loader2 className="animate-spin" /> : <Trash2 />}
        Excluir
      </Button>
      {estado.erro && (
        <span className="text-destructive max-w-72 text-right text-xs">
          {estado.erro}
        </span>
      )}
    </form>
  )
}

export function BotaoExcluirVersao({
  versaoId,
  documentoId,
}: {
  versaoId: string
  documentoId: string
}) {
  const [estado, formAction, pendente] = useActionState(excluirVersaoAction, {})
  return (
    <form
      action={formAction}
      className="inline-flex items-center"
      onSubmit={(e) => {
        if (!confirm("Excluir esta versão e o arquivo?")) e.preventDefault()
      }}
    >
      <input type="hidden" name="versao_id" value={versaoId} />
      <input type="hidden" name="documento_id" value={documentoId} />
      {estado.erro && (
        <span className="text-destructive mr-1 text-xs">{estado.erro}</span>
      )}
      <Button
        type="submit"
        variant="ghost"
        size="sm"
        className="text-destructive hover:text-destructive h-7 px-2"
        disabled={pendente}
      >
        {pendente ? <Loader2 className="animate-spin" /> : <Trash2 />}
      </Button>
    </form>
  )
}
