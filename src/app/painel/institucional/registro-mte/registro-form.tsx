"use client"

import { useActionState } from "react"
import { Loader2, Trash2 } from "lucide-react"

import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import type { RegistroDetalhe } from "@/lib/db/registro-mte"
import {
  SITUACOES_REGISTRO_MTE,
  TIPOS_REGISTRO_MTE,
} from "@/lib/registro-mte-constantes"

import {
  atualizarRegistroAction,
  criarRegistroAction,
  excluirRegistroAction,
} from "./actions"

const SELECT =
  "border-input bg-background text-foreground h-9 w-full truncate rounded-md border px-3 text-sm shadow-xs outline-none [color-scheme:light] dark:[color-scheme:dark]"
const DATA =
  "border-input bg-background text-foreground h-9 w-full rounded-md border px-3 text-sm shadow-xs outline-none [color-scheme:light] dark:[color-scheme:dark]"
const FILE =
  "border-input bg-background text-foreground w-full rounded-md border px-3 py-1.5 text-sm shadow-xs outline-none file:mr-3 file:rounded file:border-0 file:bg-muted file:px-2 file:py-1"

export function RegistroForm({
  registro,
  aoCancelarHref,
}: {
  registro?: RegistroDetalhe
  aoCancelarHref: string
}) {
  const [estado, formAction, pendente] = useActionState(
    registro ? atualizarRegistroAction : criarRegistroAction,
    {}
  )

  return (
    <form action={formAction} className="grid gap-5">
      {registro && (
        <input type="hidden" name="registro_id" value={registro.id} />
      )}
      {estado.erro && (
        <Alert variant="destructive">
          <AlertDescription>{estado.erro}</AlertDescription>
        </Alert>
      )}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="grid gap-1.5">
          <Label htmlFor="tipo">Tipo</Label>
          <select
            id="tipo"
            name="tipo"
            className={SELECT}
            defaultValue={registro?.tipo ?? "registro_sindical"}
          >
            {TIPOS_REGISTRO_MTE.map((t) => (
              <option key={t.chave} value={t.chave}>
                {t.rotulo}
              </option>
            ))}
          </select>
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="situacao">Situação</Label>
          <select
            id="situacao"
            name="situacao"
            className={SELECT}
            defaultValue={registro?.situacao ?? "ativo"}
          >
            {SITUACOES_REGISTRO_MTE.map((s) => (
              <option key={s.chave} value={s.chave}>
                {s.rotulo}
              </option>
            ))}
          </select>
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="numero">Nº do processo / registro</Label>
          <Input
            id="numero"
            name="numero"
            defaultValue={registro?.numero ?? ""}
          />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="categoria">Categoria representada</Label>
          <Input
            id="categoria"
            name="categoria"
            defaultValue={registro?.categoria ?? ""}
          />
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="grid gap-1.5">
          <Label htmlFor="data_registro">Data do registro</Label>
          <input
            id="data_registro"
            name="data_registro"
            type="date"
            className={DATA}
            defaultValue={registro?.data_registro?.slice(0, 10) ?? ""}
          />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="data_publicacao">Data de publicação (DOU)</Label>
          <input
            id="data_publicacao"
            name="data_publicacao"
            type="date"
            className={DATA}
            defaultValue={registro?.data_publicacao?.slice(0, 10) ?? ""}
          />
        </div>
      </div>

      <div className="grid gap-1.5">
        <Label htmlFor="abrangencia">Base territorial / abrangência</Label>
        <Textarea
          id="abrangencia"
          name="abrangencia"
          rows={2}
          placeholder="Municípios e categorias cobertos pelo registro."
          defaultValue={registro?.abrangencia ?? ""}
        />
      </div>

      <div className="grid gap-1.5">
        <Label htmlFor="observacoes">Observações</Label>
        <Textarea
          id="observacoes"
          name="observacoes"
          rows={2}
          defaultValue={registro?.observacoes ?? ""}
        />
      </div>

      <div className="grid gap-1.5">
        <Label htmlFor="documento">
          Documento (PDF{registro ? ", vazio mantém o atual" : ""})
        </Label>
        <input
          id="documento"
          name="documento"
          type="file"
          accept="application/pdf"
          className={FILE}
        />
      </div>

      <div className="flex gap-2">
        <Button type="submit" disabled={pendente}>
          {pendente && <Loader2 className="animate-spin" />}
          {registro ? "Salvar registro" : "Criar registro"}
        </Button>
        <Button type="button" variant="ghost" asChild>
          <a href={aoCancelarHref}>Cancelar</a>
        </Button>
      </div>
    </form>
  )
}

export function BotaoExcluirRegistro({ registroId }: { registroId: string }) {
  const [estado, formAction, pendente] = useActionState(
    excluirRegistroAction,
    {}
  )
  return (
    <form action={formAction}>
      <input type="hidden" name="registro_id" value={registroId} />
      {estado.erro && (
        <Alert variant="destructive" className="mb-2">
          <AlertDescription>{estado.erro}</AlertDescription>
        </Alert>
      )}
      <Button type="submit" variant="outline" size="sm" disabled={pendente}>
        {pendente ? (
          <Loader2 className="animate-spin" />
        ) : (
          <Trash2 className="text-destructive size-4" />
        )}
        Excluir
      </Button>
    </form>
  )
}
