"use client"

import { useActionState } from "react"
import { Check, Loader2 } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"

import { editarMovimentacaoAction } from "../../../agendamentos/actions"
import { SELECT, type OpcaoCondutor } from "../../../agendamentos/agendamento-forms"

export type ValoresMovimentacao = {
  condutor_id: string | null
  data_retirada: string | null
  hodometro_retirada: number | null
  sede_retirada: string | null
  destino: string | null
  previsao_retorno: string | null
  data_devolucao: string | null
  hodometro_devolucao: number | null
  sede_devolucao: string | null
  observacao_retorno: string | null
}

/** Gestão da frota: corrige os dados de uma movimentação já lançada. */
export function MovimentacaoEditarForm({
  movimentacaoId,
  veiculoId,
  valores,
  condutores,
  sedes,
}: {
  movimentacaoId: string
  veiculoId: string
  valores: ValoresMovimentacao
  condutores: OpcaoCondutor[]
  sedes: string[]
}) {
  const [estado, formAction, pendente] = useActionState(
    editarMovimentacaoAction,
    {}
  )
  const data = "[color-scheme:light] dark:[color-scheme:dark]"
  const condutorConhecido =
    !valores.condutor_id || condutores.some((c) => c.id === valores.condutor_id)

  return (
    <form action={formAction} className="grid gap-6">
      <input type="hidden" name="movimentacao_id" value={movimentacaoId} />
      <input type="hidden" name="veiculo_id" value={veiculoId} />
      <input type="hidden" name="voltar" value={`/painel/veiculos/${veiculoId}/historico`} />

      <fieldset className="grid gap-4">
        <legend className="mb-2 text-sm font-medium">Saída</legend>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <div className="grid gap-1.5">
            <Label htmlFor="condutor_usuario_id">Condutor</Label>
            <select
              id="condutor_usuario_id"
              name="condutor_usuario_id"
              className={SELECT}
              defaultValue={valores.condutor_id ?? ""}
            >
              <option value="">Sem condutor</option>
              {!condutorConhecido && valores.condutor_id && (
                <option value={valores.condutor_id}>(condutor atual, fora do cadastro)</option>
              )}
              {condutores.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.nome}
                </option>
              ))}
            </select>
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="data_retirada">Data da saída *</Label>
            <Input
              id="data_retirada"
              name="data_retirada"
              type="date"
              required
              defaultValue={valores.data_retirada ?? ""}
              className={data}
            />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="hodometro_retirada">Hodômetro na saída</Label>
            <Input
              id="hodometro_retirada"
              name="hodometro_retirada"
              inputMode="numeric"
              defaultValue={valores.hodometro_retirada ?? ""}
              className="tabular-nums"
            />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="sede_retirada">Sede de saída</Label>
            <select
              id="sede_retirada"
              name="sede_retirada"
              className={SELECT}
              defaultValue={valores.sede_retirada ?? ""}
            >
              <option value="">—</option>
              {sedes.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
              {valores.sede_retirada && !sedes.includes(valores.sede_retirada) && (
                <option value={valores.sede_retirada}>{valores.sede_retirada}</option>
              )}
            </select>
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="destino">Destino</Label>
            <Input id="destino" name="destino" defaultValue={valores.destino ?? ""} />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="previsao_retorno">Previsão de retorno</Label>
            <Input
              id="previsao_retorno"
              name="previsao_retorno"
              type="date"
              defaultValue={valores.previsao_retorno ?? ""}
              className={data}
            />
          </div>
        </div>
      </fieldset>

      <fieldset className="grid gap-4">
        <legend className="mb-2 text-sm font-medium">Entrada</legend>
        <p className="text-muted-foreground -mt-2 text-xs">
          Deixe data e hodômetro da entrada em branco para manter (ou tornar) a
          movimentação em aberto.
        </p>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <div className="grid gap-1.5">
            <Label htmlFor="data_devolucao">Data da entrada</Label>
            <Input
              id="data_devolucao"
              name="data_devolucao"
              type="date"
              defaultValue={valores.data_devolucao ?? ""}
              className={data}
            />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="hodometro_devolucao">Hodômetro na entrada</Label>
            <Input
              id="hodometro_devolucao"
              name="hodometro_devolucao"
              inputMode="numeric"
              defaultValue={valores.hodometro_devolucao ?? ""}
              className="tabular-nums"
            />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="sede_devolucao">Sede de entrada</Label>
            <select
              id="sede_devolucao"
              name="sede_devolucao"
              className={SELECT}
              defaultValue={valores.sede_devolucao ?? ""}
            >
              <option value="">—</option>
              {sedes.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
              {valores.sede_devolucao && !sedes.includes(valores.sede_devolucao) && (
                <option value={valores.sede_devolucao}>{valores.sede_devolucao}</option>
              )}
            </select>
          </div>
          <div className="grid gap-1.5 sm:col-span-2 lg:col-span-3">
            <Label htmlFor="observacao_retorno">Observação da entrada</Label>
            <Input
              id="observacao_retorno"
              name="observacao_retorno"
              defaultValue={valores.observacao_retorno ?? ""}
              placeholder="Avarias, pendências, combustível…"
            />
          </div>
        </div>
      </fieldset>

      {estado.erro && <p className="text-destructive text-sm">{estado.erro}</p>}
      <div>
        <Button type="submit" disabled={pendente}>
          {pendente ? <Loader2 className="animate-spin" /> : <Check />}
          Salvar correção
        </Button>
      </div>
    </form>
  )
}
