"use client"

import { useActionState, useState } from "react"
import { CheckCheck, Loader2, RotateCcw, Send } from "lucide-react"

import { CampoAnexo, useAnexo } from "@/components/atendimento/campo-anexo"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { confirmarEnvio } from "@/components/ui/confirmacao"
import { ErroNoCampo } from "@/components/ui/erro-no-campo"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { SelectNativo } from "@/components/ui/select-nativo"
import { Textarea } from "@/components/ui/textarea"
import {
  APOIO_ANEXO_ATENDIMENTO,
  ASSUNTOS_ATENDIMENTO,
  PRAZO_REABRIR_DIAS,
  assuntoAtendimento,
  type EstadoFormAtendimento,
} from "@/lib/atendimento-constantes"

import {
  abrirAtendimentoAction,
  encerrarAtendimentoPortalAction,
  reabrirAtendimentoPortalAction,
  responderAtendimentoPortalAction,
} from "./actions"

const INICIAL: EstadoFormAtendimento = {}

/**
 * Nova solicitação. `assuntoInicial`/`tituloInicial` vêm do link de outra
 * página (ex.: Contribuição → "Avisar o sindicato", A23). Quando o servidor
 * recusa, o que a pessoa escreveu volta nos campos (A50): o React limpa o
 * formulário ao fim da action e repõe os `defaultValue` — que passam a ser os
 * valores devolvidos. O <select> só lê o `defaultValue` ao montar, por isso o
 * formulário remonta (key) quando o assunto devolvido muda.
 */
export function NovaSolicitacaoForm({
  assuntoInicial = null,
  tituloInicial = null,
}: {
  assuntoInicial?: string | null
  tituloInicial?: string | null
}) {
  const [estado, action, enviando] = useActionState(abrirAtendimentoAction, INICIAL)
  const anexo = useAnexo()
  const assuntoPadrao = estado.valores?.assunto ?? assuntoInicial ?? ""
  const [assunto, setAssunto] = useState(assuntoPadrao)
  const escolhido = assuntoAtendimento(assunto)
  const apoio = escolhido ? APOIO_ANEXO_ATENDIMENTO[escolhido.chave] : undefined

  return (
    <form key={assuntoPadrao} action={action} onSubmit={anexo.conferirEnvio} className="grid gap-4">
      <ErroNoCampo estado={estado} />
      <div className="grid gap-1.5">
        <Label htmlFor="assunto">Assunto *</Label>
        {/* min-h-11 como o Resumo logo abaixo: neste formulário os campos têm 44 px também no mouse. */}
        <SelectNativo
          id="assunto"
          name="assunto"
          required
          defaultValue={assuntoPadrao}
          onChange={(e) => setAssunto(e.currentTarget.value)}
          className="min-h-11"
          aria-describedby={escolhido ? "assunto-prazo" : undefined}
        >
          <option value="" disabled>
            Escolha o assunto
          </option>
          {ASSUNTOS_ATENDIMENTO.map((a) => (
            <option key={a.chave} value={a.chave}>
              {a.rotulo} — {a.descricao}
            </option>
          ))}
        </SelectNativo>
        {escolhido && (
          <p id="assunto-prazo" className="text-muted-foreground text-xs">
            Prazo de resposta: {escolhido.slaDias} dias.
          </p>
        )}
      </div>
      <div className="grid gap-1.5">
        <Label htmlFor="titulo">Resumo *</Label>
        <Input
          id="titulo"
          name="titulo"
          required
          minLength={5}
          maxLength={140}
          defaultValue={estado.valores?.titulo ?? tituloInicial ?? undefined}
          placeholder="Em poucas palavras, o que você precisa"
          className="min-h-11"
        />
      </div>
      <div className="grid gap-1.5">
        <Label htmlFor="texto">Conte com detalhes *</Label>
        <Textarea
          id="texto"
          name="texto"
          required
          minLength={10}
          rows={5}
          defaultValue={estado.valores?.texto}
          placeholder="O que aconteceu, desde quando, o que você espera da entidade"
        />
      </div>
      <CampoAnexo anexo={anexo} apoio={apoio} />
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
  const [estado, action, enviando] = useActionState(responderAtendimentoPortalAction, INICIAL)
  const anexo = useAnexo()
  return (
    // A key troca no sucesso (campo limpo de propósito); no erro o texto volta pelo defaultValue.
    <form action={action} onSubmit={anexo.conferirEnvio} className="grid gap-3" key={estado.ok ? "ok" : "form"}>
      <input type="hidden" name="atendimento_id" value={atendimentoId} />
      <ErroNoCampo estado={estado} />
      <div className="grid gap-1.5">
        <Label htmlFor="texto">Sua mensagem</Label>
        <Textarea
          id="texto"
          name="texto"
          required
          minLength={2}
          rows={3}
          defaultValue={estado.valores?.texto}
          placeholder="Responda ou acrescente informações"
        />
      </div>
      <CampoAnexo anexo={anexo} />
      {estado.erro && !estado.campo && (
        <Alert variant="destructive">
          <AlertDescription>{estado.erro}</AlertDescription>
        </Alert>
      )}
      {estado.ok && (
        <Alert variant="success">
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

/** "Resolvido, pode encerrar" (A97) — com confirmação; dá para reabrir depois. */
export function EncerrarSolicitacaoForm({ atendimentoId }: { atendimentoId: string }) {
  const [estado, action, enviando] = useActionState(encerrarAtendimentoPortalAction, INICIAL)
  return (
    <form
      action={action}
      onSubmit={(e) =>
        confirmarEnvio(e, {
          titulo: "Marcar como resolvida?",
          descricao: `A solicitação é concluída e a entidade é avisada. Se precisar, você pode reabri-la por até ${PRAZO_REABRIR_DIAS} dias.`,
          confirmar: "Resolvido, pode encerrar",
          destrutivo: false,
        })
      }
      className="grid gap-2"
    >
      <input type="hidden" name="atendimento_id" value={atendimentoId} />
      <p className="text-muted-foreground text-sm">O assunto já se resolveu? Avise a entidade e encerre a solicitação.</p>
      {estado.erro && (
        <Alert variant="destructive">
          <AlertDescription>{estado.erro}</AlertDescription>
        </Alert>
      )}
      <div>
        <Button type="submit" variant="outline" disabled={enviando} className="min-h-11 w-full sm:w-auto">
          {enviando ? <Loader2 className="animate-spin" /> : <CheckCheck />}
          Resolvido, pode encerrar
        </Button>
      </div>
    </form>
  )
}

/** "Não resolveu — reabrir" (A97), dentro do prazo, com confirmação. */
export function ReabrirSolicitacaoForm({ atendimentoId, ate }: { atendimentoId: string; ate: string }) {
  const [estado, action, enviando] = useActionState(reabrirAtendimentoPortalAction, INICIAL)
  return (
    <form
      action={action}
      onSubmit={(e) =>
        confirmarEnvio(e, {
          titulo: "Reabrir a solicitação?",
          descricao: "A entidade é avisada e volta a cuidar dela. Depois, conte em uma mensagem o que ainda falta.",
          confirmar: "Reabrir",
        })
      }
      className="grid gap-2"
    >
      <input type="hidden" name="atendimento_id" value={atendimentoId} />
      <p className="text-muted-foreground text-sm">
        O assunto não se resolveu? Você pode reabrir esta solicitação até {ate}, com a conversa inteira.
      </p>
      {estado.erro && (
        <Alert variant="destructive">
          <AlertDescription>{estado.erro}</AlertDescription>
        </Alert>
      )}
      <div>
        <Button type="submit" variant="outline" disabled={enviando} className="min-h-11 w-full sm:w-auto">
          {enviando ? <Loader2 className="animate-spin" /> : <RotateCcw />}
          Reabrir a solicitação
        </Button>
      </div>
    </form>
  )
}
