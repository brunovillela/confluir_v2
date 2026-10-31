"use client"

import { useActionState } from "react"
import { Loader2, Trash2 } from "lucide-react"

import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { useEnvioFormulario } from "@/hooks/use-envio-formulario"
import {
  SIGILOS_DELIBERACAO,
  SITUACOES_DELIBERACAO,
  type SigiloDeliberacao,
} from "@/lib/deliberacoes-constantes"
import type { Deliberacao } from "@/lib/db/deliberacoes"

import { excluirDeliberacaoAction, salvarDeliberacaoAction } from "./deliberacao-actions"

const SELECT =
  "border-input bg-background text-foreground h-9 w-full truncate rounded-md border px-3 text-sm shadow-xs outline-none [color-scheme:light] dark:[color-scheme:dark]"

/** Registrar ou editar uma deliberação da ata. */
export function DeliberacaoForm({
  ataId,
  deliberacao,
  assuntos,
  cancelarHref,
  sigilos,
}: {
  ataId: string
  deliberacao?: Deliberacao
  assuntos: string[]
  cancelarHref: string
  /** Graus que o nível do usuário alcança — só esses são oferecidos. */
  sigilos: SigiloDeliberacao[]
}) {
  const [estado, formAction, pendente] = useActionState(salvarDeliberacaoAction, {})
  const envio = useEnvioFormulario(formAction, estado)
  const sufixo = deliberacao?.id ?? "nova"
  const opcoesSigilo = SIGILOS_DELIBERACAO.filter((s) => sigilos.includes(s.chave))
  const sigiloPadrao = deliberacao?.sigilo ?? (sigilos.includes("reservado") ? "reservado" : sigilos[sigilos.length - 1])

  return (
    <form action={formAction} {...envio} className="bg-muted/30 grid gap-4 rounded-md border p-4">
      <input type="hidden" name="ata_id" value={ataId} />
      {deliberacao && <input type="hidden" name="deliberacao_id" value={deliberacao.id} />}
      {estado.erro && (
        <Alert variant="destructive">
          <AlertDescription>{estado.erro}</AlertDescription>
        </Alert>
      )}

      <div className="grid gap-1.5">
        <Label htmlFor={`assunto-${sufixo}`}>Assunto</Label>
        <Input
          id={`assunto-${sufixo}`}
          name="assunto"
          required
          maxLength={200}
          list={`assuntos-${sufixo}`}
          defaultValue={deliberacao?.assunto ?? ""}
          placeholder="Ex.: Prestação de contas de 2025"
        />
        <datalist id={`assuntos-${sufixo}`}>
          {assuntos.map((a) => (
            <option key={a} value={a} />
          ))}
        </datalist>
      </div>

      <div className="grid gap-1.5">
        <Label htmlFor={`texto-${sufixo}`}>Teor da decisão</Label>
        <Textarea
          id={`texto-${sufixo}`}
          name="texto"
          rows={3}
          defaultValue={deliberacao?.texto ?? ""}
          placeholder="O que foi decidido, como consta da ata."
        />
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="grid gap-1.5">
          <Label htmlFor={`votacao-${sufixo}`}>Votação</Label>
          <Input
            id={`votacao-${sufixo}`}
            name="votacao"
            defaultValue={deliberacao?.votacao ?? ""}
            placeholder="Ex.: aprovada por unanimidade"
          />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor={`responsavel-${sufixo}`}>Responsável</Label>
          <Input
            id={`responsavel-${sufixo}`}
            name="responsavel"
            defaultValue={deliberacao?.responsavel ?? ""}
            placeholder="Quem cumpre a decisão"
          />
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <div className="grid gap-1.5">
          <Label htmlFor={`prazo-${sufixo}`}>Prazo</Label>
          <Input id={`prazo-${sufixo}`} name="prazo" type="date" defaultValue={deliberacao?.prazo ?? ""} />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor={`situacao-${sufixo}`}>Situação</Label>
          <select
            id={`situacao-${sufixo}`}
            name="situacao"
            className={SELECT}
            defaultValue={deliberacao?.situacao ?? "a_cumprir"}
          >
            {SITUACOES_DELIBERACAO.map((s) => (
              <option key={s.chave} value={s.chave}>
                {s.rotulo}
              </option>
            ))}
          </select>
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor={`sigilo-${sufixo}`}>Sigilo</Label>
          <select
            id={`sigilo-${sufixo}`}
            name="sigilo"
            className={SELECT}
            defaultValue={sigiloPadrao}
          >
            {opcoesSigilo.map((s) => (
              <option key={s.chave} value={s.chave}>
                {s.rotulo}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="flex gap-2">
        <Button type="submit" size="sm" disabled={pendente}>
          {pendente && <Loader2 className="animate-spin" />}
          {deliberacao ? "Salvar deliberação" : "Registrar deliberação"}
        </Button>
        <Button type="button" variant="ghost" size="sm" asChild>
          <a href={cancelarHref}>Cancelar</a>
        </Button>
      </div>
    </form>
  )
}

export function BotaoExcluirDeliberacao({ ataId, deliberacaoId }: { ataId: string; deliberacaoId: string }) {
  const [estado, formAction, pendente] = useActionState(excluirDeliberacaoAction, {})
  const envio = useEnvioFormulario(formAction, estado, {
    antes: (e) => {
      if (!window.confirm("Excluir esta deliberação? A ata continua como está.")) e.preventDefault()
    },
  })
  return (
    <form action={formAction} {...envio} className="inline">
      <input type="hidden" name="ata_id" value={ataId} />
      <input type="hidden" name="deliberacao_id" value={deliberacaoId} />
      {estado.erro && <span className="text-destructive mr-2 text-xs">{estado.erro}</span>}
      <Button type="submit" variant="ghost" size="sm" disabled={pendente} aria-label="Excluir deliberação">
        {pendente ? <Loader2 className="animate-spin" /> : <Trash2 className="text-destructive size-4" />}
      </Button>
    </form>
  )
}
