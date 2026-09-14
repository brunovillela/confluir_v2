"use client"

import { useActionState, useState } from "react"
import { Loader2, Trash2 } from "lucide-react"

import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"

import { excluirMovimentacaoAction } from "../../../agendamentos/actions"

/**
 * Exclusão de movimentação pela gestão da frota. Confirmação na própria tela,
 * com o resumo do que some e a palavra EXCLUIR digitada — não há lixeira.
 */
export function ExcluirMovimentacao({
  movimentacaoId,
  resumo,
  temAgendamento,
}: {
  movimentacaoId: string
  resumo: string
  temAgendamento: boolean
}) {
  const [estado, formAction, pendente] = useActionState(excluirMovimentacaoAction, {})
  const [confirmando, setConfirmando] = useState(false)
  const [palavra, setPalavra] = useState("")

  if (!confirmando) {
    return (
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-muted-foreground text-sm">
          Saída lançada por engano (veículo errado, registro duplicado)? Exclua a movimentação.
        </p>
        <Button type="button" variant="outline" className="text-destructive hover:text-destructive" onClick={() => setConfirmando(true)}>
          <Trash2 />
          Excluir movimentação
        </Button>
      </div>
    )
  }

  return (
    <form action={formAction} className="grid gap-3">
      <input type="hidden" name="movimentacao_id" value={movimentacaoId} />
      {estado.erro && (
        <Alert variant="destructive">
          <AlertDescription>{estado.erro}</AlertDescription>
        </Alert>
      )}
      <Alert variant="destructive">
        <AlertDescription>
          <p>
            Vai ser excluída a movimentação <strong>{resumo}</strong>. Não há como desfazer: a saída,
            a entrada, o hodômetro e a quilometragem somem do histórico, e a situação do veículo passa
            a vir da movimentação anterior.
          </p>
          {temAgendamento && (
            <p className="mt-2">
              Ela deu baixa num agendamento, que volta para &quot;Atendida (aguardando retirada)&quot;.
            </p>
          )}
        </AlertDescription>
      </Alert>
      <div className="grid max-w-xs gap-1.5">
        <Label htmlFor="confirmacao">Digite EXCLUIR para confirmar</Label>
        <Input
          id="confirmacao"
          name="confirmacao"
          autoComplete="off"
          value={palavra}
          onChange={(e) => setPalavra(e.target.value.toUpperCase())}
        />
      </div>
      <div className="flex flex-wrap gap-2">
        <Button type="submit" variant="destructive" disabled={pendente || palavra !== "EXCLUIR"}>
          {pendente ? <Loader2 className="animate-spin" /> : <Trash2 />}
          Excluir definitivamente
        </Button>
        <Button
          type="button"
          variant="ghost"
          onClick={() => {
            setConfirmando(false)
            setPalavra("")
          }}
        >
          Cancelar
        </Button>
      </div>
    </form>
  )
}
