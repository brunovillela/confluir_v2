"use client"

import { useActionState } from "react"
import { Loader2, Save } from "lucide-react"

import { Button } from "@/components/ui/button"
import { MOTIVOS_DESFILIACAO } from "@/lib/churn-constantes"
import { type EstadoForm } from "@/lib/contas"

import { definirMotivoDesfiliacaoAction } from "./actions"

const SELECT =
  "border-input bg-background text-foreground h-9 rounded-md border px-2 text-sm shadow-xs outline-none [color-scheme:light] dark:[color-scheme:dark]"

/** Select + salvar numa linha: a lista "sem motivo" do churn (o motivo é do vínculo da última saída). */
export function MotivoDesfiliacaoForm({ vinculoId, motivo, compacto = false }: { vinculoId: string; motivo: string | null; compacto?: boolean }) {
  const [estado, action, salvando] = useActionState<EstadoForm, FormData>(definirMotivoDesfiliacaoAction, {})
  return (
    <form action={action} className="flex flex-wrap items-center gap-2">
      <input type="hidden" name="vinculo_id" value={vinculoId} />
      <select name="motivo" defaultValue={motivo ?? ""} className={SELECT} aria-label="Motivo da desfiliação">
        <option value="">{compacto ? "Motivo…" : "Motivo da desfiliação…"}</option>
        {MOTIVOS_DESFILIACAO.map((m) => (
          <option key={m.chave} value={m.chave}>
            {m.rotulo}
          </option>
        ))}
      </select>
      <Button type="submit" size="sm" variant="outline" disabled={salvando}>
        {salvando ? <Loader2 className="animate-spin" /> : <Save />}
        {compacto ? "" : "Salvar"}
      </Button>
      {estado.erro && <span className="text-destructive text-xs">{estado.erro}</span>}
      {estado.ok && <span className="text-success-fg text-xs">{estado.ok}</span>}
    </form>
  )
}
