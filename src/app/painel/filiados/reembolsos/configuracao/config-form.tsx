"use client"

import { useActionState } from "react"
import { Loader2 } from "lucide-react"

import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Switch } from "@/components/ui/switch"
import type { ConfigReembolsoCompleta } from "@/lib/db/filiacao-reembolsos-edicao"

import { salvarConfigAction } from "../actions"

export type OpcaoCentroCusto = { id: string; nome: string }

export function ConfigForm({
  config,
  centros,
}: {
  config: ConfigReembolsoCompleta
  centros: OpcaoCentroCusto[]
}) {
  const [estado, formAction, pendente] = useActionState(salvarConfigAction, {})
  const moeda = (v: number | null) => (v != null ? v.toFixed(2).replace(".", ",") : "")

  return (
    <form action={formAction} className="grid gap-4">
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
          <Label htmlFor="valor_reembolso">Valor de cada reembolso *</Label>
          <Input
            id="valor_reembolso"
            name="valor_reembolso"
            inputMode="decimal"
            defaultValue={moeda(config.valorReembolso)}
            placeholder="35,00"
            required
          />
          <p className="text-muted-foreground text-xs">
            Vem preenchido em cada lançamento; pode ser alterado caso a caso.
          </p>
        </div>

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

        <label className="flex items-center gap-2 text-sm sm:col-span-2">
          <Switch name="orcamento_limite" defaultChecked={config.orcamentoLimite} />
          Recusar lançamentos que ultrapassem o teto mensal
        </label>

        <div className="grid gap-1.5">
          <Label htmlFor="orcamento_mensal">Orçamento mensal</Label>
          <Input
            id="orcamento_mensal"
            name="orcamento_mensal"
            inputMode="decimal"
            defaultValue={moeda(config.orcamentoMensal)}
            placeholder="25.000,00"
          />
          <p className="text-muted-foreground text-xs">
            Soma dos reembolsos lançados no mês. Só vale com o teto ligado.
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
