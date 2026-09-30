"use client"

import { useActionState } from "react"
import { Loader2, Save } from "lucide-react"

import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"

import { salvarCentroCaixaAction } from "./config-actions"

const SELECT =
  "border-input bg-background text-foreground h-9 w-full truncate rounded-md border px-3 text-sm shadow-xs outline-none [color-scheme:light] dark:[color-scheme:dark]"

/** Centro de custo do DÉBITO das compras pagas em dinheiro (conta do caixa). */
export function ConfigCaixaForm({
  atual,
  centros,
}: {
  atual: string | null
  centros: { id: string; rotulo: string }[]
}) {
  const [estado, acao, pendente] = useActionState(salvarCentroCaixaAction, {})
  return (
    <form action={acao} className="grid gap-3">
      {estado.erro && (
        <Alert variant="destructive">
          <AlertDescription>{estado.erro}</AlertDescription>
        </Alert>
      )}
      {estado.ok && (
        <Alert variant="success">
          <AlertDescription>{estado.ok}</AlertDescription>
        </Alert>
      )}
      <div className="flex flex-wrap items-end gap-3">
        <div className="grid min-w-0 flex-1 gap-1.5 sm:max-w-md">
          <Label htmlFor="centro_custo_caixa_id">Centro de custo do caixa (débito)</Label>
          <select
            id="centro_custo_caixa_id"
            name="centro_custo_caixa_id"
            defaultValue={atual ?? ""}
            className={SELECT}
          >
            <option value="">Não definido</option>
            {centros.map((c) => (
              <option key={c.id} value={c.id}>
                {c.rotulo}
              </option>
            ))}
          </select>
        </div>
        <Button type="submit" variant="outline" disabled={pendente}>
          {pendente ? <Loader2 className="animate-spin" /> : <Save />}
          Salvar
        </Button>
      </div>
      <p className="text-muted-foreground text-xs">
        Uma compra paga em dinheiro sai do caixa no ato. Quando a ordem dela é
        autorizada, o sistema a dá como paga pelo caixa, com este centro de
        custo no débito (ex.: Caixa Movimento) — nada sai do banco.
      </p>
    </form>
  )
}
