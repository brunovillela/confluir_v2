"use client"

import { useActionState } from "react"
import { Loader2, Save } from "lucide-react"

import { Button } from "@/components/ui/button"
import { ErroNoCampo } from "@/components/ui/erro-no-campo"
import { Input } from "@/components/ui/input"

import { salvarOrcamentoAction } from "./actions"

const SELECT =
  "border-input bg-background text-foreground h-8 min-w-56 rounded-md border px-2 text-sm shadow-xs outline-none [color-scheme:light] dark:[color-scheme:dark]"

/** Define (ou zera) o orçamento anual de um centro de custo. */
export function OrcamentoForm({
  ano,
  centros,
  centroInicial,
  valorInicial,
}: {
  ano: number
  centros: { id: string; nome: string }[]
  centroInicial?: string
  valorInicial?: number
}) {
  const [estado, action, salvando] = useActionState(salvarOrcamentoAction, {})
  return (
    <form action={action} className="flex flex-wrap items-center gap-2">
      <ErroNoCampo estado={estado} />
      <input type="hidden" name="ano" value={ano} />
      {centroInicial ? (
        <input type="hidden" name="centro_custo_id" value={centroInicial} />
      ) : (
        <select name="centro_custo_id" defaultValue="" required className={SELECT} aria-label="Centro de custo">
          <option value="" disabled>
            Centro de custo…
          </option>
          {centros.map((c) => (
            <option key={c.id} value={c.id}>
              {c.nome}
            </option>
          ))}
        </select>
      )}
      <Input
        name="valor_anual"
        inputMode="decimal"
        placeholder="0,00"
        defaultValue={valorInicial ? valorInicial.toLocaleString("pt-BR", { minimumFractionDigits: 2 }) : ""}
        className="h-8 w-36 text-right"
        aria-label={`Orçamento anual de ${ano}`}
      />
      <Button type="submit" size="sm" variant="outline" disabled={salvando}>
        {salvando ? <Loader2 className="animate-spin" /> : <Save />}
        {centroInicial ? "Salvar" : "Adicionar"}
      </Button>
      {estado.erro && !estado.campo && <span className="text-destructive text-xs">{estado.erro}</span>}
      {estado.ok && <span className="text-success-fg text-xs">Salvo.</span>}
    </form>
  )
}
