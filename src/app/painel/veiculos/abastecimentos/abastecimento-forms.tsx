"use client"

import { useActionState } from "react"
import { Fuel, Loader2, Upload } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"

import {
  criarAbastecimentoAction,
  importarAbastecimentosAction,
} from "./actions"

const SELECT =
  "border-input bg-background text-foreground h-9 w-full rounded-md border px-3 text-sm shadow-xs outline-none [color-scheme:light] dark:[color-scheme:dark]"

export type Opcao = { id: string; rotulo: string }

export function ImportarAbastecimentosForm() {
  const [estado, formAction, pendente] = useActionState(
    importarAbastecimentosAction,
    {}
  )
  return (
    <form action={formAction} className="grid max-w-2xl gap-3">
      <p className="text-muted-foreground text-sm">
        CSV com cabeçalho:{" "}
        <code>placa; data; hora; posto; cidade; combustivel; litros; valor; hodometro</code>
        {" "}— datas em DD/MM/AAAA, valores com vírgula. As placas precisam
        existir na frota.
      </p>
      <div className="flex flex-wrap items-center gap-2">
        <Input
          type="file"
          name="arquivo"
          accept=".csv,text/csv"
          required
          className="max-w-xs"
        />
        <Button type="submit" disabled={pendente}>
          {pendente ? <Loader2 className="animate-spin" /> : <Upload />}
          Importar fatura
        </Button>
      </div>
      {estado.erro && <p className="text-destructive text-sm">{estado.erro}</p>}
    </form>
  )
}

export function NovoAbastecimentoForm({
  veiculos,
  condutores,
}: {
  veiculos: Opcao[]
  condutores: Opcao[]
}) {
  const [estado, formAction, pendente] = useActionState(
    criarAbastecimentoAction,
    {}
  )
  return (
    <form action={formAction} className="grid max-w-2xl gap-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="grid gap-1.5">
          <Label htmlFor="veiculo_id">Veículo *</Label>
          <select
            id="veiculo_id"
            name="veiculo_id"
            required
            defaultValue=""
            className={SELECT}
          >
            <option value="" disabled>
              Escolha o veículo
            </option>
            {veiculos.map((v) => (
              <option key={v.id} value={v.id}>
                {v.rotulo}
              </option>
            ))}
          </select>
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="condutor_usuario_id">Condutor *</Label>
          <select
            id="condutor_usuario_id"
            name="condutor_usuario_id"
            required
            defaultValue=""
            className={SELECT}
          >
            <option value="" disabled>
              Quem abasteceu
            </option>
            {condutores.map((c) => (
              <option key={c.id} value={c.id}>
                {c.rotulo}
              </option>
            ))}
          </select>
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="data_hora">Data e hora *</Label>
          <Input
            id="data_hora"
            name="data_hora"
            type="datetime-local"
            required
            className="[color-scheme:light] dark:[color-scheme:dark]"
          />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="hodometro">Hodômetro (km) *</Label>
          <Input
            id="hodometro"
            name="hodometro"
            required
            inputMode="numeric"
            className="tabular-nums"
          />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="posto">Posto *</Label>
          <Input id="posto" name="posto" required placeholder="POSTO CANCELA" />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="cidade">Cidade</Label>
          <Input id="cidade" name="cidade" placeholder="MACAÉ" />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="combustivel">Combustível *</Label>
          <Input
            id="combustivel"
            name="combustivel"
            required
            placeholder="GASOLINA COMUM"
          />
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div className="grid gap-1.5">
            <Label htmlFor="volume">Litros *</Label>
            <Input
              id="volume"
              name="volume"
              required
              inputMode="decimal"
              placeholder="41,01"
              className="tabular-nums"
            />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="valor">Valor (R$) *</Label>
            <Input
              id="valor"
              name="valor"
              required
              inputMode="decimal"
              placeholder="221,04"
              className="tabular-nums"
            />
          </div>
        </div>
      </div>
      {estado.erro && <p className="text-destructive text-sm">{estado.erro}</p>}
      <div>
        <Button type="submit" disabled={pendente}>
          {pendente ? <Loader2 className="animate-spin" /> : <Fuel />}
          Lançar abastecimento
        </Button>
      </div>
    </form>
  )
}
