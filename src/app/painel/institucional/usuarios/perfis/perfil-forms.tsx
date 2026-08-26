"use client"

import { useActionState } from "react"
import { Check, Loader2, Save, Trash2 } from "lucide-react"

import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { type EstadoForm } from "@/lib/contas"
import { CATALOGO_PERMISSOES } from "@/lib/permissoes-catalogo"

import {
  excluirPerfilAction,
  salvarChavesPerfilAction,
  salvarPerfilAction,
} from "./actions"

export type PerfilDados = {
  id?: string
  nome: string
  descricao: string | null
  alcada_aprovacao: number | null
  ativo: boolean
  padrao_onboarding: boolean
}

export function PerfilForm({ perfil }: { perfil?: PerfilDados }) {
  const [estado, formAction, pendente] = useActionState<EstadoForm, FormData>(
    salvarPerfilAction,
    {}
  )

  return (
    <form action={formAction} className="grid max-w-xl gap-4">
      {perfil?.id && (
        <input type="hidden" name="perfil_id" value={perfil.id} />
      )}

      <div className="grid gap-1.5">
        <Label htmlFor="nome">Nome do perfil</Label>
        <Input
          id="nome"
          name="nome"
          required
          defaultValue={perfil?.nome ?? ""}
          placeholder="Ex.: Financeiro / Tesouraria"
        />
      </div>

      <div className="grid gap-1.5">
        <Label htmlFor="descricao">Descrição</Label>
        <Input
          id="descricao"
          name="descricao"
          defaultValue={perfil?.descricao ?? ""}
          placeholder="Para quem é e o que abrange"
        />
      </div>

      <div className="grid gap-1.5 sm:max-w-xs">
        <Label htmlFor="alcada_aprovacao">Alçada de aprovação (R$)</Label>
        <Input
          id="alcada_aprovacao"
          name="alcada_aprovacao"
          type="number"
          min={0}
          step="0.01"
          defaultValue={perfil?.alcada_aprovacao ?? ""}
          className="tabular-nums"
        />
        <span className="text-muted-foreground text-xs">
          Teto que o perfil pode aprovar. Vazio = sem teto (perfis de comando).
        </span>
      </div>

      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          name="ativo"
          value="1"
          defaultChecked={perfil?.ativo ?? true}
          className="size-4 shrink-0"
        />
        Perfil ativo (disponível para atribuição)
      </label>

      <label className="flex items-start gap-2 text-sm">
        <input
          type="checkbox"
          name="padrao_onboarding"
          value="1"
          defaultChecked={perfil?.padrao_onboarding ?? false}
          className="mt-0.5 size-4 shrink-0"
        />
        <span>
          Perfil padrão no convite (onboarding)
          <span className="text-muted-foreground block text-xs">
            Novos usuários convidados em lote recebem este perfil. Só um por
            organização — marcar aqui desmarca o anterior.
          </span>
        </span>
      </label>

      {estado.erro && <p className="text-destructive text-sm">{estado.erro}</p>}
      {estado.ok && (
        <p className="text-success-fg flex items-center gap-1.5 text-sm">
          <Check className="size-4" />
          {estado.ok}
        </p>
      )}

      <div>
        <Button type="submit" size="sm" disabled={pendente}>
          {pendente ? <Loader2 className="animate-spin" /> : <Save />}
          {perfil?.id ? "Salvar dados" : "Criar perfil"}
        </Button>
      </div>
    </form>
  )
}

export function ChavesEditor({
  perfilId,
  chaves,
  concedeTudo,
}: {
  perfilId: string
  chaves: string[]
  concedeTudo: boolean
}) {
  const [estado, formAction, pendente] = useActionState<EstadoForm, FormData>(
    salvarChavesPerfilAction,
    {}
  )
  const marcadas = new Set(chaves)

  if (concedeTudo) {
    return (
      <Alert>
        <AlertDescription>
          Este perfil concede <strong>todas</strong> as permissões
          (administrador). A lista de chaves não se aplica.
        </AlertDescription>
      </Alert>
    )
  }

  return (
    <form action={formAction} className="grid gap-5">
      <input type="hidden" name="perfil_id" value={perfilId} />

      <div className="grid gap-4">
        {CATALOGO_PERMISSOES.map((area) => (
          <div key={area.area} className="rounded-lg border p-4">
            <p className="mb-3 text-sm font-semibold">{area.area}</p>
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {area.flags.map((f) => (
                <label key={f.chave} className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    name="chave"
                    value={f.chave}
                    defaultChecked={marcadas.has(f.chave)}
                    className="size-4 shrink-0"
                  />
                  {f.rotulo}
                </label>
              ))}
            </div>
          </div>
        ))}
      </div>

      {estado.erro && <p className="text-destructive text-sm">{estado.erro}</p>}
      {estado.ok && (
        <p className="text-success-fg flex items-center gap-1.5 text-sm">
          <Check className="size-4" />
          {estado.ok}
        </p>
      )}

      <div className="bg-background/80 sticky bottom-0 border-t py-3 backdrop-blur">
        <Button type="submit" disabled={pendente}>
          {pendente ? <Loader2 className="animate-spin" /> : <Save />}
          Salvar permissões do perfil
        </Button>
      </div>
    </form>
  )
}

export function ExcluirPerfil({ perfilId }: { perfilId: string }) {
  const [estado, formAction, pendente] = useActionState<EstadoForm, FormData>(
    excluirPerfilAction,
    {}
  )
  return (
    <form
      action={formAction}
      onSubmit={(e) => {
        if (!confirm("Excluir este perfil? Quem o tiver perde essas permissões."))
          e.preventDefault()
      }}
    >
      <input type="hidden" name="perfil_id" value={perfilId} />
      <Button type="submit" variant="outline" size="sm" disabled={pendente}>
        {pendente ? (
          <Loader2 className="animate-spin" />
        ) : (
          <Trash2 className="text-destructive" />
        )}
        Excluir perfil
      </Button>
      {estado.erro && (
        <span className="text-destructive ml-2 text-xs">{estado.erro}</span>
      )}
    </form>
  )
}
