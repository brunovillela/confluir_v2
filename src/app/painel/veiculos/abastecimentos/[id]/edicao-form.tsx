"use client"

import { useActionState, useState } from "react"
import { Loader2, Save, Trash2 } from "lucide-react"

import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"

import { atualizarAbastecimentoAction, excluirAbastecimentoAction } from "./actions"

const SELECT =
  "border-input bg-background text-foreground h-9 w-full truncate rounded-md border px-3 text-sm shadow-xs outline-none [color-scheme:light] dark:[color-scheme:dark]"

type Opcao = { id: string; rotulo: string }

export function EdicaoAbastecimentoForm({
  id,
  atual,
  veiculos,
  condutores,
  informado,
  pendentes,
}: {
  id: string
  atual: {
    veiculoId: string
    condutorId: string
    /** YYYY-MM-DDTHH:MM, hora de São Paulo. */
    dataHora: string
    hodometro: string
    posto: string
    cidade: string
    combustivel: string
    volume: string
    valor: string
  }
  veiculos: Opcao[]
  condutores: Opcao[]
  /** Como veio no relatório. */
  informado: { placa: string | null; condutor: string | null }
  /** Outros lançamentos sem vínculo com a mesma placa / o mesmo nome. */
  pendentes: { placa: number; condutor: number }
}) {
  const [estado, acao, salvando] = useActionState(atualizarAbastecimentoAction, {})
  const [estadoExcluir, acaoExcluir, excluindo] = useActionState(excluirAbastecimentoAction, {})
  const [veiculoId, setVeiculoId] = useState(atual.veiculoId)
  const [condutorId, setCondutorId] = useState(atual.condutorId)
  const [confirmarExclusao, setConfirmarExclusao] = useState(false)

  return (
    <div className="grid gap-6">
      <form action={acao} className="grid max-w-3xl gap-4">
        <input type="hidden" name="id" value={id} />
        {estado.erro && (
          <Alert variant="destructive">
            <AlertDescription>{estado.erro}</AlertDescription>
          </Alert>
        )}
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="grid gap-1.5">
            <Label htmlFor="veiculo_id">Veículo</Label>
            <select
              id="veiculo_id"
              name="veiculo_id"
              value={veiculoId}
              onChange={(e) => setVeiculoId(e.target.value)}
              className={SELECT}
            >
              <option value="">— não identificado —</option>
              {veiculos.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.rotulo}
                </option>
              ))}
            </select>
            {informado.placa && (
              <p className="text-muted-foreground text-xs">No relatório: placa {informado.placa}</p>
            )}
            {informado.placa && !atual.veiculoId && veiculoId && pendentes.placa > 0 && (
              <label className="flex items-start gap-2 text-sm">
                <input type="checkbox" name="aplicar_placa" defaultChecked className="mt-1" />
                <span>
                  Vincular também os outros {pendentes.placa.toLocaleString("pt-BR")} lançamento
                  {pendentes.placa === 1 ? "" : "s"} sem veículo com a placa {informado.placa}
                </span>
              </label>
            )}
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="condutor_usuario_id">Condutor</Label>
            <select
              id="condutor_usuario_id"
              name="condutor_usuario_id"
              value={condutorId}
              onChange={(e) => setCondutorId(e.target.value)}
              className={SELECT}
            >
              <option value="">— sem condutor —</option>
              {condutores.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.rotulo}
                </option>
              ))}
            </select>
            {informado.condutor && (
              <p className="text-muted-foreground text-xs">No relatório: {informado.condutor}</p>
            )}
            {informado.condutor && !atual.condutorId && condutorId && pendentes.condutor > 0 && (
              <label className="flex items-start gap-2 text-sm">
                <input type="checkbox" name="aplicar_condutor" defaultChecked className="mt-1" />
                <span>
                  Aplicar também aos outros {pendentes.condutor.toLocaleString("pt-BR")} lançamento
                  {pendentes.condutor === 1 ? "" : "s"} sem condutor de &quot;{informado.condutor}&quot;
                </span>
              </label>
            )}
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="data_hora">Data e hora *</Label>
            <Input
              id="data_hora"
              name="data_hora"
              type="datetime-local"
              required
              defaultValue={atual.dataHora}
              className="[color-scheme:light] dark:[color-scheme:dark]"
            />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="hodometro">Hodômetro (km)</Label>
            <Input id="hodometro" name="hodometro" inputMode="numeric" defaultValue={atual.hodometro} className="tabular-nums" />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="posto">Posto *</Label>
            <Input id="posto" name="posto" required defaultValue={atual.posto} />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="cidade">Cidade</Label>
            <Input id="cidade" name="cidade" defaultValue={atual.cidade} />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="combustivel">Combustível *</Label>
            <Input id="combustivel" name="combustivel" required defaultValue={atual.combustivel} />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="grid gap-1.5">
              <Label htmlFor="volume">Litros *</Label>
              <Input id="volume" name="volume" required inputMode="decimal" defaultValue={atual.volume} className="tabular-nums" />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="valor">Valor (R$) *</Label>
              <Input id="valor" name="valor" required inputMode="decimal" defaultValue={atual.valor} className="tabular-nums" />
            </div>
          </div>
        </div>
        <div>
          <Button type="submit" disabled={salvando}>
            {salvando ? <Loader2 className="animate-spin" /> : <Save />}
            Salvar alterações
          </Button>
        </div>
      </form>

      <div className="border-t pt-4">
        {estadoExcluir.erro && (
          <Alert variant="destructive" className="mb-3">
            <AlertDescription>{estadoExcluir.erro}</AlertDescription>
          </Alert>
        )}
        {!confirmarExclusao ? (
          <Button variant="outline" className="text-destructive" onClick={() => setConfirmarExclusao(true)}>
            <Trash2 />
            Excluir lançamento
          </Button>
        ) : (
          <form action={acaoExcluir} className="border-destructive/40 grid max-w-xl gap-3 rounded-md border p-3">
            <input type="hidden" name="id" value={id} />
            <p className="text-sm">
              Excluir este abastecimento? Ele sai do consumo e dos gastos do veículo e não pode
              ser recuperado.
            </p>
            <div className="flex gap-2">
              <Button type="submit" variant="destructive" size="sm" disabled={excluindo}>
                {excluindo ? <Loader2 className="animate-spin" /> : <Trash2 />}
                Confirmar exclusão
              </Button>
              <Button type="button" variant="ghost" size="sm" onClick={() => setConfirmarExclusao(false)}>
                Cancelar
              </Button>
            </div>
          </form>
        )}
      </div>
    </div>
  )
}
