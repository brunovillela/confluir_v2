"use client"

import { useActionState } from "react"
import { Loader2, Save, Trash2 } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import type { Profissional, TipoAtendimento } from "@/lib/db/atendimentos"

import {
  excluirTipoAction,
  salvarProfissionalAction,
  salvarTipoAction,
} from "./actions"

const SELECT =
  "border-input bg-background text-foreground h-9 w-full rounded-md border px-3 text-sm shadow-xs outline-none [color-scheme:light] dark:[color-scheme:dark]"

export function TipoForm({ tipo }: { tipo?: TipoAtendimento }) {
  const [estado, formAction, pendente] = useActionState(salvarTipoAction, {})
  return (
    <form action={formAction} className="flex flex-wrap items-end gap-2">
      {tipo && <input type="hidden" name="id" value={tipo.id} />}
      <div className="grid flex-1 gap-1.5" style={{ minWidth: "16rem" }}>
        <Label htmlFor={`nome-${tipo?.id ?? "novo"}`}>
          {tipo ? "Nome do tipo" : "Novo tipo de atendimento"}
        </Label>
        <Input
          id={`nome-${tipo?.id ?? "novo"}`}
          name="nome"
          defaultValue={tipo?.nome ?? ""}
          placeholder="Médico do trabalho, Psicologia, Serviço social…"
          required
        />
      </div>
      <Button type="submit" variant={tipo ? "outline" : "default"} disabled={pendente}>
        {pendente ? <Loader2 className="animate-spin" /> : <Save />}
        Salvar
      </Button>
      {estado.erro && (
        <p className="text-destructive w-full text-sm">{estado.erro}</p>
      )}
    </form>
  )
}

export function ExcluirTipoForm({ id }: { id: string }) {
  const [estado, formAction, pendente] = useActionState(excluirTipoAction, {})
  return (
    <form action={formAction}>
      <input type="hidden" name="id" value={id} />
      <Button
        type="submit"
        variant="ghost"
        size="sm"
        disabled={pendente}
        title="Excluir tipo"
      >
        {pendente ? <Loader2 className="animate-spin" /> : <Trash2 />}
      </Button>
      {estado.erro && (
        <p className="text-destructive mt-1 text-xs">{estado.erro}</p>
      )}
    </form>
  )
}

export function ProfissionalForm({
  profissional,
  tipos,
  usuarios,
}: {
  profissional?: Profissional
  tipos: TipoAtendimento[]
  usuarios: { id: string; nome: string }[]
}) {
  const [estado, formAction, pendente] = useActionState(
    salvarProfissionalAction,
    {}
  )
  return (
    <form action={formAction} className="grid max-w-3xl gap-4">
      {profissional && <input type="hidden" name="id" value={profissional.id} />}

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="grid gap-1.5">
          <Label htmlFor="usuario_id">Pessoa *</Label>
          <select
            id="usuario_id"
            name="usuario_id"
            required
            defaultValue={profissional?.usuario_id ?? ""}
            className={SELECT}
          >
            <option value="" disabled>
              Escolha o usuário
            </option>
            {usuarios.map((u) => (
              <option key={u.id} value={u.id}>
                {u.nome}
              </option>
            ))}
          </select>
        </div>

        <div className="grid gap-1.5">
          <Label htmlFor="tipo_id">Tipo de atendimento</Label>
          <select
            id="tipo_id"
            name="tipo_id"
            defaultValue={profissional?.tipo_id ?? ""}
            className={SELECT}
          >
            <option value="">— nenhum —</option>
            {tipos.map((t) => (
              <option key={t.id} value={t.id}>
                {t.nome}
              </option>
            ))}
          </select>
          <p className="text-muted-foreground text-xs">
            Define quais relatórios esta pessoa lê: só os deste mesmo tipo.
          </p>
        </div>

        <div className="grid gap-1.5">
          <Label htmlFor="profissao">Profissão *</Label>
          <Input
            id="profissao"
            name="profissao"
            required
            defaultValue={profissional?.profissao ?? ""}
            placeholder="Médica do trabalho"
          />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="grid gap-1.5">
            <Label htmlFor="conselho_classe">Conselho</Label>
            <Input
              id="conselho_classe"
              name="conselho_classe"
              defaultValue={profissional?.conselho_classe ?? ""}
              placeholder="CRM"
            />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="registro_conselho">Registro</Label>
            <Input
              id="registro_conselho"
              name="registro_conselho"
              defaultValue={profissional?.registro_conselho ?? ""}
              placeholder="52707074"
              className="tabular-nums"
            />
          </div>
        </div>
      </div>

      <div className="grid gap-3 rounded-md border p-3">
        <label className="flex items-start gap-2 text-sm">
          <input
            type="checkbox"
            name="acesso_todos_tipos"
            defaultChecked={profissional?.acesso_todos_tipos}
            className="mt-0.5"
          />
          <span>
            <strong>Coordenação clínica</strong> — lê relatórios de todos os
            tipos
            <span className="text-muted-foreground block text-xs">
              Conceder apenas a profissional habilitado. É a única forma de
              atravessar tipos, e cada leitura fica registrada.
            </span>
          </span>
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            name="inativo"
            defaultChecked={profissional?.inativo}
          />
          <span>
            Inativo
            <span className="text-muted-foreground ml-1 text-xs">
              — deixa de ler relatórios imediatamente
            </span>
          </span>
        </label>
      </div>

      {estado.erro && <p className="text-destructive text-sm">{estado.erro}</p>}

      <div>
        <Button type="submit" disabled={pendente}>
          {pendente ? <Loader2 className="animate-spin" /> : <Save />}
          {profissional ? "Salvar alterações" : "Cadastrar profissional"}
        </Button>
      </div>
    </form>
  )
}
