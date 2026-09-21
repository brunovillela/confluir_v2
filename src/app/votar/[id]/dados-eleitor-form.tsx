"use client"

import { useActionState } from "react"
import { Loader2, ShieldCheck } from "lucide-react"

import { AcaoVisualizacao, formVisualizacao } from "@/components/acao-visualizacao"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"

import { informarDadosEleitor, type EstadoDadosEleitor } from "./actions"

/**
 * Primeiro acesso de quem entrou pelo e-mail corporativo: CPF, nome e
 * nascimento antes da cédula — é o que impede a mesma pessoa votar duas vezes.
 */
export function DadosEleitorForm({
  assembleiaId,
  preview = false,
}: {
  assembleiaId: string
  preview?: boolean
}) {
  const [estado, formAction, pendente] = useActionState<EstadoDadosEleitor, FormData>(
    informarDadosEleitor,
    {}
  )
  const v = estado.valores
  return (
    // `key`: depois de um erro o formulário remonta com o que foi digitado
    // (o React 19 limpa o formulário ao fim da action).
    <form
      key={estado.tentativa ?? 0}
      {...formVisualizacao(preview, formAction)}
      className="grid gap-4"
    >
      <input type="hidden" name="assembleia_id" value={assembleiaId} />
      <p className="text-muted-foreground text-sm">
        Antes de votar, confirme quem é você. Pedimos isto só no primeiro acesso: a sua
        empresa não envia o CPF, e é por ele que garantimos que cada pessoa vota uma vez.
      </p>
      <div className="grid gap-1.5">
        <Label htmlFor="cpf">CPF</Label>
        <Input
          id="cpf"
          name="cpf"
          inputMode="numeric"
          placeholder="000.000.000-00"
          defaultValue={v?.cpf ?? ""}
          required
        />
      </div>
      <div className="grid gap-1.5">
        <Label htmlFor="nome">Nome completo</Label>
        <Input id="nome" name="nome" autoComplete="name" defaultValue={v?.nome ?? ""} required />
      </div>
      <div className="grid gap-1.5">
        <Label htmlFor="nascimento">Data de nascimento</Label>
        <Input
          id="nascimento"
          name="nascimento"
          type="date"
          defaultValue={v?.nascimento ?? ""}
          required
        />
      </div>

      {estado.erro && (
        <Alert variant="destructive">
          <AlertDescription>{estado.erro}</AlertDescription>
        </Alert>
      )}

      <AcaoVisualizacao preview={preview} nota="Só o próprio eleitor informa os dados dele.">
        <Button type="submit" disabled={pendente} className="w-full">
          {pendente ? <Loader2 className="animate-spin" /> : <ShieldCheck />}
          Confirmar e ir para a cédula
        </Button>
      </AcaoVisualizacao>
      <p className="text-muted-foreground text-xs">
        Seus dados servem só para conferir a sua identidade nesta votação. O voto continua
        secreto: ninguém liga você às suas escolhas.
      </p>
    </form>
  )
}
