"use client"

import { useActionState } from "react"
import { Check, Loader2, Plus, Save, Trash2 } from "lucide-react"

import { FiliadoPicker } from "@/components/filiado-picker"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { type EstadoForm } from "@/lib/contas"

import {
  adicionarIntegranteAction,
  atualizarMandatoAction,
  criarGrupoAction,
  criarMandatoAction,
  removerGrupoAction,
  removerIntegranteAction,
} from "./actions"

const INPUT =
  "border-input bg-background text-foreground h-9 w-full rounded-md border px-3 text-sm shadow-xs outline-none [color-scheme:light] dark:[color-scheme:dark]"

export type MandatoFormDados = {
  id?: string
  mandato?: string | null
  dataInicio?: string | null
  dataTermino?: string | null
}

export function MandatoForm({
  edicao,
  dados,
}: {
  edicao?: boolean
  dados?: MandatoFormDados
}) {
  const [estado, formAction, pendente] = useActionState(
    edicao ? atualizarMandatoAction : criarMandatoAction,
    {}
  )

  return (
    <form action={formAction} className="grid gap-3 sm:grid-cols-[2fr_1fr_1fr_auto] sm:items-end">
      {dados?.id && <input type="hidden" name="mandato_id" value={dados.id} />}
      <div className="grid gap-1.5">
        <Label htmlFor="mandato">Mandato *</Label>
        <Input
          id="mandato"
          name="mandato"
          required
          defaultValue={dados?.mandato ?? ""}
          placeholder="2026–2029"
        />
      </div>
      <div className="grid gap-1.5">
        <Label htmlFor="data_inicio">Início</Label>
        <input
          id="data_inicio"
          name="data_inicio"
          type="date"
          defaultValue={dados?.dataInicio ?? ""}
          className={INPUT}
        />
      </div>
      <div className="grid gap-1.5">
        <Label htmlFor="data_termino">Término</Label>
        <input
          id="data_termino"
          name="data_termino"
          type="date"
          defaultValue={dados?.dataTermino ?? ""}
          className={INPUT}
        />
      </div>
      <Button type="submit" disabled={pendente}>
        {pendente ? (
          <Loader2 className="animate-spin" />
        ) : edicao ? (
          <Save />
        ) : (
          <Plus />
        )}
        {edicao ? "Salvar" : "Criar mandato"}
      </Button>
      {estado.erro && (
        <p className="text-destructive text-sm sm:col-span-4">{estado.erro}</p>
      )}
      {estado.ok && (
        <p className="text-success-fg flex items-center gap-1.5 text-sm sm:col-span-4">
          <Check className="size-4" />
          {estado.ok}
        </p>
      )}
    </form>
  )
}

export function AdicionarIntegrante({
  mandatoId,
  grupos,
}: {
  mandatoId: string
  grupos: { id: string; nome: string }[]
}) {
  const [estado, formAction, pendente] = useActionState<EstadoForm, FormData>(
    adicionarIntegranteAction,
    {}
  )

  return (
    <form action={formAction} className="grid gap-3">
      <input type="hidden" name="mandato_id" value={mandatoId} />

      <div className="grid gap-1.5">
        <Label>Pessoa (busque nos filiados)</Label>
        <FiliadoPicker
          endpoint="/painel/institucional/diretoria/busca-filiado"
          nome="filiacao_id"
          placeholder="Busque por nome, CPF ou matrícula"
        />
        <span className="text-muted-foreground text-xs">
          Vincula o diretor à pessoa (CPF) e cruza com filiado e usuário. Se não
          estiver na base, use o nome livre abaixo.
        </span>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="grid gap-1.5">
          <Label htmlFor="int-nome">Nome (se não vincular filiado)</Label>
          <Input id="int-nome" name="nome" placeholder="Nome do integrante" />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="int-cargo">Cargo</Label>
          <Input
            id="int-cargo"
            name="cargo"
            placeholder="Ex.: Coordenador do Depto. Administrativo"
          />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="int-grupo">Grupo</Label>
          <select id="int-grupo" name="grupo_id" defaultValue="" className={INPUT}>
            <option value="">(sem grupo)</option>
            {grupos.map((g) => (
              <option key={g.id} value={g.id}>
                {g.nome}
              </option>
            ))}
          </select>
        </div>
        <label className="flex items-center gap-2 pt-6 text-sm">
          <input
            type="checkbox"
            name="pode_assinar"
            value="1"
            defaultChecked
            className="size-4"
          />
          Assina ofícios
        </label>
      </div>

      {estado.erro && <p className="text-destructive text-sm">{estado.erro}</p>}
      <div>
        <Button type="submit" size="sm" disabled={pendente}>
          {pendente ? <Loader2 className="animate-spin" /> : <Plus />}
          Adicionar integrante
        </Button>
      </div>
    </form>
  )
}

export function GrupoForm({ mandatoId }: { mandatoId: string }) {
  const [estado, formAction, pendente] = useActionState<EstadoForm, FormData>(
    criarGrupoAction,
    {}
  )
  return (
    <form action={formAction} className="flex flex-wrap items-end gap-2">
      <input type="hidden" name="mandato_id" value={mandatoId} />
      <div className="grid gap-1.5">
        <Label htmlFor="grp-nome">Novo grupo</Label>
        <Input
          id="grp-nome"
          name="nome"
          required
          placeholder="Ex.: Diretoria Executiva"
          className="w-64"
        />
      </div>
      <Button type="submit" size="sm" variant="outline" disabled={pendente}>
        {pendente ? <Loader2 className="animate-spin" /> : <Plus />}
        Adicionar grupo
      </Button>
      {estado.erro && (
        <p className="text-destructive w-full text-sm">{estado.erro}</p>
      )}
    </form>
  )
}

export function RemoverGrupo({
  grupoId,
  mandatoId,
}: {
  grupoId: string
  mandatoId: string
}) {
  const [, formAction, pendente] = useActionState<EstadoForm, FormData>(
    removerGrupoAction,
    {}
  )
  return (
    <form
      action={formAction}
      onSubmit={(e) => {
        if (
          !confirm(
            "Remover este grupo? Os integrantes ficam sem grupo (não são apagados)."
          )
        )
          e.preventDefault()
      }}
      className="inline"
    >
      <input type="hidden" name="grupo_id" value={grupoId} />
      <input type="hidden" name="mandato_id" value={mandatoId} />
      <Button type="submit" variant="ghost" size="sm" disabled={pendente} aria-label="Remover grupo">
        {pendente ? (
          <Loader2 className="size-3 animate-spin" />
        ) : (
          <Trash2 className="text-destructive size-3.5" />
        )}
      </Button>
    </form>
  )
}

export function RemoverIntegrante({
  integranteId,
  mandatoId,
}: {
  integranteId: string
  mandatoId: string
}) {
  const [estado, formAction, pendente] = useActionState<EstadoForm, FormData>(
    removerIntegranteAction,
    {}
  )
  return (
    <form
      action={formAction}
      onSubmit={(e) => {
        if (!confirm("Remover este integrante do mandato?")) e.preventDefault()
      }}
    >
      <input type="hidden" name="integrante_id" value={integranteId} />
      <input type="hidden" name="mandato_id" value={mandatoId} />
      <Button
        type="submit"
        variant="ghost"
        size="sm"
        disabled={pendente}
        aria-label="Remover integrante"
      >
        {pendente ? (
          <Loader2 className="animate-spin" />
        ) : (
          <Trash2 className="text-destructive" />
        )}
      </Button>
      {estado.erro && <span className="text-destructive text-xs">{estado.erro}</span>}
    </form>
  )
}
