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

export function EnviarParaAssinatura({
  oficioId,
  proximoNumero,
  numeroReservado,
  emailSugerido,
  assinante,
  telegram,
}: {
  oficioId: string
  proximoNumero: number
  numeroReservado: number | null
  emailSugerido: string | null
  assinante: string | null
  /** Telegram do assinante, quando ele vinculou a conta e confirmou o telefone. */
  telegram: { disponivel: boolean; telefone: string | null }
}) {
  const [estado, formAction, pendente] = useActionState<EstadoForm, FormData>(
    enviarParaAssinaturaAction,
    {}
  )
  // Sem e-mail conhecido e com Telegram pronto, o Telegram é o caminho natural.
  const [canal, setCanal] = useState<"email" | "telegram">(
    telegram.disponivel && !emailSugerido ? "telegram" : "email"
  )
  const porTelegram = canal === "telegram"

  return (
    <form action={formAction} className="grid gap-3">
      <input type="hidden" name="oficio_id" value={oficioId} />
      <input type="hidden" name="canal" value={canal} />
      {telegram.disponivel && (
        <div className="grid gap-1.5">
          <span className="text-sm font-medium">Enviar o convite e o código por</span>
          <div className="flex flex-wrap gap-2">
            {(["email", "telegram"] as const).map((opcao) => (
              <button
                key={opcao}
                type="button"
                onClick={() => setCanal(opcao)}
                className={`rounded-full border px-3 py-1 text-sm transition-colors ${
                  canal === opcao ? "border-primary bg-primary text-primary-foreground" : "hover:bg-muted"
                }`}
              >
                {opcao === "email" ? "E-mail" : `Telegram ${telegram.telefone ?? ""}`.trim()}
              </button>
            ))}
          </div>
        </div>
      )}
      <div className="flex flex-wrap items-end gap-3">
        <div className={`grid gap-1.5 ${porTelegram ? "hidden" : ""}`}>
          <Label htmlFor="email-assinante">E-mail de {assinante ?? "quem assina"}</Label>
          <Input
            id="email-assinante"
            name="email"
            type="email"
            required={!porTelegram}
            disabled={porTelegram}
            defaultValue={emailSugerido ?? ""}
            placeholder="nome@entidade.org.br"
            className="w-full sm:w-80"
          />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="numero-envio">Número</Label>
          <Input
            id="numero-envio"
            name="numero"
            type="number"
            min={1}
            defaultValue={numeroReservado ?? proximoNumero}
            className="w-28 tabular-nums"
          />
        </div>
        <Button type="submit" disabled={pendente}>
          {pendente ? <Loader2 className="animate-spin" /> : <Send />}
          Enviar para assinatura
        </Button>
      </div>
      {porTelegram && (
        <p className="text-muted-foreground text-sm">
          O convite e o código vão para o Telegram de {assinante ?? "quem assina"}
          {telegram.telefone ? ` (${telegram.telefone})` : ""}, pelo bot do Confluir.
        </p>
      )}
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

export function AcoesEnvioPendente({ oficioId }: { oficioId: string }) {
  const [reenvio, reenviar, reenviando] = useActionState<EstadoForm, FormData>(reenviarConviteAction, {})
  const [cancelamento, cancelar, cancelando] = useActionState<EstadoForm, FormData>(cancelarEnvioAction, {})
  const [confirmando, setConfirmando] = useState(false)

  return (
    <div className="grid gap-3">
      <div className="flex flex-wrap gap-2">
        <form action={reenviar}>
          <input type="hidden" name="oficio_id" value={oficioId} />
          <Button type="submit" variant="outline" size="sm" disabled={reenviando}>
            {reenviando ? <Loader2 className="animate-spin" /> : <Mail />}
            Reenviar e-mail
          </Button>
        </form>
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
      <Retorno estado={reenvio} />
      <Retorno estado={cancelamento} />
    </div>
  )
}
