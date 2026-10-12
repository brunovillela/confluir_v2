"use client"

import { useActionState, useState } from "react"
import { CheckCheck, ChevronDown, Loader2, RotateCcw, Send } from "lucide-react"

import { AcaoVisualizacao } from "@/components/acao-visualizacao"
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

/** O que dizer embaixo do envio desligado, na visualização da gestão (A167). */
const NOTA_VISUALIZACAO = "Somente o próprio associado pode enviar."

/** Na visualização, nem o Enter dentro de um campo envia (como em formVisualizacao). */
function semEnvio(e: React.FormEvent<HTMLFormElement>) {
  e.preventDefault()
}

/** AAAA-MM-DD de hoje em São Paulo — a mesma conta do servidor (hojeSP). */
function hojeEmSaoPaulo(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date())
}

/** DD/MM do dia `dias` corridos depois de `hoje` (AAAA-MM-DD): o prazo que o servidor grava. */
function diaDoPrazo(hoje: string, dias: number): string {
  const d = new Date(`${hoje}T12:00:00Z`)
  d.setUTCDate(d.getUTCDate() + dias)
  return `${String(d.getUTCDate()).padStart(2, "0")}/${String(d.getUTCMonth() + 1).padStart(2, "0")}`
}

/**
 * Nova solicitação. `assuntoInicial`/`tituloInicial` vêm do link de outra
 * página (ex.: Contribuição → "Avisar o sindicato", A23). Quando o servidor
 * recusa, o que a pessoa escreveu volta nos campos (A50): o React limpa o
 * formulário ao fim da action e repõe os `defaultValue` — que passam a ser os
 * valores devolvidos. O <select> só lê o `defaultValue` ao montar, por isso o
 * formulário remonta (key) quando o assunto devolvido muda.
 *
 * Assunto (A99): a opção leva só o rótulo — "Rótulo — descrição" era cortado
 * pelo seletor do celular — e a descrição, com o prazo daquele assunto, vem
 * logo abaixo do campo. Os prazos de todos os assuntos ficam numa lista
 * recolhida, para quem quer comparar antes de escolher.
 *
 * Na visualização da gestão (`preview`), os campos funcionam e só o envio
 * fica desligado (A167): o atendente abre o seletor junto com o filiado.
 */
export function NovaSolicitacaoForm({
  assuntoInicial = null,
  tituloInicial = null,
  hoje,
  preview = false,
}: {
  assuntoInicial?: string | null
  tituloInicial?: string | null
  /** AAAA-MM-DD em São Paulo, do servidor — o prazo mostrado é o que ele vai gravar. */
  hoje?: string
  preview?: boolean
}) {
  const [estado, action, enviando] = useActionState(abrirAtendimentoAction, INICIAL)
  const anexo = useAnexo()
  const assuntoPadrao = estado.valores?.assunto ?? assuntoInicial ?? ""
  const [assunto, setAssunto] = useState(assuntoPadrao)
  const escolhido = assuntoAtendimento(assunto)
  const apoio = escolhido ? APOIO_ANEXO_ATENDIMENTO[escolhido.chave] : undefined
  const dia = hoje ?? hojeEmSaoPaulo()

  return (
    <form
      key={assuntoPadrao}
      action={preview ? undefined : action}
      onSubmit={preview ? semEnvio : anexo.conferirEnvio}
      className="grid gap-4"
    >
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
          aria-describedby="assunto-prazo"
        >
          <option value="" disabled>
            Escolha o assunto
          </option>
          {ASSUNTOS_ATENDIMENTO.map((a) => (
            <option key={a.chave} value={a.chave}>
              {a.rotulo}
            </option>
          ))}
        </SelectNativo>
        {/* A região "viva" existe desde o início, vazia sem assunto (nem
            escondida): criada ou exibida junto com o texto, o leitor de tela
            não anunciaria a troca. */}
        <p id="assunto-prazo" aria-live="polite" className="text-muted-foreground text-xs">
          {escolhido && (
            <>
              {escolhido.descricao}. Resposta em até{" "}
              <strong className="text-foreground font-medium">
                {escolhido.slaDias} dias corridos (até {diaDoPrazo(dia, escolhido.slaDias)})
              </strong>
              .
            </>
          )}
        </p>
        <details className="group">
          <summary className="text-muted-foreground hover:text-foreground inline-flex min-h-8 cursor-pointer list-none items-center gap-1 rounded-md text-xs underline-offset-4 outline-none hover:underline focus-visible:ring-3 focus-visible:ring-ring/50 pointer-coarse:min-h-11 [&::-webkit-details-marker]:hidden">
            Ver os prazos de cada assunto
            <ChevronDown className="size-3.5 transition-transform group-open:rotate-180" aria-hidden />
          </summary>
          <dl className="mt-1 grid gap-x-4 gap-y-1.5 rounded-lg border p-3 text-xs sm:grid-cols-[auto_1fr]">
            {ASSUNTOS_ATENDIMENTO.map((a) => (
              <div key={a.chave} className="contents">
                <dt className="font-medium">
                  {a.rotulo} · <span className="tabular-nums">{a.slaDias} dias</span>
                </dt>
                <dd className="text-muted-foreground max-sm:mb-1">{a.descricao}</dd>
              </div>
            ))}
          </dl>
        </details>
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
        <AcaoVisualizacao preview={preview} nota={NOTA_VISUALIZACAO}>
          <Button type="submit" disabled={enviando || anexo.preparando} className="min-h-11 w-full sm:w-auto">
            {enviando || anexo.preparando ? <Loader2 className="animate-spin" /> : <Send />}
            Enviar solicitação
          </Button>
        </AcaoVisualizacao>
      </div>
    </form>
  )
}

export function ResponderForm({ atendimentoId, preview = false }: { atendimentoId: string; preview?: boolean }) {
  const [estado, action, enviando] = useActionState(responderAtendimentoPortalAction, INICIAL)
  const anexo = useAnexo()
  return (
    // A key troca no sucesso (campo limpo de propósito); no erro o texto volta pelo defaultValue.
    <form
      action={preview ? undefined : action}
      onSubmit={preview ? semEnvio : anexo.conferirEnvio}
      className="grid gap-3"
      key={estado.ok ? "ok" : "form"}
    >
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
        <AcaoVisualizacao preview={preview} nota={NOTA_VISUALIZACAO}>
          <Button type="submit" disabled={enviando || anexo.preparando} className="min-h-11 w-full sm:w-auto">
            {enviando || anexo.preparando ? <Loader2 className="animate-spin" /> : <Send />}
            Enviar
          </Button>
        </AcaoVisualizacao>
      </div>
    </form>
  )
}

/** "Resolvido, pode encerrar" (A97) — com confirmação; dá para reabrir depois. */
export function EncerrarSolicitacaoForm({ atendimentoId, preview = false }: { atendimentoId: string; preview?: boolean }) {
  const [estado, action, enviando] = useActionState(encerrarAtendimentoPortalAction, INICIAL)
  return (
    <form
      action={preview ? undefined : action}
      onSubmit={(e) =>
        preview
          ? semEnvio(e)
          : confirmarEnvio(e, {
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
        <AcaoVisualizacao preview={preview} nota={NOTA_VISUALIZACAO}>
          <Button type="submit" variant="outline" disabled={enviando} className="min-h-11 w-full sm:w-auto">
            {enviando ? <Loader2 className="animate-spin" /> : <CheckCheck />}
            Resolvido, pode encerrar
          </Button>
        </AcaoVisualizacao>
      </div>
    </form>
  )
}

/** "Não resolveu — reabrir" (A97), dentro do prazo, com confirmação. */
export function ReabrirSolicitacaoForm({
  atendimentoId,
  ate,
  preview = false,
}: {
  atendimentoId: string
  ate: string
  preview?: boolean
}) {
  const [estado, action, enviando] = useActionState(reabrirAtendimentoPortalAction, INICIAL)
  return (
    <form
      action={preview ? undefined : action}
      onSubmit={(e) =>
        preview
          ? semEnvio(e)
          : confirmarEnvio(e, {
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
        <AcaoVisualizacao preview={preview} nota={NOTA_VISUALIZACAO}>
          <Button type="submit" variant="outline" disabled={enviando} className="min-h-11 w-full sm:w-auto">
            {enviando ? <Loader2 className="animate-spin" /> : <RotateCcw />}
            Reabrir a solicitação
          </Button>
        </AcaoVisualizacao>
      </div>
    </form>
  )
}
