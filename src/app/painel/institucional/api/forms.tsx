"use client"

import { useActionState, useState } from "react"
import { Ban, Check, Copy, KeyRound, Loader2, RefreshCw, Save, Send, Trash2 } from "lucide-react"

import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { confirmarEnvio } from "@/components/ui/confirmacao"
import { ErroNoCampo } from "@/components/ui/erro-no-campo"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { EVENTOS_WEBHOOK } from "@/lib/api-publica-catalogo"
import { type EstadoForm } from "@/lib/contas"
import type { Webhook } from "@/lib/db/webhooks"

import { criarChaveAction, excluirWebhookAction, reenviarEntregaAction, revogarChaveAction, salvarWebhookAction, testarWebhookAction, type EstadoChave, type EstadoWebhook } from "./actions"

function Segredo({ valor, rotulo }: { valor: string; rotulo: string }) {
  const [copiado, setCopiado] = useState(false)
  return (
    <div className="grid gap-2 rounded-lg border p-3">
      <p className="text-sm font-medium">{rotulo}</p>
      <code className="bg-muted/40 rounded-md p-2 font-mono text-xs break-all">{valor}</code>
      <div>
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={async () => {
            try {
              await navigator.clipboard.writeText(valor)
              setCopiado(true)
              window.setTimeout(() => setCopiado(false), 2000)
            } catch {
              // sem clipboard: o texto acima é selecionável
            }
          }}
        >
          {copiado ? <Check /> : <Copy />}
          {copiado ? "Copiado" : "Copiar"}
        </Button>
      </div>
    </div>
  )
}

export function NovaChaveForm() {
  const [estado, action, pendente] = useActionState<EstadoChave, FormData>(criarChaveAction, {})
  return (
    <form action={action} className="grid gap-3" key={estado.token ?? "form"}>
      <ErroNoCampo estado={estado} />
      {estado.token ? (
        <>
          <Alert className="border-success/40 text-success-fg">
            <AlertDescription>{estado.ok}</AlertDescription>
          </Alert>
          <Segredo valor={estado.token} rotulo="Chave de API" />
        </>
      ) : (
        <div className="flex flex-wrap items-end gap-2">
          <div className="grid gap-1.5">
            <Label htmlFor="nome">Nome da chave</Label>
            <Input id="nome" name="nome" placeholder="Ex.: Contador, Power BI, Site" className="w-64" required maxLength={60} />
          </div>
          <Button type="submit" disabled={pendente}>
            {pendente ? <Loader2 className="animate-spin" /> : <KeyRound />}
            Criar chave
          </Button>
        </div>
      )}
      {estado.erro && !estado.campo && (
        <Alert variant="destructive">
          <AlertDescription>{estado.erro}</AlertDescription>
        </Alert>
      )}
    </form>
  )
}

export function RevogarChaveBotao({ chaveId, nome }: { chaveId: string; nome: string }) {
  const [estado, action, pendente] = useActionState<EstadoForm, FormData>(revogarChaveAction, {})
  return (
    <form action={action} className="flex items-center gap-2" onSubmit={(e) => confirmarEnvio(e, `Revogar a chave "${nome}"? Quem a usa deixa de acessar na hora.`)}>
      <input type="hidden" name="chave_id" value={chaveId} />
      <Button type="submit" size="sm" variant="ghost" disabled={pendente}>
        {pendente ? <Loader2 className="animate-spin" /> : <Ban />}
        Revogar
      </Button>
      {estado.erro && <span className="text-destructive text-xs">{estado.erro}</span>}
    </form>
  )
}

export function WebhookForm({ webhook }: { webhook: Webhook | null }) {
  const [estado, action, pendente] = useActionState<EstadoWebhook, FormData>(salvarWebhookAction, {})
  return (
    <form action={action} className="grid gap-3" key={estado.segredo ?? "form"}>
      {webhook && <input type="hidden" name="webhook_id" value={webhook.id} />}
      <ErroNoCampo estado={estado} />
      {estado.segredo && (
        <>
          <Alert className="border-success/40 text-success-fg">
            <AlertDescription>{estado.ok}</AlertDescription>
          </Alert>
          <Segredo valor={estado.segredo} rotulo="Segredo do webhook (para conferir a assinatura HMAC)" />
        </>
      )}
      <div className="grid gap-1.5">
        <Label htmlFor="url">URL (HTTPS)</Label>
        <Input id="url" name="url" type="url" defaultValue={webhook?.url ?? ""} placeholder="https://seu-sistema.exemplo.com/confluir" required />
      </div>
      <div className="grid gap-1.5">
        <Label htmlFor="descricao">Descrição (opcional)</Label>
        <Input id="descricao" name="descricao" defaultValue={webhook?.descricao ?? ""} placeholder="Ex.: integração com o sistema contábil" maxLength={120} />
      </div>
      <fieldset className="grid gap-1.5">
        <legend className="text-sm font-medium">Eventos</legend>
        <div className="grid gap-1 sm:grid-cols-2">
          {EVENTOS_WEBHOOK.map((e) => (
            <label key={e.chave} className="flex items-start gap-2 text-sm">
              <input type="checkbox" name="eventos" value={e.chave} defaultChecked={webhook ? webhook.eventos.includes(e.chave) : e.chave !== "teste"} className="mt-1 size-4" />
              <span>
                {e.rotulo}
                <span className="text-muted-foreground block text-xs">
                  {e.chave} · {e.descricao}
                </span>
              </span>
            </label>
          ))}
        </div>
      </fieldset>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" name="ativo" defaultChecked={webhook?.ativo ?? true} className="size-4" />
        Ativo
      </label>
      {estado.erro && !estado.campo && (
        <Alert variant="destructive">
          <AlertDescription>{estado.erro}</AlertDescription>
        </Alert>
      )}
      {estado.ok && !estado.segredo && (
        <Alert className="border-success/40 text-success-fg">
          <AlertDescription>{estado.ok}</AlertDescription>
        </Alert>
      )}
      <div>
        <Button type="submit" disabled={pendente}>
          {pendente ? <Loader2 className="animate-spin" /> : <Save />}
          {webhook ? "Salvar" : "Criar webhook"}
        </Button>
      </div>
    </form>
  )
}

export function ExcluirWebhookBotao({ webhookId }: { webhookId: string }) {
  const [estado, action, pendente] = useActionState<EstadoForm, FormData>(excluirWebhookAction, {})
  return (
    <form action={action} className="flex items-center gap-2" onSubmit={(e) => confirmarEnvio(e, "Excluir este webhook e o histórico de entregas dele?")}>
      <input type="hidden" name="webhook_id" value={webhookId} />
      <Button type="submit" size="sm" variant="ghost" disabled={pendente}>
        {pendente ? <Loader2 className="animate-spin" /> : <Trash2 />}
        Excluir
      </Button>
      {estado.erro && <span className="text-destructive text-xs">{estado.erro}</span>}
    </form>
  )
}

export function TestarWebhooksBotao() {
  const [estado, action, pendente] = useActionState<EstadoForm, FormData>(testarWebhookAction, {})
  return (
    <form action={action} className="flex flex-wrap items-center gap-2">
      <Button type="submit" size="sm" variant="outline" disabled={pendente}>
        {pendente ? <Loader2 className="animate-spin" /> : <Send />}
        Enviar evento de teste
      </Button>
      {estado.erro && <span className="text-destructive text-xs">{estado.erro}</span>}
      {estado.ok && <span className="text-success-fg text-xs">{estado.ok}</span>}
    </form>
  )
}

export function ReenviarEntregaBotao({ entregaId }: { entregaId: string }) {
  const [estado, action, pendente] = useActionState<EstadoForm, FormData>(reenviarEntregaAction, {})
  return (
    <form action={action} className="flex items-center gap-2">
      <input type="hidden" name="entrega_id" value={entregaId} />
      <Button type="submit" size="sm" variant="ghost" disabled={pendente}>
        {pendente ? <Loader2 className="animate-spin" /> : <RefreshCw />}
        Reenviar
      </Button>
      {estado.erro && <span className="text-destructive text-xs">{estado.erro}</span>}
      {estado.ok && <span className="text-success-fg text-xs">{estado.ok}</span>}
    </form>
  )
}
