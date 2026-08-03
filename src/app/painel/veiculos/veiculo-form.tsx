"use client"

import { useActionState } from "react"
import { Loader2, Save } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { type EstadoForm } from "@/lib/contas"
import { COMBUSTIVEIS_VEICULO } from "@/lib/veiculos-constantes"

const SELECT =
  "border-input bg-background text-foreground h-9 w-full rounded-md border px-3 text-sm shadow-xs outline-none [color-scheme:light] dark:[color-scheme:dark]"

export type VeiculoFormDados = {
  id?: string
  placa?: string | null
  marca_modelo?: string | null
  cor?: string | null
  combustivel?: string | null
  lotacao?: string | null
  renavan?: string | null
  ano_fabricacao?: string | null
  ano_modelo?: string | null
  eh_alugado?: boolean
  seguro_vencimento?: string | null
}

export function VeiculoForm({
  action,
  dados,
  contratos,
  contratoAtualId,
  sedes,
}: {
  action: (prev: EstadoForm, formData: FormData) => Promise<EstadoForm>
  dados?: VeiculoFormDados
  contratos: { id: string; rotulo: string }[]
  contratoAtualId?: string | null
  /** Sedes do tenant (empresa_sede) — dropdown de lotação. */
  sedes: string[]
}) {
  const [estado, formAction, pendente] = useActionState(action, {})

  return (
    <form action={formAction} className="grid max-w-2xl gap-4">
      {dados?.id && <input type="hidden" name="veiculo_id" value={dados.id} />}
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="grid gap-1.5">
          <Label htmlFor="placa">Placa *</Label>
          <Input
            id="placa"
            name="placa"
            required
            maxLength={8}
            defaultValue={dados?.placa ?? ""}
            placeholder="ABC1D23"
            className="uppercase"
          />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="marca_modelo">Marca e modelo *</Label>
          <Input
            id="marca_modelo"
            name="marca_modelo"
            required
            defaultValue={dados?.marca_modelo ?? ""}
            placeholder="FIAT/DOBLO ESSENCE 1.8"
          />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="cor">Cor</Label>
          <Input id="cor" name="cor" defaultValue={dados?.cor ?? ""} />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="combustivel">Combustível</Label>
          <select
            id="combustivel"
            name="combustivel"
            defaultValue={dados?.combustivel ?? ""}
            className={SELECT}
          >
            <option value="">(não informado)</option>
            {[
              ...COMBUSTIVEIS_VEICULO,
              ...(dados?.combustivel &&
              !(COMBUSTIVEIS_VEICULO as readonly string[]).includes(
                dados.combustivel
              )
                ? [dados.combustivel]
                : []),
            ].map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="lotacao">Lotação (sede)</Label>
          <select
            id="lotacao"
            name="lotacao"
            defaultValue={dados?.lotacao ?? ""}
            className={SELECT}
          >
            <option value="">(não informada)</option>
            {[
              ...sedes,
              ...(dados?.lotacao && !sedes.includes(dados.lotacao)
                ? [dados.lotacao]
                : []),
            ].map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="renavan">Renavam</Label>
          <Input
            id="renavan"
            name="renavan"
            defaultValue={dados?.renavan ?? ""}
            className="tabular-nums"
          />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="ano_fabricacao">Ano de fabricação</Label>
          <Input
            id="ano_fabricacao"
            name="ano_fabricacao"
            type="number"
            min={1980}
            max={2100}
            defaultValue={dados?.ano_fabricacao?.slice(0, 4) ?? ""}
          />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="ano_modelo">Ano do modelo</Label>
          <Input
            id="ano_modelo"
            name="ano_modelo"
            type="number"
            min={1980}
            max={2100}
            defaultValue={dados?.ano_modelo?.slice(0, 4) ?? ""}
          />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="seguro_vencimento">Vencimento do seguro</Label>
          <Input
            id="seguro_vencimento"
            name="seguro_vencimento"
            type="date"
            defaultValue={dados?.seguro_vencimento ?? ""}
            className="[color-scheme:light] dark:[color-scheme:dark]"
          />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="contrato_aluguel_id">Contrato de aluguel</Label>
          <select
            id="contrato_aluguel_id"
            name="contrato_aluguel_id"
            defaultValue={contratoAtualId ?? ""}
            className={SELECT}
          >
            <option value="">Veículo próprio (sem contrato)</option>
            {contratos.map((c) => (
              <option key={c.id} value={c.id}>
                {c.rotulo}
              </option>
            ))}
          </select>
        </div>
      </div>

      {estado.erro && (
        <p className="text-destructive text-sm">{estado.erro}</p>
      )}
      <div>
        <Button type="submit" disabled={pendente}>
          {pendente ? <Loader2 className="animate-spin" /> : <Save />}
          {dados?.id ? "Salvar alterações" : "Cadastrar veículo"}
        </Button>
      </div>
    </form>
  )
}
