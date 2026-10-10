"use client"

import { useActionState, useState } from "react"
import { FileText, Loader2, Send } from "lucide-react"

import { Alert, AlertDescription } from "@/components/ui/alert"
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
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"

import { enviarOrdemCompraAction } from "./actions"

/**
 * Ordem de compra do fornecimento: abre o PDF e envia por e-mail ao
 * fornecedor (com o PDF anexo). Mostra o último envio.
 */
export function OrdemCompraAcoes({
  processoId,
  fornecimentoId,
  emailFornecedor,
  enviada,
  podeEnviar,
}: {
  processoId: string
  fornecimentoId: string
  emailFornecedor: string | null
  enviada: { em: string; para: string | null } | null
  podeEnviar: boolean
}) {
  const [aberto, setAberto] = useState(false)
  const [estado, acao, pendente] = useActionState(
    async (prev: { erro?: string; ok?: string }, fd: FormData) => {
      const r = await enviarOrdemCompraAction(prev, fd)
      if (r.ok) setAberto(false)
      return r
    },
    {}
  )
  const pdf = `/painel/compras/${processoId}/fornecimentos/${fornecimentoId}/ordem-compra`

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Button asChild variant="outline" size="sm" className="h-7">
        <a href={pdf} target="_blank" rel="noreferrer">
          <FileText />
          Ordem de compra (PDF)
        </a>
      </Button>
      {podeEnviar && (
        <Dialog open={aberto} onOpenChange={setAberto}>
          <DialogTrigger asChild>
            <Button type="button" variant="outline" size="sm" className="h-7">
              <Send />
              Enviar ao fornecedor
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Enviar a ordem de compra</DialogTitle>
              <DialogDescription>
                O fornecedor recebe um e-mail com a ordem de compra em PDF anexo. As respostas dele chegam ao e-mail
                de contato da entidade.
              </DialogDescription>
            </DialogHeader>
            <form action={acao} className="grid gap-3">
              <input type="hidden" name="processo_id" value={processoId} />
              <input type="hidden" name="fornecimento_id" value={fornecimentoId} />
              <div className="grid gap-1.5">
                <Label htmlFor={`oc-email-${fornecimentoId}`}>E-mail do fornecedor</Label>
                <Input
                  id={`oc-email-${fornecimentoId}`}
                  name="email"
                  type="email"
                  required
                  defaultValue={emailFornecedor ?? ""}
                  placeholder="compras@fornecedor.com.br"
                />
                {!emailFornecedor && (
                  <p className="text-muted-foreground text-xs">
                    O cadastro do fornecedor não tem e-mail de contato — informe aqui.
                  </p>
                )}
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor={`oc-msg-${fornecimentoId}`}>Mensagem (opcional)</Label>
                <Textarea
                  id={`oc-msg-${fornecimentoId}`}
                  name="mensagem"
                  rows={3}
                  placeholder="Ex.: favor confirmar o prazo de entrega."
                />
              </div>
              {estado.erro && (
                <Alert variant="destructive">
                  <AlertDescription>{estado.erro}</AlertDescription>
                </Alert>
              )}
              <DialogFooter>
                <Button type="button" variant="ghost" onClick={() => setAberto(false)}>
                  Cancelar
                </Button>
                <Button type="submit" disabled={pendente}>
                  {pendente ? <Loader2 className="animate-spin" /> : <Send />}
                  Enviar
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      )}
      {!aberto && estado.ok ? (
        <span className="text-success-fg text-xs">{estado.ok}</span>
      ) : enviada ? (
        <span className="text-muted-foreground text-xs">
          Enviada{enviada.para ? ` para ${enviada.para}` : ""} em{" "}
          {new Date(enviada.em).toLocaleString("pt-BR", {
            timeZone: "America/Sao_Paulo",
            day: "2-digit",
            month: "2-digit",
            year: "numeric",
            hour: "2-digit",
            minute: "2-digit",
          })}
        </span>
      ) : null}
    </div>
  )
}
