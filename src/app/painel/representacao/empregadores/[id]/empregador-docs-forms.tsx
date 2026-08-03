"use client"

import { useActionState } from "react"
import { Loader2, Plus, Trash2 } from "lucide-react"

import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { TIPOS_DOC_REPRESENTACAO } from "@/lib/representacao-docs-constantes"

import {
  adicionarDocumentoAction,
  excluirDocumentoAction,
} from "./docs-actions"

const SELECT =
  "border-input bg-background text-foreground h-9 w-full truncate rounded-md border px-3 text-sm shadow-xs outline-none [color-scheme:light] dark:[color-scheme:dark]"
const DATA =
  "border-input bg-background text-foreground h-9 w-full rounded-md border px-3 text-sm shadow-xs outline-none [color-scheme:light] dark:[color-scheme:dark]"
const FILE =
  "border-input bg-background text-foreground w-full rounded-md border px-3 py-1.5 text-sm shadow-xs outline-none file:mr-3 file:rounded file:border-0 file:bg-muted file:px-2 file:py-1"

export function AdicionarDocumento({ empresaId }: { empresaId: string }) {
  const [estado, formAction, pendente] = useActionState(
    adicionarDocumentoAction,
    {}
  )
  return (
    <form action={formAction} className="grid gap-3 rounded-md border p-3">
      <input type="hidden" name="empresa_id" value={empresaId} />
      {estado.erro && (
        <Alert variant="destructive">
          <AlertDescription>{estado.erro}</AlertDescription>
        </Alert>
      )}
      <div className="grid gap-3 sm:grid-cols-[1fr_10rem_8rem]">
        <div className="grid gap-1.5">
          <Label htmlFor="doc_titulo">Título</Label>
          <Input id="doc_titulo" name="titulo" required />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="doc_tipo">Tipo</Label>
          <select id="doc_tipo" name="tipo" className={SELECT} defaultValue="outro">
            {TIPOS_DOC_REPRESENTACAO.map((t) => (
              <option key={t.chave} value={t.chave}>
                {t.rotulo}
              </option>
            ))}
          </select>
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="doc_numero">Nº</Label>
          <Input id="doc_numero" name="numero" />
        </div>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="grid gap-1.5">
          <Label htmlFor="doc_data">Data do documento</Label>
          <input id="doc_data" name="data_documento" type="date" className={DATA} />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="doc_vigencia">Vigência até (opcional)</Label>
          <input id="doc_vigencia" name="vigencia_fim" type="date" className={DATA} />
        </div>
      </div>
      <div className="grid gap-1.5">
        <Label htmlFor="doc_obs">Observações</Label>
        <Textarea id="doc_obs" name="observacoes" rows={2} />
      </div>
      <div className="grid gap-1.5">
        <Label htmlFor="doc_arquivo">Arquivo (PDF)</Label>
        <input
          id="doc_arquivo"
          name="arquivo"
          type="file"
          accept="application/pdf"
          className={FILE}
        />
      </div>
      <div>
        <Button type="submit" size="sm" disabled={pendente}>
          {pendente ? <Loader2 className="animate-spin" /> : <Plus />}
          Adicionar documento
        </Button>
      </div>
    </form>
  )
}

export function BotaoExcluirDocumento({
  documentoId,
  empresaId,
}: {
  documentoId: string
  empresaId: string
}) {
  const [, formAction, pendente] = useActionState(excluirDocumentoAction, {})
  return (
    <form action={formAction}>
      <input type="hidden" name="documento_id" value={documentoId} />
      <input type="hidden" name="empresa_id" value={empresaId} />
      <Button
        type="submit"
        variant="ghost"
        size="sm"
        disabled={pendente}
        aria-label="Remover documento"
      >
        {pendente ? (
          <Loader2 className="animate-spin" />
        ) : (
          <Trash2 className="text-destructive size-4" />
        )}
      </Button>
    </form>
  )
}
