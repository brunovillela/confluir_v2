"use client"

import { useActionState, useState } from "react"
import { ArrowRightLeft, Check, Loader2, X } from "lucide-react"

import { Button } from "@/components/ui/button"
import { confirmarEnvio } from "@/components/ui/confirmacao"
import { Input } from "@/components/ui/input"

import { avaliarDespesaCaixaAction, transferirDespesaCaixaAction } from "./actions"

const SELECT =
  "border-input bg-background text-foreground h-8 max-w-64 truncate rounded-md border px-2 text-sm shadow-xs outline-none [color-scheme:light] dark:[color-scheme:dark]"

/** Reconhecer ou não (com motivo) a despesa lançada na sua conta. */
export function AvaliarDespesa({ id, resumo }: { id: string; resumo: string }) {
  const [estado, acao, pendente] = useActionState(avaliarDespesaCaixaAction, {})
  const [motivo, setMotivo] = useState("")
  if (estado.ok) return <p className="text-success-fg text-xs font-medium">{estado.ok}</p>
  return (
    <form
      action={acao}
      className="grid justify-items-end gap-1.5"
      onSubmit={(e) => {
        const valor = ((e.nativeEvent as SubmitEvent).submitter as HTMLButtonElement)?.value
        if (valor === "reconhecer") confirmarEnvio(e, `Reconhecer a despesa ${resumo}? Ela fica no extrato da sua conta.`)
        else if (motivo.trim().length < 5) {
          alert("Diga por que não reconhece a despesa.")
          e.preventDefault()
        }
      }}
    >
      <input type="hidden" name="id" value={id} />
      <div className="flex flex-wrap items-center justify-end gap-2">
        <Input
          name="motivo"
          value={motivo}
          onChange={(e) => setMotivo(e.target.value)}
          placeholder="Motivo (para não reconhecer)"
          className="h-8 w-56 text-sm"
        />
        <Button type="submit" name="decisao" value="nao" variant="outline" size="sm" disabled={pendente}>
          {pendente ? <Loader2 className="animate-spin" /> : <X />}
          Não reconheço
        </Button>
        <Button type="submit" name="decisao" value="reconhecer" size="sm" disabled={pendente}>
          {pendente ? <Loader2 className="animate-spin" /> : <Check />}
          Reconheço
        </Button>
      </div>
      {estado.erro && <p className="text-destructive text-xs">{estado.erro}</p>}
    </form>
  )
}

/** Transferir a despesa para a conta de caixa certa. */
export function TransferirDespesa({
  id,
  contas,
}: {
  id: string
  contas: { id: string; rotulo: string }[]
}) {
  const [estado, acao, pendente] = useActionState(transferirDespesaCaixaAction, {})
  if (estado.ok) return <p className="text-success-fg text-xs font-medium">{estado.ok}</p>
  return (
    <form
      action={acao}
      className="grid justify-items-end gap-1.5"
      onSubmit={(e) => confirmarEnvio(e, "Transferir a despesa? Ela sai da conta atual e entra na escolhida.")}
    >
      <input type="hidden" name="id" value={id} />
      <div className="flex flex-wrap items-center justify-end gap-2">
        <select name="conta_id" required defaultValue="" className={SELECT} aria-label="Conta de caixa certa">
          <option value="" disabled>
            Conta certa…
          </option>
          {contas.map((c) => (
            <option key={c.id} value={c.id}>
              {c.rotulo}
            </option>
          ))}
        </select>
        <Button type="submit" size="sm" disabled={pendente || contas.length === 0}>
          {pendente ? <Loader2 className="animate-spin" /> : <ArrowRightLeft />}
          Transferir
        </Button>
      </div>
      {contas.length === 0 && <p className="text-muted-foreground text-xs">Nenhuma outra conta de caixa aberta.</p>}
      {estado.erro && <p className="text-destructive text-xs">{estado.erro}</p>}
    </form>
  )
}
