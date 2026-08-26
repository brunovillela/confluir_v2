"use client"

import { useActionState } from "react"
import { Loader2 } from "lucide-react"

import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { TIPOS_BENEFICIARIO_SUGERIDO } from "@/lib/custeio-constantes"
import type { FinalidadeLinha } from "@/lib/db/custeio"

import { salvarFinalidadeAction } from "../actions"

const SELECT =
  "border-input bg-background text-foreground h-9 w-full truncate rounded-md border px-3 text-sm shadow-xs outline-none [color-scheme:light] dark:[color-scheme:dark]"

export function FinalidadeForm({
  finalidade,
  centrosCusto,
  aoCancelarHref,
}: {
  finalidade?: FinalidadeLinha
  centrosCusto: { id: string; nome: string }[]
  aoCancelarHref: string
}) {
  const [estado, formAction, pendente] = useActionState(
    salvarFinalidadeAction,
    {}
  )

  return (
    <form action={formAction} className="grid gap-4">
      {finalidade && (
        <input type="hidden" name="finalidade_id" value={finalidade.id} />
      )}
      {estado.erro && (
        <Alert variant="destructive">
          <AlertDescription>{estado.erro}</AlertDescription>
        </Alert>
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="grid gap-1.5">
          <Label htmlFor="nome">Nome</Label>
          <Input id="nome" name="nome" defaultValue={finalidade?.nome ?? ""} />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="tipo_beneficiario_sugerido">
            Tipo de beneficiário sugerido
          </Label>
          <select
            id="tipo_beneficiario_sugerido"
            name="tipo_beneficiario_sugerido"
            className={SELECT}
            defaultValue={finalidade?.tipo_beneficiario_sugerido ?? "livre"}
          >
            {TIPOS_BENEFICIARIO_SUGERIDO.map((t) => (
              <option key={t.chave} value={t.chave}>
                {t.rotulo}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="grid gap-1.5">
        <Label htmlFor="descricao">Descrição (opcional)</Label>
        <Textarea
          id="descricao"
          name="descricao"
          rows={2}
          defaultValue={finalidade?.descricao ?? ""}
        />
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="grid gap-1.5">
          <Label htmlFor="centro_custo_despesa_id">
            Centro de custo padrão
          </Label>
          <select
            id="centro_custo_despesa_id"
            name="centro_custo_despesa_id"
            className={SELECT}
            defaultValue={finalidade?.centro_custo_despesa_id ?? ""}
          >
            <option value="">Sem padrão</option>
            {centrosCusto.map((c) => (
              <option key={c.id} value={c.id}>
                {c.nome}
              </option>
            ))}
          </select>
          <p className="text-muted-foreground text-xs">
            Cada custeio desta finalidade herda este centro na ordem de
            pagamento.
          </p>
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="ordem">Ordem de exibição</Label>
          <Input
            id="ordem"
            name="ordem"
            type="number"
            defaultValue={finalidade?.ordem ?? 0}
          />
        </div>
      </div>

      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          name="ativa"
          defaultChecked={finalidade ? finalidade.ativa : true}
        />
        Finalidade ativa (aparece ao criar custeios)
      </label>

      <div className="flex gap-2">
        <Button type="submit" disabled={pendente}>
          {pendente && <Loader2 className="animate-spin" />}
          {finalidade ? "Salvar finalidade" : "Criar finalidade"}
        </Button>
        <Button type="button" variant="ghost" asChild>
          <a href={aoCancelarHref}>Cancelar</a>
        </Button>
      </div>
    </form>
  )
}
