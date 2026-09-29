"use client"

import { useActionState } from "react"
import { GitCompareArrows, Loader2 } from "lucide-react"

import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"

import { criarComparacaoAction } from "./actions"

const SELECT =
  "border-input bg-background text-foreground h-9 w-full rounded-md border px-3 text-sm shadow-xs outline-none [color-scheme:light] dark:[color-scheme:dark]"

export function NovaComparacaoForm({
  acordos,
  inicialA,
}: {
  acordos: { id: string; rotulo: string; clausulas: number }[]
  inicialA?: string
}) {
  const [estado, acao, pendente] = useActionState(criarComparacaoAction, {})
  const opcoes = acordos.map((a) => (
    <option key={a.id} value={a.id} disabled={a.clausulas === 0}>
      {a.rotulo} — {a.clausulas > 0 ? `${a.clausulas} cláusulas` : "sem cláusulas (extraia do PDF)"}
    </option>
  ))
  return (
    <form action={acao} className="grid gap-3">
      <div className="grid gap-3 md:grid-cols-2">
        <div className="grid gap-1.5">
          <Label htmlFor="acordo_a">A — base (o anterior, o vigente)</Label>
          <select id="acordo_a" name="acordo_a" required defaultValue={inicialA ?? ""} className={SELECT}>
            <option value="" disabled>
              Escolha…
            </option>
            {opcoes}
          </select>
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="acordo_b">B — comparado (o novo, a proposta, outra empresa)</Label>
          <select id="acordo_b" name="acordo_b" required defaultValue="" className={SELECT}>
            <option value="" disabled>
              Escolha…
            </option>
            {opcoes}
          </select>
        </div>
      </div>
      {estado.erro && (
        <Alert variant="destructive">
          <AlertDescription>{estado.erro}</AlertDescription>
        </Alert>
      )}
      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" disabled={pendente}>
          {pendente ? <Loader2 className="animate-spin" /> : <GitCompareArrows />}
          {pendente ? "Comparando…" : "Comparar"}
        </Button>
        {pendente && (
          <span className="text-muted-foreground text-xs">
            A IA analisa cada mudança — um acordo de 100 cláusulas leva até dois minutos.
          </span>
        )}
      </div>
    </form>
  )
}
