"use client"

import { useActionState } from "react"
import { Loader2, Send } from "lucide-react"

import { CampoAnexo, useAnexo } from "@/components/atendimento/campo-anexo"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { ErroNoCampo } from "@/components/ui/erro-no-campo"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { SelectNativo } from "@/components/ui/select-nativo"
import { Textarea } from "@/components/ui/textarea"
import { ASSUNTOS_ATENDIMENTO } from "@/lib/atendimento-constantes"

import { abrirAtendimentoAction, responderAtendimentoPortalAction } from "./actions"

export function NovaSolicitacaoForm() {
  const [estado, action, enviando] = useActionState(abrirAtendimentoAction, {})
  const anexo = useAnexo()
  return (
    <form action={action} onSubmit={anexo.conferirEnvio} className="grid gap-4">
      <ErroNoCampo estado={estado} />
      <div className="grid gap-1.5">
        <Label htmlFor="assunto">Assunto *</Label>
        {/* min-h-11 como o Resumo logo abaixo: neste formulário os campos têm 44 px também no mouse. */}
        <SelectNativo id="assunto" name="assunto" required defaultValue="" className="min-h-11">
          <option value="" disabled>
            Escolha o assunto
          </option>
          {ASSUNTOS_ATENDIMENTO.map((a) => (
            <option key={a.chave} value={a.chave}>
              {a.rotulo} — {a.descricao}
            </option>
          ))}
        </SelectNativo>
      </div>
      <div className="grid gap-1.5">
        <Label htmlFor="titulo">Resumo *</Label>
        <Input id="titulo" name="titulo" required maxLength={140} placeholder="Em poucas palavras, o que você precisa" className="min-h-11" />
      </div>
      <div className="grid gap-1.5">
        <Label htmlFor="texto">Conte com detalhes *</Label>
        <Textarea id="texto" name="texto" required rows={5} placeholder="O que aconteceu, desde quando, o que você espera da entidade" />
      </div>
      <CampoAnexo anexo={anexo} />
      {estado.erro && !estado.campo && (
        <Alert variant="destructive">
          <AlertDescription>{estado.erro}</AlertDescription>
        </Alert>
      )}
      <div>
        <Button type="submit" disabled={enviando || anexo.preparando} className="min-h-11 w-full sm:w-auto">
          {enviando || anexo.preparando ? <Loader2 className="animate-spin" /> : <Send />}
          Enviar solicitação
        </Button>
      </div>
    </form>
  )
}

export function ResponderForm({ atendimentoId }: { atendimentoId: string }) {
  const [estado, action, enviando] = useActionState(responderAtendimentoPortalAction, {})
  const anexo = useAnexo()
  return (
    <form action={action} onSubmit={anexo.conferirEnvio} className="grid gap-3" key={estado.ok ? "ok" : "form"}>
      <input type="hidden" name="atendimento_id" value={atendimentoId} />
      <ErroNoCampo estado={estado} />
      <div className="grid gap-1.5">
        <Label htmlFor="texto">Sua mensagem</Label>
        <Textarea id="texto" name="texto" required rows={3} placeholder="Responda ou acrescente informações" />
      </div>
      <CampoAnexo anexo={anexo} />
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
        <Button type="submit" disabled={enviando || anexo.preparando} className="min-h-11 w-full sm:w-auto">
          {enviando || anexo.preparando ? <Loader2 className="animate-spin" /> : <Send />}
          Enviar
        </Button>
      </div>
    </form>
  )
}
