"use client"

import { useActionState } from "react"
import { Loader2, ShieldCheck } from "lucide-react"

import { AcaoVisualizacao, formVisualizacao } from "@/components/acao-visualizacao"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"

import { confirmarCpfEleitor, type EstadoDadosEleitor } from "./actions"

/**
 * Confirmação do CPF quando a LISTA já traz o CPF do eleitor. Sem ela, quem
 * recebesse o link num e-mail cadastrado errado votaria sem responder nada.
 */
export function ConfirmarCpfForm({
  assembleiaId,
  preview = false,
}: {
  assembleiaId: string
  preview?: boolean
}) {
  const [estado, formAction, pendente] = useActionState<EstadoDadosEleitor, FormData>(
    confirmarCpfEleitor,
    {}
  )
  return (
    <form
      key={estado.tentativa ?? 0}
      {...formVisualizacao(preview, formAction)}
      className="grid gap-4"
    >
      <input type="hidden" name="assembleia_id" value={assembleiaId} />
      <p className="text-muted-foreground text-sm">
        Antes de votar, confirme quem é você: digite o seu CPF. Ele precisa ser o mesmo da
        lista de aptos — é assim que garantimos que ninguém vota no lugar de outra pessoa.
      </p>
      <div className="grid gap-1.5">
        <Label htmlFor="cpf">CPF</Label>
        <Input
          id="cpf"
          name="cpf"
          inputMode="numeric"
          placeholder="000.000.000-00"
          defaultValue={estado.valores?.cpf ?? ""}
          required
        />
      </div>
      {estado.erro && (
        <Alert variant="destructive">
          <AlertDescription>{estado.erro}</AlertDescription>
        </Alert>
      )}
      <AcaoVisualizacao preview={preview} nota="Na visualização, a cédula não é liberada.">
        <Button type="submit" disabled={pendente}>
          {pendente ? <Loader2 className="animate-spin" /> : <ShieldCheck />}
          Confirmar e ir para a cédula
        </Button>
      </AcaoVisualizacao>
      <p className="text-muted-foreground text-xs">
        Não é o seu CPF que está nesta lista? Este e-mail pode ter sido cadastrado errado pela
        empresa — avise o sindicato antes de votar.
      </p>
    </form>
  )
}
