"use client"

import { useActionState } from "react"
import { Loader2, Trash2 } from "lucide-react"

import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { TIPOS_REUNIAO } from "@/lib/atas-constantes"
import type { AtaDetalhe } from "@/lib/db/atas"

import {
  atualizarAtaAction,
  criarAtaAction,
  excluirAtaAction,
} from "./actions"

const SELECT =
  "border-input bg-background text-foreground h-9 w-full truncate rounded-md border px-3 text-sm shadow-xs outline-none [color-scheme:light] dark:[color-scheme:dark]"
const DATA =
  "border-input bg-background text-foreground h-9 w-full rounded-md border px-3 text-sm shadow-xs outline-none [color-scheme:light] dark:[color-scheme:dark]"
const FILE =
  "border-input bg-background text-foreground w-full rounded-md border px-3 py-1.5 text-sm shadow-xs outline-none file:mr-3 file:rounded file:border-0 file:bg-muted file:px-2 file:py-1"

export function AtaForm({
  ata,
  mandatos,
  mandatoPadrao,
  aoCancelarHref,
}: {
  ata?: AtaDetalhe
  mandatos: { id: string; nome: string }[]
  mandatoPadrao?: string
  aoCancelarHref: string
}) {
  const [estado, formAction, pendente] = useActionState(
    ata ? atualizarAtaAction : criarAtaAction,
    {}
  )
  const mandatoDefault = ata?.mandatoId ?? mandatoPadrao ?? ""

  return (
    <form action={formAction} className="grid gap-5">
      {ata && <input type="hidden" name="ata_id" value={ata.id} />}
      {estado.erro && (
        <Alert variant="destructive">
          <AlertDescription>{estado.erro}</AlertDescription>
        </Alert>
      )}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="grid gap-1.5">
          <Label htmlFor="mandato_id">Mandato</Label>
          <select
            id="mandato_id"
            name="mandato_id"
            className={SELECT}
            defaultValue={mandatoDefault}
          >
            <option value="">(sem mandato)</option>
            {mandatos.map((m) => (
              <option key={m.id} value={m.id}>
                {m.nome}
              </option>
            ))}
          </select>
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="tipo">Tipo de reunião</Label>
          <select
            id="tipo"
            name="tipo"
            className={SELECT}
            defaultValue={ata?.tipo ?? "diretoria"}
          >
            {TIPOS_REUNIAO.map((t) => (
              <option key={t.chave} value={t.chave}>
                {t.rotulo}
              </option>
            ))}
          </select>
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="orgao">Órgão (quando o tipo for outra)</Label>
          <Input id="orgao" name="orgao" defaultValue={ata?.orgao ?? ""} />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="data">Data</Label>
          <input
            id="data"
            name="data"
            type="date"
            className={DATA}
            defaultValue={ata?.data?.slice(0, 10) ?? ""}
          />
        </div>
      </div>

      <div className="grid gap-1.5">
        <Label htmlFor="titulo">Título</Label>
        <Input
          id="titulo"
          name="titulo"
          defaultValue={ata?.titulo ?? ""}
          placeholder="Ex.: Reunião ordinária — julho/2025"
        />
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="grid gap-1.5">
          <Label htmlFor="hora">Hora</Label>
          <Input id="hora" name="hora" defaultValue={ata?.hora ?? ""} placeholder="Ex.: 14h00" />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="local">Local</Label>
          <Input id="local" name="local" defaultValue={ata?.local ?? ""} />
        </div>
      </div>

      <div className="grid gap-1.5">
        <Label htmlFor="pauta">Pauta</Label>
        <Textarea id="pauta" name="pauta" rows={3} defaultValue={ata?.pauta ?? ""} />
      </div>

      <div className="grid gap-1.5">
        <Label htmlFor="deliberacoes">Deliberações / decisões</Label>
        <Textarea
          id="deliberacoes"
          name="deliberacoes"
          rows={4}
          defaultValue={ata?.deliberacoes ?? ""}
        />
      </div>

      <div className="grid gap-1.5">
        <Label htmlFor="presentes">Presentes</Label>
        <Textarea
          id="presentes"
          name="presentes"
          rows={3}
          placeholder="Um nome por linha."
          defaultValue={ata?.presentes ?? ""}
        />
      </div>

      <div className="grid gap-1.5">
        <Label htmlFor="observacoes">Observações</Label>
        <Textarea
          id="observacoes"
          name="observacoes"
          rows={2}
          defaultValue={ata?.observacoes ?? ""}
        />
      </div>

      <div className="grid gap-1.5">
        <Label htmlFor="documento">
          Ata em PDF{ata ? " (vazio mantém o atual)" : ""}
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
          {ata ? "Salvar ata" : "Criar ata"}
        </Button>
        <Button type="button" variant="ghost" asChild>
          <a href={aoCancelarHref}>Cancelar</a>
        </Button>
      </div>
    </form>
  )
}

export function BotaoExcluirAta({
  ataId,
  mandatoId,
}: {
  ataId: string
  mandatoId: string | null
}) {
  const [estado, formAction, pendente] = useActionState(excluirAtaAction, {})
  return (
    <form action={formAction}>
      <input type="hidden" name="ata_id" value={ataId} />
      {mandatoId && <input type="hidden" name="mandato_id" value={mandatoId} />}
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
