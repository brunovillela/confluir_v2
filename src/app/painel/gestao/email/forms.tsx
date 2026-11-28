"use client"

import { useActionState } from "react"
import { Ban, Loader2, Save, Undo2 } from "lucide-react"

import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { confirmarEnvio } from "@/components/ui/confirmacao"
import { ErroNoCampo } from "@/components/ui/erro-no-campo"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { type EstadoForm } from "@/lib/contas"
import { useEnvioFormulario } from "@/hooks/use-envio-formulario"

import { bloquearEnderecoAction, liberarEnderecoAction, salvarControlesEmailAction } from "./actions"

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

const inteiro = new Intl.NumberFormat("pt-BR")

export type ControlesIniciais = {
  modulos: { slug: string; titulo: string; essenciais: number; total: number; desligado: boolean; noMes: number }[]
  limiteMensal: number | null
  bloquearNoLimite: boolean
  enviadosNoMes: number
  departamentos: { id: string; nome: string; cota: number | null; noMes: number }[]
}

export function ControlesForm({ inicial }: { inicial: ControlesIniciais }) {
  const [estado, action, pendente] = useActionState<EstadoForm, FormData>(salvarControlesEmailAction, {})
  const envio = useEnvioFormulario(action, estado, { manter: true })
  return (
    <form action={action} {...envio} className="grid gap-6">
      <ErroNoCampo estado={estado} />

      <fieldset className="grid gap-2">
        <legend className="mb-1 text-sm font-medium">E-mail por módulo</legend>
        <p className="text-muted-foreground text-xs">
          Desmarcado, o módulo para de mandar e-mail. Os envios essenciais (acesso, códigos de confirmação, votação e assinatura eletrônica) continuam
          saindo sempre.
        </p>
        <div className="grid gap-x-6 gap-y-2 sm:grid-cols-2">
          {inicial.modulos.map((m) => (
            <div key={m.slug} className="flex items-start gap-2">
              <input type="hidden" name={`presente:${m.slug}`} value="1" />
              <input id={`mod-${m.slug}`} type="checkbox" name={`mod:${m.slug}`} defaultChecked={!m.desligado} className="mt-0.5" />
              <label htmlFor={`mod-${m.slug}`} className="text-sm leading-tight">
                {m.titulo}
                <span className="text-muted-foreground block text-xs">
                  {inteiro.format(m.noMes)} neste mês
                  {m.essenciais === m.total ? " · todos essenciais" : m.essenciais ? ` · ${m.essenciais} de ${m.total} essenciais` : ""}
                </span>
              </label>
            </div>
          ))}
        </div>
      </fieldset>

      <fieldset className="grid gap-3">
        <legend className="mb-1 text-sm font-medium">Teto mensal</legend>
        <div className="flex flex-wrap items-end gap-4">
          <div className="grid gap-1.5">
            <Label htmlFor="limite_mensal" className="text-xs">
              E-mails por mês
            </Label>
            <Input id="limite_mensal" name="limite_mensal" inputMode="numeric" defaultValue={inicial.limiteMensal ?? ""} placeholder="sem teto" className="w-36" />
          </div>
          <div className="flex items-center gap-2 pb-2">
            <input id="bloquear_no_limite" type="checkbox" name="bloquear_no_limite" defaultChecked={inicial.bloquearNoLimite} />
            <Label htmlFor="bloquear_no_limite" className="text-sm font-normal">
              Parar ao atingir o teto ou a cota
            </Label>
          </div>
        </div>
        <p className="text-muted-foreground text-xs">
          {inteiro.format(inicial.enviadosNoMes)} e-mails neste mês
          {inicial.limiteMensal ? ` — ${Math.round((inicial.enviadosNoMes / inicial.limiteMensal) * 100)}% do teto` : ""}. A 80% e a 100% a Gestão (e, na
          cota, o coordenador do departamento) recebe um aviso. Desmarcado, o teto e as cotas só avisam; marcado, os e-mails não essenciais param até o
          dia 1º. Use o limite do plano do provedor como referência.
        </p>
      </fieldset>

      {inicial.departamentos.length > 0 && (
        <fieldset className="grid gap-2">
          <legend className="mb-1 text-sm font-medium">Cotas por departamento</legend>
          <p className="text-muted-foreground text-xs">Conta pelo departamento de quem disparou o e-mail. Envios automáticos não entram em cota nenhuma.</p>
          <ul className="divide-y">
            {inicial.departamentos.map((d) => (
              <li key={d.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                <label htmlFor={`cota-${d.id}`} className="text-sm">
                  {d.nome}
                  <span className={`block text-xs ${d.cota && d.noMes >= d.cota * 0.8 ? "text-warning-fg" : "text-muted-foreground"}`}>
                    {inteiro.format(d.noMes)} neste mês{d.cota ? ` · ${Math.round((d.noMes / d.cota) * 100)}% da cota` : ""}
                  </span>
                </label>
                <Input id={`cota-${d.id}`} name={`cota:${d.id}`} inputMode="numeric" defaultValue={d.cota ?? ""} placeholder="sem cota" className="w-32" />
              </li>
            ))}
          </ul>
        </fieldset>
      )}

      <div>
        <Button type="submit" disabled={pendente}>
          {pendente ? <Loader2 className="animate-spin" /> : <Save />}
          Salvar controles
        </Button>
      </div>
      <Retorno estado={estado} />
    </form>
  )
}

export function BloquearForm() {
  const [estado, action, pendente] = useActionState<EstadoForm, FormData>(bloquearEnderecoAction, {})
  const envio = useEnvioFormulario(action, estado)
  return (
    <form action={action} {...envio} className="grid gap-3">
      <ErroNoCampo estado={estado} />
      <div className="flex flex-wrap items-end gap-3">
        <div className="grid gap-1.5">
          <Label htmlFor="endereco" className="text-xs">
            Bloquear o endereço
          </Label>
          <Input id="endereco" name="endereco" type="email" placeholder="nome@empresa.com" className="w-64" autoComplete="off" />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="motivo" className="text-xs">
            Motivo (opcional)
          </Label>
          <Input id="motivo" name="motivo" placeholder="ex.: pediu para não receber" className="w-64" maxLength={200} />
        </div>
        <Button type="submit" variant="outline" disabled={pendente}>
          {pendente ? <Loader2 className="animate-spin" /> : <Ban />}
          Bloquear
        </Button>
      </div>
      <Retorno estado={estado} />
    </form>
  )
}

export function LiberarBotao({ id, endereco }: { id: string; endereco: string }) {
  const [estado, action, pendente] = useActionState<EstadoForm, FormData>(liberarEnderecoAction.bind(null, id), {})
  return (
    <form
      action={action}
      onSubmit={(e) => confirmarEnvio(e, `Liberar ${endereco}? Ele volta a receber os e-mails do sistema. Se o endereço ainda não existir, a rejeição vai se repetir e ele volta a ser bloqueado.`)}
      className="grid justify-items-end gap-1"
    >
      <Button type="submit" size="sm" variant="ghost" disabled={pendente}>
        {pendente ? <Loader2 className="animate-spin" /> : <Undo2 />}
        Liberar
      </Button>
      {estado.erro && <span className="text-destructive text-xs">{estado.erro}</span>}
    </form>
  )
}
