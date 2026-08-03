"use client"

import { useActionState } from "react"
import { Loader2, Save } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { type EstadoForm } from "@/lib/contas"
import { type OpcaoPessoa } from "@/lib/db/nucleo"

const SELECT =
  "border-input bg-background text-foreground h-9 w-full rounded-md border px-3 text-sm shadow-xs outline-none [color-scheme:light] dark:[color-scheme:dark]"
const AREA =
  "border-input bg-background text-foreground w-full rounded-md border px-3 py-2 text-sm shadow-xs outline-none"

export type AnomaliaFormDados = {
  id?: string
  fato?: string | null
  conformidade?: string | null
  descricao_detalhada?: string | null
  data_ocorrencia?: string | null
  responsavel_id?: string | null
  causa_raiz?: string | null
  porques?: (string | null)[]
  anomalia_investigada?: boolean
  anomalia_tratada?: boolean
  eficacia_verificada?: boolean
}

export function AnomaliaForm({
  action,
  dados,
  pessoas,
}: {
  action: (prev: EstadoForm, formData: FormData) => Promise<EstadoForm>
  dados?: AnomaliaFormDados
  pessoas: OpcaoPessoa[]
}) {
  const [estado, formAction, pendente] = useActionState(action, {})
  const porques = dados?.porques ?? []

  return (
    <form action={formAction} className="grid max-w-2xl gap-4">
      {dados?.id && <input type="hidden" name="anomalia_id" value={dados.id} />}

      <div className="grid gap-1.5">
        <Label htmlFor="fato">Fato — o que aconteceu *</Label>
        <textarea
          id="fato"
          name="fato"
          required
          rows={2}
          defaultValue={dados?.fato ?? ""}
          className={AREA}
          placeholder="Ex.: Desfiliação sem a solicitação do filiado"
        />
      </div>

      <div className="grid gap-1.5">
        <Label htmlFor="conformidade">Conformidade — o que era esperado</Label>
        <textarea
          id="conformidade"
          name="conformidade"
          rows={2}
          defaultValue={dados?.conformidade ?? ""}
          className={AREA}
          placeholder="O comportamento ou resultado correto"
        />
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="grid gap-1.5">
          <Label htmlFor="data_ocorrencia">Data da ocorrência</Label>
          <Input
            id="data_ocorrencia"
            name="data_ocorrencia"
            type="date"
            defaultValue={dados?.data_ocorrencia ?? ""}
            className="[color-scheme:light] dark:[color-scheme:dark]"
          />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="responsavel_id">Responsável pela apuração</Label>
          <select
            id="responsavel_id"
            name="responsavel_id"
            defaultValue={dados?.responsavel_id ?? ""}
            className={SELECT}
          >
            <option value="">(não definido)</option>
            {pessoas.map((p) => (
              <option key={p.id} value={p.id}>
                {p.nome}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="grid gap-1.5">
        <Label htmlFor="descricao_detalhada">Descrição detalhada</Label>
        <textarea
          id="descricao_detalhada"
          name="descricao_detalhada"
          rows={4}
          defaultValue={dados?.descricao_detalhada ?? ""}
          className={AREA}
        />
      </div>

      <fieldset className="grid gap-3 rounded-lg border p-4">
        <legend className="px-1 text-sm font-medium">
          Investigação (5 porquês)
        </legend>
        {[0, 1, 2, 3, 4].map((i) => (
          <div key={i} className="grid gap-1.5">
            <Label htmlFor={`pq${i + 1}`} className="text-muted-foreground text-xs">
              Por quê {i + 1}?
            </Label>
            <Input
              id={`pq${i + 1}`}
              name={`investigacao_pq${i + 1}`}
              defaultValue={porques[i] ?? ""}
            />
          </div>
        ))}
        <div className="grid gap-1.5">
          <Label htmlFor="causa_raiz">Causa raiz</Label>
          <textarea
            id="causa_raiz"
            name="causa_raiz"
            rows={2}
            defaultValue={dados?.causa_raiz ?? ""}
            className={AREA}
          />
        </div>
      </fieldset>

      <fieldset className="grid gap-2 rounded-lg border p-4">
        <legend className="px-1 text-sm font-medium">Etapas</legend>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            name="anomalia_investigada"
            value="1"
            defaultChecked={dados?.anomalia_investigada}
            className="size-4"
          />
          Investigada
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            name="anomalia_tratada"
            value="1"
            defaultChecked={dados?.anomalia_tratada}
            className="size-4"
          />
          Tratada (providências tomadas)
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            name="eficacia_verificada"
            value="1"
            defaultChecked={dados?.eficacia_verificada}
            className="size-4"
          />
          Eficácia verificada
        </label>
      </fieldset>

      {estado.erro && <p className="text-destructive text-sm">{estado.erro}</p>}
      <div>
        <Button type="submit" disabled={pendente}>
          {pendente ? <Loader2 className="animate-spin" /> : <Save />}
          {dados?.id ? "Salvar alterações" : "Registrar anomalia"}
        </Button>
      </div>
    </form>
  )
}
