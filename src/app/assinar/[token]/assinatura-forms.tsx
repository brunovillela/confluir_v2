"use client"

import { useActionState, useState } from "react"
import { Loader2, Mail, PenLine, XCircle } from "lucide-react"

import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"

import {
  assinarAction,
  recusarAction,
  solicitarCodigoAction,
  type EstadoAssinatura,
} from "./actions"

/**
 * Passos da assinatura: aceite → código de uso único → assinar. A recusa fica
 * num bloco separado, com motivo obrigatório. `destino` já vem mascarado:
 * "jo***@x.org" ou "Telegram (22) ••••-5432", conforme o canal do envio.
 */
export function AssinarForm({ token, email: destino }: { token: string; email: string }) {
  const [aceite, setAceite] = useState(false)
  const [codigo, pedirCodigo, pedindo] = useActionState<EstadoAssinatura, FormData>(
    solicitarCodigoAction,
    {}
  )
  const [assinatura, enviarAssinatura, assinando] = useActionState<EstadoAssinatura, FormData>(
    assinarAction,
    {}
  )
  const codigoEnviado = Boolean(codigo.codigoEnviadoPara)

  if (assinatura.concluido === "assinado") {
    return (
      <Alert className="border-success/40 text-success-fg">
        <AlertDescription>Assinatura registrada. Atualizando o documento…</AlertDescription>
      </Alert>
    )
  }

  return (
    <div className="grid gap-5">
      <label className="flex items-start gap-3 text-sm leading-relaxed">
        <Checkbox
          checked={aceite}
          onCheckedChange={(v) => setAceite(v === true)}
          className="mt-0.5"
          aria-describedby="texto-aceite"
        />
        <span id="texto-aceite">
          Li o ofício por inteiro e concordo em assiná-lo <strong>eletronicamente</strong>. Entendo
          que a assinatura, com o código de uso único que recebo em {destino}, tem a mesma validade
          da assinatura à mão entre as partes.
        </span>
      </label>

      <form action={pedirCodigo} className="grid gap-2">
        <input type="hidden" name="token" value={token} />
        <Button type="submit" variant={codigoEnviado ? "outline" : "default"} disabled={!aceite || pedindo}>
          {pedindo ? <Loader2 className="animate-spin" /> : <Mail />}
          {codigoEnviado ? "Enviar outro código" : `Enviar código para ${destino}`}
        </Button>
        {codigo.erro && <p className="text-destructive text-sm">{codigo.erro}</p>}
        {codigoEnviado && (
          <p className="text-muted-foreground text-sm">
            Enviamos um código de 6 dígitos para <strong>{codigo.codigoEnviadoPara}</strong>. Ele vale
            por 10 minutos.
          </p>
        )}
      </form>

      {codigoEnviado && (
        <form action={enviarAssinatura} className="grid gap-3">
          <input type="hidden" name="token" value={token} />
          {aceite && <input type="hidden" name="aceite" value="on" />}
          <div className="grid gap-1.5">
            <Label htmlFor="codigo">Código recebido</Label>
            <Input
              id="codigo"
              name="codigo"
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={6}
              placeholder="000000"
              className="h-12 max-w-48 text-center font-mono text-xl tracking-[0.4em]"
              required
            />
          </div>
          <Button type="submit" size="lg" disabled={!aceite || assinando}>
            {assinando ? <Loader2 className="animate-spin" /> : <PenLine />}
            Assinar o ofício
          </Button>
          {assinatura.erro && <p className="text-destructive text-sm">{assinatura.erro}</p>}
        </form>
      )}
    </div>
  )
}

export function RecusarForm({ token }: { token: string }) {
  const [aberto, setAberto] = useState(false)
  const [estado, enviar, pendente] = useActionState<EstadoAssinatura, FormData>(recusarAction, {})

  if (estado.concluido === "recusado") {
    return (
      <Alert>
        <AlertDescription>Recusa registrada. O remetente foi avisado.</AlertDescription>
      </Alert>
    )
  }
  if (!aberto) {
    return (
      <Button variant="ghost" className="text-destructive hover:text-destructive justify-self-start" onClick={() => setAberto(true)}>
        <XCircle />
        Recusar assinatura
      </Button>
    )
  }
  return (
    <form action={enviar} className="grid gap-3">
      <input type="hidden" name="token" value={token} />
      <div className="grid gap-1.5">
        <Label htmlFor="motivo">Por que você não vai assinar?</Label>
        <Textarea
          id="motivo"
          name="motivo"
          rows={3}
          placeholder="Ex.: o período de liberação do Fernando está errado."
          required
          minLength={5}
        />
        <p className="text-muted-foreground text-xs">
          O motivo vai para quem enviou, e o ofício volta para correção.
        </p>
      </div>
      <div className="flex flex-wrap gap-2">
        <Button type="submit" variant="destructive" disabled={pendente}>
          {pendente && <Loader2 className="animate-spin" />}
          Confirmar recusa
        </Button>
        <Button type="button" variant="ghost" onClick={() => setAberto(false)}>
          Voltar
        </Button>
      </div>
      {estado.erro && <p className="text-destructive text-sm">{estado.erro}</p>}
    </form>
  )
}
