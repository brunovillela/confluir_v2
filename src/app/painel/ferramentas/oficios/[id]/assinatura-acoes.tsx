"use client"

import { useActionState, useState } from "react"
import { Ban, FileUp, Loader2, Mail, Send } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { type EstadoForm } from "@/lib/contas"

import {
  anexarAssinadoAMaoAction,
  cancelarEnvioAction,
  enviarParaAssinaturaAction,
  reenviarConviteAction,
} from "../actions"

function Retorno({ estado }: { estado: EstadoForm }) {
  if (estado.erro) return <p className="text-destructive w-full text-sm">{estado.erro}</p>
  if (estado.ok) return <p className="text-success-fg w-full text-sm">{estado.ok}</p>
  return null
}

/** Quem assina e o que se sabe para mandar o convite a cada um. */
export type AssinanteParaEnvio = {
  integranteId: string
  nome: string | null
  cargo: string | null
  emailSugerido: string | null
  /** Telegram, quando a pessoa vinculou a conta e confirmou o telefone. */
  telegram: { disponivel: boolean; telefone: string | null }
}

/** Canal e e-mail de um assinante (campos canal_<id> e email_<id>). */
function DestinoDoAssinante({ a, varios }: { a: AssinanteParaEnvio; varios: boolean }) {
  // Sem e-mail conhecido e com Telegram pronto, o Telegram é o caminho natural.
  const [canal, setCanal] = useState<"email" | "telegram">(
    a.telegram.disponivel && !a.emailSugerido ? "telegram" : "email"
  )
  const porTelegram = canal === "telegram"
  const id = `email-${a.integranteId}`
  return (
    <div className={varios ? "grid gap-2 rounded-md border px-3 py-2.5" : "grid gap-2"}>
      <input type="hidden" name="integrante_id" value={a.integranteId} />
      <input type="hidden" name={`canal_${a.integranteId}`} value={canal} />
      {varios && (
        <p className="text-sm font-medium">
          {a.nome ?? "Assinante"}
          {a.cargo ? <span className="text-muted-foreground font-normal"> — {a.cargo}</span> : null}
        </p>
      )}
      {a.telegram.disponivel && (
        <div className="grid gap-1.5">
          <span className="text-sm">Enviar o convite e o código por</span>
          <div className="flex flex-wrap gap-2">
            {(["email", "telegram"] as const).map((opcao) => (
              <button
                key={opcao}
                type="button"
                onClick={() => setCanal(opcao)}
                aria-pressed={canal === opcao}
                className={`rounded-full border px-3 py-1 text-sm transition-colors ${
                  canal === opcao ? "border-primary bg-primary text-primary-foreground" : "hover:bg-muted"
                }`}
              >
                {opcao === "email" ? "E-mail" : `Telegram ${a.telegram.telefone ?? ""}`.trim()}
              </button>
            ))}
          </div>
        </div>
      )}
      {porTelegram ? (
        <p className="text-muted-foreground text-sm">
          O convite e o código vão para o Telegram de {a.nome ?? "quem assina"}
          {a.telegram.telefone ? ` (${a.telegram.telefone})` : ""}, pelo bot do Confluir.
        </p>
      ) : (
        <div className="grid gap-1.5">
          <Label htmlFor={id}>E-mail de {a.nome ?? "quem assina"}</Label>
          <Input
            id={id}
            name={`email_${a.integranteId}`}
            type="email"
            required
            defaultValue={a.emailSugerido ?? ""}
            placeholder="nome@entidade.org.br"
            className="w-full sm:w-80"
          />
        </div>
      )}
    </div>
  )
}

export function EnviarParaAssinatura({
  oficioId,
  proximoNumero,
  numeroReservado,
  assinantes,
}: {
  oficioId: string
  proximoNumero: number
  numeroReservado: number | null
  assinantes: AssinanteParaEnvio[]
}) {
  const [estado, formAction, pendente] = useActionState<EstadoForm, FormData>(
    enviarParaAssinaturaAction,
    {}
  )
  const varios = assinantes.length > 1

  return (
    <form action={formAction} className="grid gap-3">
      <input type="hidden" name="oficio_id" value={oficioId} />
      <div className={varios ? "grid gap-2 md:grid-cols-2" : "grid"}>
        {assinantes.map((a) => (
          <DestinoDoAssinante key={a.integranteId} a={a} varios={varios} />
        ))}
      </div>
      <div className="flex flex-wrap items-end gap-3">
        {/* Número não se edita: é o último do ano + 1, atribuído no envio. */}
        <div className="grid gap-1.5">
          <span className="text-sm font-medium">Número</span>
          <span className="border-input bg-muted/40 flex h-9 items-center rounded-md border px-3 text-sm tabular-nums">
            {numeroReservado ?? proximoNumero}
            {numeroReservado == null && (
              <span className="text-muted-foreground ml-1 text-xs">(previsto)</span>
            )}
          </span>
        </div>
        <Button type="submit" disabled={pendente}>
          {pendente ? <Loader2 className="animate-spin" /> : <Send />}
          {varios ? `Enviar aos ${assinantes.length} assinantes` : "Enviar para assinatura"}
        </Button>
      </div>
      <Retorno estado={estado} />
    </form>
  )
}

/** Reenvia o convite a um assinante que ainda não assinou. */
export function ReenviarConvite({ oficioId, assinaturaId }: { oficioId: string; assinaturaId: string }) {
  const [estado, reenviar, reenviando] = useActionState<EstadoForm, FormData>(reenviarConviteAction, {})
  return (
    <form action={reenviar} className="grid justify-items-start gap-1">
      <input type="hidden" name="oficio_id" value={oficioId} />
      <input type="hidden" name="assinatura_id" value={assinaturaId} />
      <Button type="submit" variant="outline" size="sm" disabled={reenviando}>
        {reenviando ? <Loader2 className="animate-spin" /> : <Mail />}
        Reenviar convite
      </Button>
      <Retorno estado={estado} />
    </form>
  )
}

/** Ofício assinado à mão: o PDF digitalizado fica junto do ofício. */
export function AnexarAssinadoAMao({
  oficioId,
  temArquivo,
}: {
  oficioId: string
  temArquivo: boolean
}) {
  const [estado, formAction, pendente] = useActionState<EstadoForm, FormData>(
    anexarAssinadoAMaoAction,
    {}
  )
  return (
    <form action={formAction} className="grid gap-3">
      <input type="hidden" name="oficio_id" value={oficioId} />
      <div className="flex flex-wrap items-end gap-3">
        <div className="grid gap-1.5">
          <Label htmlFor="arquivo-assinado">
            {temArquivo ? "Substituir o PDF assinado" : "PDF assinado e digitalizado"}
          </Label>
          <Input
            id="arquivo-assinado"
            name="arquivo"
            type="file"
            accept="application/pdf"
            required
            className="w-full sm:w-96"
          />
        </div>
        <Button type="submit" variant="outline" disabled={pendente}>
          {pendente ? <Loader2 className="animate-spin" /> : <FileUp />}
          Anexar
        </Button>
      </div>
      <Retorno estado={estado} />
    </form>
  )
}

/** Cancela o envio inteiro (todos os convites que ainda não foram assinados). */
export function AcoesEnvioPendente({ oficioId }: { oficioId: string }) {
  const [cancelamento, cancelar, cancelando] = useActionState<EstadoForm, FormData>(cancelarEnvioAction, {})
  const [confirmando, setConfirmando] = useState(false)

  return (
    <div className="grid gap-3">
      <div className="flex flex-wrap gap-2">
        {!confirmando && (
          <Button variant="ghost" size="sm" className="text-destructive hover:text-destructive" onClick={() => setConfirmando(true)}>
            <Ban />
            Cancelar envio
          </Button>
        )}
      </div>
      {confirmando && (
        <form action={cancelar} className="flex flex-wrap items-end gap-2">
          <input type="hidden" name="oficio_id" value={oficioId} />
          <div className="grid gap-1.5">
            <Label htmlFor="motivo-cancelamento">Motivo (fica na trilha)</Label>
            <Input id="motivo-cancelamento" name="motivo" placeholder="Ex.: corrigir o destinatário" className="w-full sm:w-80" />
          </div>
          <Button type="submit" variant="destructive" size="sm" disabled={cancelando}>
            {cancelando && <Loader2 className="animate-spin" />}
            Confirmar cancelamento
          </Button>
          <Button type="button" variant="ghost" size="sm" onClick={() => setConfirmando(false)}>
            Voltar
          </Button>
        </form>
      )}
      <Retorno estado={cancelamento} />
    </div>
  )
}
