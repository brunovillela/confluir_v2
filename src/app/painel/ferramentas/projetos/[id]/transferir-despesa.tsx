"use client"

import { useActionState, useState } from "react"
import { ArrowRightLeft, Loader2 } from "lucide-react"

import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { type EstadoForm } from "@/lib/contas"
import { formatarMoeda } from "@/lib/formato"

import { transferirDespesaAction } from "../actions"

const SELECT =
  "border-input bg-background focus-visible:ring-ring/50 h-9 w-full rounded-md border px-3 text-sm shadow-xs outline-none focus-visible:ring-[3px]"

/**
 * Transferir a compra (com as ordens dela) ou a ordem para outro projeto em
 * andamento. O motivo é obrigatório e fica no livro de transferências.
 */
export function TransferirDespesa({
  origemId,
  tipo,
  itemId,
  rotulo,
  valor,
  projetos,
}: {
  origemId: string
  tipo: "compra" | "custeio" | "ordem"
  itemId: string
  rotulo: string
  valor: number | null
  projetos: { id: string; titulo: string }[]
}) {
  const [aberto, setAberto] = useState(false)
  const [estado, acao, pendente] = useActionState<EstadoForm, FormData>(async (prev, fd) => {
    const r = await transferirDespesaAction(prev, fd)
    if (r.ok) setAberto(false)
    return r
  }, {})
  const oQue = tipo === "compra" ? "a compra" : tipo === "custeio" ? "o custeio" : "a ordem"
  const sufixo = `${tipo}-${itemId}`

  return (
    <Dialog open={aberto} onOpenChange={setAberto}>
      <DialogTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          title={`Transferir ${oQue} para outro projeto`}
          aria-label={`Transferir ${oQue} ${rotulo} para outro projeto`}
          disabled={projetos.length === 0}
        >
          <ArrowRightLeft />
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Transferir para outro projeto</DialogTitle>
          <DialogDescription>
            {tipo === "compra"
              ? `A compra ${rotulo} vai para o projeto escolhido, com todas as ordens de pagamento dela.`
              : tipo === "custeio"
                ? `O custeio ${rotulo} vai para o projeto escolhido, com todas as ordens de pagamento dele.`
                : `A ordem ${rotulo} vai para o projeto escolhido.`}
            {valor != null && valor > 0 && ` Valor: ${formatarMoeda(valor)}.`} O centro de custo não muda; se precisar,
            reclassifique a ordem no Financeiro.
          </DialogDescription>
        </DialogHeader>
        <form action={acao} className="grid gap-3">
          <input type="hidden" name="origem_id" value={origemId} />
          <input type="hidden" name="tipo" value={tipo} />
          <input type="hidden" name="item_id" value={itemId} />
          <div className="grid gap-1.5">
            <Label htmlFor={`destino-${sufixo}`}>Projeto de destino *</Label>
            <select id={`destino-${sufixo}`} name="destino_id" required defaultValue="" className={SELECT}>
              <option value="" disabled>
                (selecione um projeto em andamento)
              </option>
              {projetos.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.titulo}
                </option>
              ))}
            </select>
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor={`motivo-${sufixo}`}>Motivo *</Label>
            <Textarea
              id={`motivo-${sufixo}`}
              name="motivo"
              required
              minLength={3}
              maxLength={500}
              rows={3}
              placeholder="Ex.: o buffet foi do Sextou de Campos, não do de Macaé."
            />
          </div>
          {estado.erro && <p className="text-destructive text-sm">{estado.erro}</p>}
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => setAberto(false)}>
              Cancelar
            </Button>
            <Button type="submit" disabled={pendente}>
              {pendente ? <Loader2 className="animate-spin" /> : <ArrowRightLeft />}
              Transferir
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
