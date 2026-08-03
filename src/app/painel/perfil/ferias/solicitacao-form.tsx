"use client"

import { useActionState } from "react"
import { Loader2, Send, X } from "lucide-react"

import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"

import { cancelarFeriasAction, solicitarFeriasAction } from "./actions"

const SELECT =
  "border-input bg-background text-foreground h-9 w-full rounded-md border px-3 text-sm shadow-xs outline-none [color-scheme:light] dark:[color-scheme:dark]"

export function SolicitarFeriasForm({
  periodos,
}: {
  periodos: { id: string; rotulo: string }[]
}) {
  const [estado, formAction, pendente] = useActionState(
    solicitarFeriasAction,
    {}
  )

  return (
    <form action={formAction} className="grid gap-4">
      {estado.erro && (
        <Alert variant="destructive">
          <AlertDescription>{estado.erro}</AlertDescription>
        </Alert>
      )}

      <div className="grid gap-1.5">
        <Label htmlFor="periodo_id">Período aquisitivo *</Label>
        <select
          id="periodo_id"
          name="periodo_id"
          required
          defaultValue=""
          className={SELECT}
        >
          <option value="" disabled>
            Escolha o período
          </option>
          {periodos.map((p) => (
            <option key={p.id} value={p.id}>
              {p.rotulo}
            </option>
          ))}
        </select>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="grid gap-1.5">
          <Label htmlFor="inicio">Início das férias *</Label>
          <Input id="inicio" name="inicio" type="date" required />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="termino">Retorno ao trabalho *</Label>
          <Input id="termino" name="termino" type="date" required />
        </div>
      </div>

      <label className="flex items-start gap-2 text-sm">
        <input type="checkbox" name="abono" className="mt-0.5 size-4" />
        <span>
          Vender 1/3 das férias em dinheiro (abono pecuniário — CLT art. 143).
          <span className="text-muted-foreground block text-xs">
            Reduz em 10 dias o descanso deste período (para o direito de 30
            dias). É um pedido — o departamento de pessoal confirma junto com a
            autorização das férias.
          </span>
        </span>
      </label>

      <p className="text-muted-foreground text-xs">
        As regras da CLT (art. 134) são conferidas na hora: cada gozo tem no
        mínimo 5 dias, um deles com pelo menos 14, e as férias não podem começar
        na sexta, no sábado ou nos 2 dias antes de um feriado. A solicitação vai
        para autorização do departamento de pessoal.
      </p>

      <div className="flex justify-end">
        <Button type="submit" disabled={pendente}>
          {pendente ? <Loader2 className="animate-spin" /> : <Send />}
          Enviar solicitação
        </Button>
      </div>
    </form>
  )
}

export function CancelarFeriasBotao({
  id,
  autorizado = false,
}: {
  id: string
  autorizado?: boolean
}) {
  const [estado, formAction, pendente] = useActionState(cancelarFeriasAction, {})

  return (
    <form
      action={formAction}
      onSubmit={(e) => {
        const pergunta = autorizado
          ? "Estas férias já foram AUTORIZADAS. Cancelar assim mesmo? Combine a troca com o departamento de pessoal."
          : "Cancelar esta solicitação de férias?"
        if (!confirm(pergunta)) e.preventDefault()
      }}
      className="inline-flex items-center"
    >
      <input type="hidden" name="id" value={id} />
      {estado.erro && (
        <span className="text-destructive mr-1 text-xs">{estado.erro}</span>
      )}
      <Button
        type="submit"
        variant="ghost"
        size="sm"
        disabled={pendente}
        className="text-destructive hover:text-destructive h-7 px-2"
      >
        {pendente ? <Loader2 className="animate-spin" /> : <X />}
        Cancelar
      </Button>
    </form>
  )
}
