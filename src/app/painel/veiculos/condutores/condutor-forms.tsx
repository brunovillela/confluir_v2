"use client"

import { useActionState } from "react"
import { Loader2, Save, UserCheck, UserX } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { CATEGORIAS_CNH } from "@/lib/veiculos-constantes"

import { definirAutorizacaoAction, salvarCondutorAction } from "./actions"

const SELECT =
  "border-input bg-background text-foreground h-9 w-full rounded-md border px-3 text-sm shadow-xs outline-none [color-scheme:light] dark:[color-scheme:dark]"

export type Opcao = { id: string; rotulo: string }

export function CondutorForm({
  usuarios,
  dados,
}: {
  usuarios: Opcao[]
  dados?: {
    usuario_id: string
    cnh_numero: string | null
    cnh_categoria: string | null
    cnh_validade: string | null
    observacao: string | null
  }
}) {
  const [estado, formAction, pendente] = useActionState(
    salvarCondutorAction,
    {}
  )
  return (
    <form action={formAction} className="grid max-w-2xl gap-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="grid gap-1.5">
          <Label htmlFor={`usuario-${dados?.usuario_id ?? "novo"}`}>
            Usuário *
          </Label>
          {dados ? (
            <input type="hidden" name="usuario_id" value={dados.usuario_id} />
          ) : null}
          <select
            id={`usuario-${dados?.usuario_id ?? "novo"}`}
            name={dados ? "usuario_id_visual" : "usuario_id"}
            required
            defaultValue={dados?.usuario_id ?? ""}
            disabled={Boolean(dados)}
            className={SELECT}
          >
            <option value="" disabled>
              Escolha o funcionário/diretor
            </option>
            {usuarios.map((u) => (
              <option key={u.id} value={u.id}>
                {u.rotulo}
              </option>
            ))}
          </select>
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor={`cnh_numero-${dados?.usuario_id ?? "novo"}`}>
            Nº da CNH
          </Label>
          <Input
            id={`cnh_numero-${dados?.usuario_id ?? "novo"}`}
            name="cnh_numero"
            defaultValue={dados?.cnh_numero ?? ""}
            className="tabular-nums"
          />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor={`cnh_categoria-${dados?.usuario_id ?? "novo"}`}>
            Categoria
          </Label>
          <select
            id={`cnh_categoria-${dados?.usuario_id ?? "novo"}`}
            name="cnh_categoria"
            defaultValue={dados?.cnh_categoria ?? ""}
            className={SELECT}
          >
            <option value="">(não informada)</option>
            {CATEGORIAS_CNH.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor={`cnh_validade-${dados?.usuario_id ?? "novo"}`}>
            Validade da CNH
          </Label>
          <Input
            id={`cnh_validade-${dados?.usuario_id ?? "novo"}`}
            name="cnh_validade"
            type="date"
            defaultValue={dados?.cnh_validade ?? ""}
            className="[color-scheme:light] dark:[color-scheme:dark]"
          />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor={`cnh_arquivo-${dados?.usuario_id ?? "novo"}`}>
            CNH digitalizada (PDF/JPG/PNG)
          </Label>
          <Input
            id={`cnh_arquivo-${dados?.usuario_id ?? "novo"}`}
            name="cnh_arquivo"
            type="file"
            accept="application/pdf,image/jpeg,image/png"
          />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor={`observacao-${dados?.usuario_id ?? "novo"}`}>
            Observação
          </Label>
          <Input
            id={`observacao-${dados?.usuario_id ?? "novo"}`}
            name="observacao"
            defaultValue={dados?.observacao ?? ""}
          />
        </div>
      </div>
      {estado.erro && <p className="text-destructive text-sm">{estado.erro}</p>}
      <div>
        <Button type="submit" disabled={pendente}>
          {pendente ? <Loader2 className="animate-spin" /> : <Save />}
          {dados ? "Atualizar cadastro" : "Cadastrar condutor"}
        </Button>
      </div>
    </form>
  )
}

export function AutorizacaoForm({
  condutorId,
  autorizado,
  nome,
}: {
  condutorId: string
  autorizado: boolean
  nome: string
}) {
  const [estado, formAction, pendente] = useActionState(
    definirAutorizacaoAction,
    {}
  )
  return (
    <form
      action={formAction}
      className="inline-flex flex-col items-end gap-1"
      onSubmit={(e) => {
        if (
          !confirm(
            autorizado
              ? `Retirar a autorização de ${nome} para dirigir?`
              : `Autorizar ${nome} a dirigir os veículos do sindicato?`
          )
        ) {
          e.preventDefault()
        }
      }}
    >
      <input type="hidden" name="condutor_id" value={condutorId} />
      <input type="hidden" name="autorizado" value={autorizado ? "0" : "1"} />
      <Button
        type="submit"
        variant={autorizado ? "outline" : "default"}
        size="sm"
        disabled={pendente}
      >
        {pendente ? (
          <Loader2 className="animate-spin" />
        ) : autorizado ? (
          <UserX />
        ) : (
          <UserCheck />
        )}
        {autorizado ? "Desautorizar" : "Autorizar"}
      </Button>
      {estado.erro && (
        <span className="text-destructive text-xs">{estado.erro}</span>
      )}
    </form>
  )
}
