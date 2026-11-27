"use client"

import { useActionState, useState } from "react"
import { KeyRound, Loader2, PlugZap, Save, Trash2 } from "lucide-react"

import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { CampoSenha } from "@/components/ui/campo-senha"
import { confirmarEnvio } from "@/components/ui/confirmacao"
import { ErroNoCampo } from "@/components/ui/erro-no-campo"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { SelectNativo } from "@/components/ui/select-nativo"
import { type EstadoForm } from "@/lib/contas"
import { useEnvioFormulario } from "@/hooks/use-envio-formulario"

import { gerarTokenWebhookAction, removerContaEmailAction, salvarContaEmailAction, testarContaEmailAction } from "./actions"

/** Conta própria de e-mail da entidade (Gestão › E-mail, fase 4). */

function Retorno({ estado }: { estado: EstadoForm }) {
  if (estado.ok) {
    return (
      <Alert variant="success">
        <AlertDescription>{estado.ok}</AlertDescription>
      </Alert>
    )
  }
  if (estado.erro && !estado.campo) {
    return (
      <Alert variant="destructive">
        <AlertDescription>{estado.erro}</AlertDescription>
      </Alert>
    )
  }
  return null
}

export type ContaIniciais = {
  provedor: "brevo" | "resend" | null
  temChave: boolean
  chaveFinal: string | null
  remetenteEmail: string | null
  remetenteNome: string | null
  responderPara: string | null
  nomePadrao: string
  contatoPadrao: string | null
  podeGuardar: boolean
}

export function ContaForm({ inicial }: { inicial: ContaIniciais }) {
  const [estado, action, pendente] = useActionState<EstadoForm, FormData>(salvarContaEmailAction, {})
  const envio = useEnvioFormulario(action, estado, { manter: true })
  const [provedor, setProvedor] = useState<"brevo" | "resend">(inicial.provedor ?? "brevo")
  return (
    <form action={action} {...envio} className="grid gap-4">
      <ErroNoCampo estado={estado} />
      <div className="flex flex-wrap items-end gap-3">
        <div className="grid gap-1.5">
          <Label htmlFor="provedor" className="text-xs">
            Provedor
          </Label>
          <SelectNativo
            id="provedor"
            name="provedor"
            value={provedor}
            onChange={(e) => setProvedor(e.target.value === "resend" ? "resend" : "brevo")}
            className="w-36"
          >
            <option value="brevo">Brevo</option>
            <option value="resend">Resend</option>
          </SelectNativo>
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="chave" className="text-xs">
            {inicial.temChave ? `Trocar a chave (hoje termina em ${inicial.chaveFinal ?? "…"})` : "Chave de API"}
          </Label>
          <CampoSenha
            id="chave"
            name="chave"
            placeholder={provedor === "brevo" ? "xkeysib-…" : "re_…"}
            autoComplete="off"
            spellCheck={false}
            className="w-80"
            disabled={!inicial.podeGuardar}
          />
        </div>
      </div>
      <p className="text-muted-foreground -mt-2 text-xs">
        {provedor === "brevo"
          ? "No Brevo: SMTP & API → API Keys → Generate a new API key."
          : "No Resend: API Keys → Create API Key, com permissão Full access (a de só envio não deixa o sistema conferir os domínios)."}
        {inicial.temChave ? " Em branco, a chave cadastrada continua." : ""}
      </p>
      <div className="flex flex-wrap items-end gap-3">
        <div className="grid gap-1.5">
          <Label htmlFor="remetente_email" className="text-xs">
            Remetente
          </Label>
          <Input
            id="remetente_email"
            name="remetente_email"
            type="email"
            defaultValue={inicial.remetenteEmail ?? ""}
            placeholder="comunicacao@sindicato.org.br"
            className="w-72"
          />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="remetente_nome" className="text-xs">
            Nome que aparece
          </Label>
          <Input id="remetente_nome" name="remetente_nome" defaultValue={inicial.remetenteNome ?? ""} placeholder={inicial.nomePadrao} className="w-64" maxLength={80} />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="responder_para" className="text-xs">
            Respostas vão para
          </Label>
          <Input
            id="responder_para"
            name="responder_para"
            type="email"
            defaultValue={inicial.responderPara ?? ""}
            placeholder={inicial.contatoPadrao ?? "o e-mail de contato da entidade"}
            className="w-64"
          />
        </div>
      </div>
      <p className="text-muted-foreground -mt-2 text-xs">
        O remetente precisa ser de um domínio verificado na conta (registros de DNS no painel do provedor) ou, no Brevo, um remetente já validado — o
        sistema confere antes de salvar. Em branco, o nome e a resposta seguem o padrão da entidade.
      </p>
      <div>
        <Button type="submit" disabled={pendente || !inicial.podeGuardar}>
          {pendente ? <Loader2 className="animate-spin" /> : <Save />}
          {inicial.temChave ? "Salvar" : "Testar e salvar"}
        </Button>
      </div>
      <Retorno estado={estado} />
    </form>
  )
}

export function TestarContaBotao() {
  const [estado, action, pendente] = useActionState<EstadoForm>(testarContaEmailAction, {})
  return (
    <form action={action} className="grid gap-2">
      <div>
        <Button type="submit" size="sm" variant="outline" disabled={pendente}>
          {pendente ? <Loader2 className="animate-spin" /> : <PlugZap />}
          Testar agora
        </Button>
      </div>
      <Retorno estado={estado} />
    </form>
  )
}

export function RemoverContaBotao({ final }: { final: string | null }) {
  const [estado, action, pendente] = useActionState<EstadoForm>(removerContaEmailAction, {})
  return (
    <form
      action={action}
      onSubmit={(e) =>
        confirmarEnvio(
          e,
          `Remover a conta própria${final ? ` (chave terminada em ${final})` : ""}? Os e-mails voltam a sair pela conta da plataforma, com o remetente dela.`
        )
      }
      className="grid gap-2"
    >
      <div>
        <Button type="submit" size="sm" variant="ghost" disabled={pendente}>
          {pendente ? <Loader2 className="animate-spin" /> : <Trash2 />}
          Voltar para a conta da plataforma
        </Button>
      </div>
      <Retorno estado={estado} />
    </form>
  )
}

export function TokenWebhookBotao({ temToken, final, url }: { temToken: boolean; final: string | null; url: string }) {
  const [estado, action, pendente] = useActionState<EstadoForm & { token?: string }>(gerarTokenWebhookAction, {})
  return (
    <form action={action} className="grid gap-2">
      <div className="flex flex-wrap items-center gap-2">
        <Button type="submit" size="sm" variant="outline" disabled={pendente}>
          {pendente ? <Loader2 className="animate-spin" /> : <KeyRound />}
          {temToken ? "Gerar outro token" : "Gerar token"}
        </Button>
        {temToken && !estado.token && <span className="text-muted-foreground text-xs">Token atual termina em {final}.</span>}
      </div>
      {estado.token && (
        <div className="bg-muted grid gap-1 rounded-md p-3 text-xs">
          <span>No Brevo da entidade: Transactional → Settings → Webhook → Add a new webhook, com este endereço:</span>
          <code className="break-all">{url}</code>
          <span>
            Autenticação &quot;Token&quot;, com o valor: <code className="break-all">{estado.token}</code>
          </span>
          <span>Eventos: Delivered, Soft bounce, Deferred, Hard bounce, Invalid email, Blocked e Spam.</span>
          <span className="text-muted-foreground">Copie agora: ele não aparece de novo. Gerar outro faz o anterior parar de valer.</span>
        </div>
      )}
      {estado.erro && <span className="text-destructive text-xs">{estado.erro}</span>}
    </form>
  )
}
