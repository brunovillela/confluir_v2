"use client"

import { useActionState, useCallback, useEffect, useRef, useState } from "react"
import { Loader2, MessageSquare, Paperclip, Send } from "lucide-react"

import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { type EstadoForm } from "@/lib/contas"
import type { MensagemTarefa } from "@/lib/db/tarefa-conversa"
import { formatarDataHora } from "@/lib/formato"

import { carregarConversaAction, enviarMensagemTarefaAction } from "./conversa-actions"

const ACEITA = ".pdf,.jpg,.jpeg,.png,.webp,.doc,.docx,.xls,.xlsx,.csv,.txt"
const MAX_BYTES = 3 * 1024 * 1024

/**
 * Conversa da tarefa: o botão (com quantas mensagens há) abre a janela com as
 * mensagens e o campo para escrever, com anexo opcional. `abertaDeInicio`
 * abre direto (o link dos avisos, ?conversa=<id>); `semBotao` não mostra o
 * botão (a tarefa pode nem estar na lista da tela).
 */
export function ConversaTarefa({
  tarefaId,
  titulo,
  quantidade = 0,
  abertaDeInicio = false,
  semBotao = false,
}: {
  tarefaId: string
  titulo: string | null
  quantidade?: number
  abertaDeInicio?: boolean
  semBotao?: boolean
}) {
  const [aberta, setAberta] = useState(abertaDeInicio)
  const [mensagens, setMensagens] = useState<MensagemTarefa[] | null>(null)
  const [eu, setEu] = useState<string | null>(null)
  const [erroLeitura, setErroLeitura] = useState<string | null>(null)
  const [erroArquivo, setErroArquivo] = useState<string | null>(null)
  const fim = useRef<HTMLDivElement>(null)

  const carregar = useCallback(async () => {
    const r = await carregarConversaAction(tarefaId)
    if (r.erro) setErroLeitura(r.erro)
    else {
      setErroLeitura(null)
      setMensagens(r.mensagens ?? [])
      setEu(r.eu ?? null)
    }
  }, [tarefaId])

  const [estado, enviar, enviando] = useActionState<EstadoForm, FormData>(async (prev, fd) => {
    const r = await enviarMensagemTarefaAction(prev, fd)
    if (r.ok) await carregar()
    return r
  }, {})

  useEffect(() => {
    if (!aberta) return
    let vivo = true
    carregarConversaAction(tarefaId).then((r) => {
      if (!vivo) return
      if (r.erro) setErroLeitura(r.erro)
      else {
        setErroLeitura(null)
        setMensagens(r.mensagens ?? [])
        setEu(r.eu ?? null)
      }
    })
    return () => {
      vivo = false
    }
  }, [aberta, tarefaId])

  useEffect(() => {
    fim.current?.scrollIntoView({ block: "end" })
  }, [mensagens])

  const total = mensagens?.length ?? quantidade

  return (
    <Dialog open={aberta} onOpenChange={setAberta}>
      {!semBotao && (
        <DialogTrigger asChild>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            title={total ? `Conversa (${total} mensage${total === 1 ? "m" : "ns"})` : "Conversa da tarefa"}
            aria-label={total ? `Conversa da tarefa, ${total} mensage${total === 1 ? "m" : "ns"}` : "Conversa da tarefa"}
          >
            <MessageSquare />
            {total > 0 && <span className="text-xs tabular-nums">{total}</span>}
          </Button>
        </DialogTrigger>
      )}
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Conversa da tarefa</DialogTitle>
          <DialogDescription className="line-clamp-2">{titulo ?? "(sem título)"}</DialogDescription>
        </DialogHeader>

        <div className="max-h-[50vh] overflow-y-auto pr-1">
          {erroLeitura ? (
            <p className="text-destructive text-sm">{erroLeitura}</p>
          ) : mensagens === null ? (
            <p className="text-muted-foreground flex items-center gap-2 text-sm">
              <Loader2 className="size-4 animate-spin" /> Carregando…
            </p>
          ) : mensagens.length === 0 ? (
            <p className="text-muted-foreground py-4 text-center text-sm">
              Nenhuma mensagem ainda. Escreva para o responsável ou para quem pediu a tarefa; eles são avisados.
            </p>
          ) : (
            <ol className="grid gap-3" aria-label="Mensagens">
              {mensagens.map((m) => (
                <li
                  key={m.id}
                  className={`grid gap-1 rounded-md border p-2.5 text-sm ${m.autorId === eu ? "bg-primary/5 ml-6" : "mr-6"}`}
                >
                  <span className="text-muted-foreground flex flex-wrap justify-between gap-2 text-xs">
                    <span className="text-foreground font-medium">{m.autorId === eu ? "Você" : m.autorNome}</span>
                    <time dateTime={m.criadoEm}>{formatarDataHora(m.criadoEm)}</time>
                  </span>
                  {m.texto && <p className="whitespace-pre-wrap">{m.texto}</p>}
                  {m.anexoNome && (
                    m.anexoUrl ? (
                      <a href={m.anexoUrl} className="text-primary inline-flex items-center gap-1 text-xs hover:underline" target="_blank" rel="noreferrer">
                        <Paperclip className="size-3.5" />
                        {m.anexoNome}
                      </a>
                    ) : (
                      <span className="text-muted-foreground inline-flex items-center gap-1 text-xs">
                        <Paperclip className="size-3.5" />
                        {m.anexoNome} (indisponível)
                      </span>
                    )
                  )}
                </li>
              ))}
            </ol>
          )}
          <div ref={fim} />
        </div>

        {!erroLeitura && (
          <form
            action={enviar}
            className="grid gap-2 border-t pt-3"
            onSubmit={(e) => {
              const arquivo = (e.currentTarget.elements.namedItem("anexo") as HTMLInputElement | null)?.files?.[0]
              if (arquivo && arquivo.size > MAX_BYTES) {
                e.preventDefault()
                setErroArquivo("O anexo passa de 3 MB.")
              } else setErroArquivo(null)
            }}
          >
            <input type="hidden" name="tarefa_id" value={tarefaId} />
            <Label htmlFor={`msg-${tarefaId}`} className="sr-only">
              Mensagem
            </Label>
            <Textarea id={`msg-${tarefaId}`} name="texto" rows={3} maxLength={4000} placeholder="Escreva uma mensagem" />
            <div className="flex flex-wrap items-center justify-between gap-2">
              <label className="text-muted-foreground flex min-w-0 items-center gap-2 text-xs">
                <Paperclip className="size-3.5 shrink-0" />
                <input type="file" name="anexo" accept={ACEITA} aria-label="Anexo (até 3 MB)" className="max-w-56 text-xs" />
              </label>
              <Button type="submit" size="sm" disabled={enviando}>
                {enviando ? <Loader2 className="animate-spin" /> : <Send />}
                Enviar
              </Button>
            </div>
            {(erroArquivo ?? estado.erro) && <p className="text-destructive text-sm">{erroArquivo ?? estado.erro}</p>}
          </form>
        )}
      </DialogContent>
    </Dialog>
  )
}
