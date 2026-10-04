"use client"

import { useActionState } from "react"
import { Loader2, Send } from "lucide-react"

import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { ErroNoCampo } from "@/components/ui/erro-no-campo"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { ASSUNTOS_ATENDIMENTO } from "@/lib/atendimento-constantes"

import { abrirAtendimentoAction, responderAtendimentoPortalAction } from "./actions"

const SELECT =
  "border-input bg-background text-foreground min-h-11 w-full rounded-md border px-3 text-sm shadow-xs outline-none [color-scheme:light] dark:[color-scheme:dark]"

const ACEITA = ".pdf,.jpg,.jpeg,.png,.webp,.gif,.docx,.xlsx,.txt"

export function NovaSolicitacaoForm() {
  const [estado, action, enviando] = useActionState(abrirAtendimentoAction, {})
  return (
    <form action={action} className="grid gap-4">
      <ErroNoCampo estado={estado} />
      <div className="grid gap-1.5">
        <Label htmlFor="assunto">Assunto *</Label>
        <select id="assunto" name="assunto" required defaultValue="" className={SELECT}>
          <option value="" disabled>
            Escolha o assunto
          </option>
          {ASSUNTOS_ATENDIMENTO.map((a) => (
            <option key={a.chave} value={a.chave}>
              {a.rotulo} — {a.descricao}
            </option>
          ))}
        </select>
      </div>
      <div className="grid gap-1.5">
        <Label htmlFor="titulo">Resumo *</Label>
        <Input id="titulo" name="titulo" required maxLength={140} placeholder="Em poucas palavras, o que você precisa" className="min-h-11" />
      </div>
      <div className="grid gap-1.5">
        <Label htmlFor="texto">Conte com detalhes *</Label>
        <Textarea id="texto" name="texto" required rows={5} placeholder="O que aconteceu, desde quando, o que você espera da entidade" />
      </div>
      <div className="grid gap-1.5">
        <Label htmlFor="anexo">Anexo (opcional)</Label>
        <Input id="anexo" name="anexo" type="file" accept={ACEITA} className="min-h-11 pt-2.5" />
        <p className="text-muted-foreground text-xs">PDF, imagem, documento ou planilha, até 10 MB.</p>
      </div>
      {estado.erro && !estado.campo && (
        <Alert variant="destructive">
          <AlertDescription>{estado.erro}</AlertDescription>
        </Alert>
      )}
      <div>
        <Button type="submit" disabled={enviando} className="min-h-11 w-full sm:w-auto">
          {enviando ? <Loader2 className="animate-spin" /> : <Send />}
          Enviar solicitação
        </Button>
      </div>
    </form>
  )
}

export function ResponderForm({ atendimentoId }: { atendimentoId: string }) {
  const [estado, action, enviando] = useActionState(responderAtendimentoPortalAction, {})
  return (
    <form action={action} className="grid gap-3" key={estado.ok ? "ok" : "form"}>
      <input type="hidden" name="atendimento_id" value={atendimentoId} />
      <ErroNoCampo estado={estado} />
      <div className="grid gap-1.5">
        <Label htmlFor="texto">Sua mensagem</Label>
        <Textarea id="texto" name="texto" required rows={3} placeholder="Responda ou acrescente informações" />
      </div>
      <div className="grid gap-1.5">
        <Label htmlFor="anexo">Anexo (opcional)</Label>
        <Input id="anexo" name="anexo" type="file" accept={ACEITA} className="min-h-11 pt-2.5" />
      </div>
      {estado.erro && !estado.campo && (
        <Alert variant="destructive">
          <AlertDescription>{estado.erro}</AlertDescription>
        </Alert>
      )}
      {estado.ok && (
        <Alert className="border-success/40 text-success-fg">
          <AlertDescription>{estado.ok}</AlertDescription>
        </Alert>
      )}
      <div>
        <Button type="submit" disabled={enviando} className="min-h-11 w-full sm:w-auto">
          {enviando ? <Loader2 className="animate-spin" /> : <Send />}
          Enviar
        </Button>
      </div>
    </form>
  )
}
