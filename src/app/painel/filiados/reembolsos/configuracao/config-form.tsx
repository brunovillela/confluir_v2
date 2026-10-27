"use client"

import { useActionState } from "react"
import { Loader2 } from "lucide-react"

import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import type { ConfigReembolsoCompleta } from "@/lib/db/filiacao-reembolsos-edicao"

import { salvarConfigAction } from "../actions"
import { useEnvioFormulario } from "@/hooks/use-envio-formulario"

export type OpcaoCentroCusto = { id: string; nome: string }

export function ConfigForm({
  config,
  centros,
}: {
  config: ConfigReembolsoCompleta
  centros: OpcaoCentroCusto[]
}) {
  const [estado, formAction, pendente] = useActionState(salvarConfigAction, {})
  const envio = useEnvioFormulario(formAction, estado)

  return (
    <form action={formAction} {...envio} className="grid gap-4">
      {estado.erro && (
        <Alert variant="destructive">
          <AlertDescription>{estado.erro}</AlertDescription>
        </Alert>
      )}
      {estado.ok && (
        <Alert>
          <AlertDescription>{estado.ok}</AlertDescription>
        </Alert>
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="grid gap-1.5">
          <Label htmlFor="centro_custo_id">Centro de custo</Label>
          <Select name="centro_custo_id" defaultValue={config.centroCustoId ?? "sem_centro"}>
            <SelectTrigger id="centro_custo_id" className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="sem_centro">Sem centro de custo</SelectItem>
              {centros.map((c) => (
                <SelectItem key={c.id} value={c.id}>
                  {c.nome}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <p className="text-muted-foreground text-xs">
            A ordem de pagamento nasce com este centro de custo de despesa.
          </p>
        </div>
      </div>

      <div className="flex justify-end">
        <Button type="submit" disabled={pendente}>
          {pendente && <Loader2 className="animate-spin" />}
          Salvar configuração
        </Button>
      </div>
    </form>
  )
}
