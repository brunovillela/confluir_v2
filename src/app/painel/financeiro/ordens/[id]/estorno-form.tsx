"use client"

import { useActionState, useState } from "react"
import { Loader2, Undo2 } from "lucide-react"

import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"

import { registrarEstornoAction } from "./actions"

const TEXTAREA =
  "border-input bg-background text-foreground w-full rounded-md border px-3 py-2 text-sm shadow-xs outline-none"

/**
 * Comunicado de estorno: aparece na ordem paga enquanto o prazo pós-pagamento
 * está aberto. Registrar regride a ordem e avisa quem a lançou.
 */
export function EstornoForm({
  ordemId,
  ate,
  hoje,
  dataPagamento,
  responsavel,
}: {
  ordemId: string
  /** Último dia do prazo (ISO), já formatado para exibição. */
  ate: string
  hoje: string
  dataPagamento: string
  responsavel: string | null
}) {
  const [aberto, setAberto] = useState(false)
  const [estado, acao, pendente] = useActionState(registrarEstornoAction, {})

  if (!aberto) {
    return (
      <div className="flex flex-wrap items-center gap-2 border-t pt-3">
        <Button variant="outline" size="sm" className="text-destructive" onClick={() => setAberto(true)}>
          <Undo2 />
          Registrar estorno
        </Button>
        <span className="text-muted-foreground text-xs">
          O banco devolveu o pagamento? Dá para registrar até {ate}.
        </span>
      </div>
    )
  }

  return (
    <form action={acao} className="border-destructive/40 mt-1 grid gap-3 rounded-md border p-3">
      <input type="hidden" name="id" value={ordemId} />
      <p className="text-sm font-medium">Comunicado de estorno</p>
      {estado.erro && (
        <Alert variant="destructive">
          <AlertDescription>{estado.erro}</AlertDescription>
        </Alert>
      )}
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="grid gap-1.5">
          <Label htmlFor="data_estorno">Data do estorno *</Label>
          <Input
            id="data_estorno"
            name="data_estorno"
            type="date"
            required
            defaultValue={hoje}
            min={dataPagamento}
            max={hoje}
          />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="comunicado">Comunicado do banco (PDF ou imagem)</Label>
          <Input
            id="comunicado"
            name="comunicado"
            type="file"
            accept="application/pdf,image/jpeg,image/png,image/webp"
          />
        </div>
      </div>
      <div className="grid gap-1.5">
        <Label htmlFor="motivo_estorno">Motivo informado pelo banco *</Label>
        <textarea
          id="motivo_estorno"
          name="motivo"
          rows={2}
          required
          minLength={10}
          placeholder="Ex.: conta de destino encerrada; chave Pix inexistente; boleto vencido."
          className={TEXTAREA}
        />
      </div>
      <p className="text-muted-foreground text-xs">
        O pagamento é desfeito (fica guardado no estorno), a ordem volta para
        &quot;Aguardando informações&quot; e perde a autorização.{" "}
        {responsavel
          ? `${responsavel}, que lançou a ordem, é avisado para conferir os dados bancários ou o boleto e reencaminhar para autorização.`
          : "Não foi possível identificar quem lançou a ordem: o Financeiro corrige os dados pela tela do estorno."}
      </p>
      <div className="flex flex-wrap gap-2">
        <Button type="submit" size="sm" variant="destructive" disabled={pendente}>
          {pendente ? <Loader2 className="animate-spin" /> : <Undo2 />}
          Registrar estorno
        </Button>
        <Button type="button" size="sm" variant="ghost" onClick={() => setAberto(false)}>
          Desistir
        </Button>
      </div>
    </form>
  )
}
