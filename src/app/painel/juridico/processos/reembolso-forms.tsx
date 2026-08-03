"use client"

import { useActionState } from "react"
import { Check, Loader2, Save, X } from "lucide-react"

import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"

import {
  avaliarReembolsoAction,
  definirCentroCustoJuridicoAction,
  registrarReembolsoAction,
} from "./reembolso-actions"

const SELECT =
  "border-input bg-background text-foreground h-9 w-full rounded-md border px-3 text-sm shadow-xs outline-none [color-scheme:light] dark:[color-scheme:dark]"

export type OpcaoCentroCusto = { id: string; rotulo: string }

/** Configuração do centro de custo padrão das ordens de reembolso. */
export function ConfigCentroCustoForm({
  centros,
  atualId,
}: {
  centros: OpcaoCentroCusto[]
  atualId: string | null
}) {
  const [estado, formAction, pendente] = useActionState(
    definirCentroCustoJuridicoAction,
    {}
  )
  return (
    <form action={formAction} className="grid max-w-xl gap-3">
      <div className="grid gap-1.5">
        <Label htmlFor="centro_custo_id">Centro de custo dos reembolsos</Label>
        <select
          id="centro_custo_id"
          name="centro_custo_id"
          defaultValue={atualId ?? ""}
          className={SELECT}
        >
          <option value="">Nenhum (ordens sem centro de custo)</option>
          {centros.map((c) => (
            <option key={c.id} value={c.id}>
              {c.rotulo}
            </option>
          ))}
        </select>
        <p className="text-muted-foreground text-xs">
          Toda ordem gerada ao aprovar um reembolso jurídico passa a carregar
          este centro de custo.
        </p>
      </div>
      {estado.erro && (
        <Alert variant="destructive">
          <AlertDescription>{estado.erro}</AlertDescription>
        </Alert>
      )}
      {estado.ok && (
        <Alert variant="success">
          <AlertDescription>{estado.ok}</AlertDescription>
        </Alert>
      )}
      <div>
        <Button type="submit" size="sm" disabled={pendente}>
          {pendente ? <Loader2 className="animate-spin" /> : <Save />}
          Salvar
        </Button>
      </div>
    </form>
  )
}

export function RegistrarReembolsoForm({ processoId }: { processoId: string }) {
  const [estado, formAction, pendente] = useActionState(
    registrarReembolsoAction,
    {}
  )
  return (
    <form action={formAction} className="grid max-w-xl gap-4">
      <input type="hidden" name="processo_id" value={processoId} />
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="grid gap-1.5">
          <Label htmlFor="valor">Valor da despesa *</Label>
          <Input
            id="valor"
            name="valor"
            inputMode="decimal"
            placeholder="0,00"
            required
          />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="data_despesa">Data da despesa</Label>
          <Input id="data_despesa" name="data_despesa" type="date" />
        </div>
      </div>
      <div className="grid gap-1.5">
        <Label htmlFor="descricao_despesa">Descrição da despesa *</Label>
        <Textarea
          id="descricao_despesa"
          name="descricao_despesa"
          rows={2}
          required
          placeholder="Custas, perícia, deslocamento à audiência…"
        />
      </div>
      <div className="grid gap-1.5">
        <Label htmlFor="comprovante">Comprovante *</Label>
        <Input
          id="comprovante"
          name="comprovante"
          type="file"
          accept="application/pdf,image/*"
          required
        />
      </div>
      {estado.erro && (
        <Alert variant="destructive">
          <AlertDescription>{estado.erro}</AlertDescription>
        </Alert>
      )}
      {estado.ok && (
        <Alert variant="success">
          <AlertDescription>{estado.ok}</AlertDescription>
        </Alert>
      )}
      <div>
        <Button type="submit" disabled={pendente}>
          {pendente ? <Loader2 className="animate-spin" /> : <Save />}
          Registrar despesa
        </Button>
      </div>
    </form>
  )
}

/**
 * Avaliação da gestão jurídica: dois submits (aprovar/reprovar) no mesmo form;
 * o botão clicado envia `decisao`. Aprovar gera a ordem de pagamento.
 */
export function AvaliarReembolsoForm({
  reembolsoId,
  processoId,
}: {
  reembolsoId: string
  processoId?: string
}) {
  const [estado, formAction, pendente] = useActionState(
    avaliarReembolsoAction,
    {}
  )
  return (
    <form action={formAction} className="grid gap-3">
      <input type="hidden" name="reembolso_id" value={reembolsoId} />
      {processoId && (
        <input type="hidden" name="processo_id" value={processoId} />
      )}
      <div className="grid gap-1.5">
        <Label htmlFor={`obs-${reembolsoId}`}>
          Observação{" "}
          <span className="text-muted-foreground font-normal">
            (obrigatória ao reprovar)
          </span>
        </Label>
        <Textarea
          id={`obs-${reembolsoId}`}
          name="observacao"
          rows={2}
          placeholder="Motivo da reprovação ou nota da aprovação"
        />
      </div>
      {estado.erro && (
        <Alert variant="destructive">
          <AlertDescription>{estado.erro}</AlertDescription>
        </Alert>
      )}
      <div className="flex flex-wrap gap-2">
        <Button
          type="submit"
          name="decisao"
          value="aprovar"
          size="sm"
          disabled={pendente}
        >
          {pendente ? <Loader2 className="animate-spin" /> : <Check />}
          Aprovar e gerar ordem
        </Button>
        <Button
          type="submit"
          name="decisao"
          value="reprovar"
          size="sm"
          variant="outline"
          disabled={pendente}
        >
          <X />
          Reprovar
        </Button>
      </div>
    </form>
  )
}
