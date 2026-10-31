"use client"

import { useActionState, useState } from "react"
import { Loader2, Receipt, Send } from "lucide-react"

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
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"

import { enviarComprovanteAction } from "./actions"
import { useEnvioFormulario } from "@/hooks/use-envio-formulario"

/**
 * Comprovante de pagamento da ordem: abre o arquivo e envia por e-mail ao
 * fornecedor (anexo), como a ordem de compra — aos contatos marcados para
 * receber comprovantes (sem nenhum, aos que recebem a ordem de compra); sem
 * nenhum dos dois, o botão fica desabilitado. Mostra o último envio.
 */
export function ComprovanteAcoes({
  processoId,
  ordemId,
  url,
  fornecedorId,
  destinatarios,
  enviado,
  podeEnviar,
}: {
  processoId: string
  ordemId: string
  url: string
  fornecedorId: string | null
  destinatarios: { nome: string; email: string }[]
  enviado: { em: string; para: string | null } | null
  podeEnviar: boolean
}) {
  const [aberto, setAberto] = useState(false)
  const [estado, acao, pendente] = useActionState(
    async (prev: { erro?: string; ok?: string }, fd: FormData) => {
      const r = await enviarComprovanteAction(prev, fd)
      if (r.ok) setAberto(false)
      return r
    },
    {}
  )
  const envio = useEnvioFormulario(acao, estado)

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Button asChild variant="outline" size="sm" className="h-7">
        <a href={url} target="_blank" rel="noreferrer">
          <Receipt />
          Comprovante de pagamento
        </a>
      </Button>
      {podeEnviar && !destinatarios.length && (
        <>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-7"
            disabled
            title="Nenhum contato do fornecedor com e-mail recebe comprovantes nem a ordem de compra"
          >
            <Send />
            Enviar ao fornecedor
          </Button>
          <span className="text-muted-foreground text-xs">
            Sem contato com e-mail para receber
            {fornecedorId && (
              <>
                {" — "}
                <a href={`/painel/compras/fornecedores/${fornecedorId}#contatos`} className="text-primary hover:underline">
                  cadastrar na ficha do fornecedor
                </a>
              </>
            )}
            .
          </span>
        </>
      )}
      {podeEnviar && destinatarios.length > 0 && (
        <Dialog open={aberto} onOpenChange={setAberto}>
          <DialogTrigger asChild>
            <Button type="button" variant="outline" size="sm" className="h-7">
              <Send />
              Enviar ao fornecedor
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Enviar o comprovante de pagamento</DialogTitle>
              <DialogDescription>
                O fornecedor recebe um e-mail com o comprovante anexo. As respostas dele chegam ao e-mail de contato
                da entidade.
              </DialogDescription>
            </DialogHeader>
            <form action={acao} {...envio} className="grid gap-3">
              <input type="hidden" name="processo_id" value={processoId} />
              <input type="hidden" name="ordem_id" value={ordemId} />
              <div className="grid gap-1.5">
                <Label htmlFor={`cp-email-${ordemId}`}>Enviar para</Label>
                <select
                  id={`cp-email-${ordemId}`}
                  name="email"
                  required
                  defaultValue={destinatarios[0].email}
                  className="border-input bg-background text-foreground h-9 w-full truncate rounded-md border px-3 text-sm shadow-xs outline-none [color-scheme:light] dark:[color-scheme:dark]"
                >
                  {destinatarios.map((d) => (
                    <option key={d.email} value={d.email}>
                      {d.nome ? `${d.nome} — ${d.email}` : d.email}
                    </option>
                  ))}
                </select>
                <p className="text-muted-foreground text-xs">
                  Contatos do fornecedor marcados para receber comprovantes (sem nenhum, os que recebem a ordem de
                  compra).
                </p>
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor={`cp-msg-${ordemId}`}>Mensagem (opcional)</Label>
                <Textarea
                  id={`cp-msg-${ordemId}`}
                  name="mensagem"
                  rows={3}
                  placeholder="Ex.: segue o comprovante referente à nota nº 123."
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
      ) : enviado ? (
        <span className="text-muted-foreground text-xs">
          Enviado{enviado.para ? ` para ${enviado.para}` : ""} em{" "}
          {new Date(enviado.em).toLocaleString("pt-BR", {
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
