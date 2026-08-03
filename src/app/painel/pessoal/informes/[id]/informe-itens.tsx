"use client"

import { useActionState } from "react"
import { Loader2, Trash2 } from "lucide-react"

import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Checkbox } from "@/components/ui/checkbox"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"

import {
  alternarLiberadoInforme,
  criarInforme,
  excluirInforme,
} from "../actions"

const SELECT =
  "border-input bg-background text-foreground h-9 w-full rounded-md border px-3 text-sm shadow-xs outline-none [color-scheme:light] dark:[color-scheme:dark]"

export function InformeForm({
  remessaId,
  funcionarios,
}: {
  remessaId: string
  funcionarios: { usuarioId: string; nome: string }[]
}) {
  const [estado, formAction, pendente] = useActionState(criarInforme, {})

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Adicionar informe</CardTitle>
      </CardHeader>
      <CardContent>
        <form action={formAction} className="grid gap-4">
          {estado.erro && (
            <Alert variant="destructive">
              <AlertDescription>{estado.erro}</AlertDescription>
            </Alert>
          )}
          {estado.ok && (
            <Alert className="border-success/40 text-success-fg">
              <AlertDescription>{estado.ok}</AlertDescription>
            </Alert>
          )}
          <input type="hidden" name="remessa_id" value={remessaId} />

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="grid gap-1.5">
              <Label htmlFor="funcionario_id">Funcionário *</Label>
              <select
                id="funcionario_id"
                name="funcionario_id"
                required
                defaultValue=""
                className={SELECT}
              >
                <option value="" disabled>
                  Escolha o funcionário
                </option>
                {funcionarios.map((f) => (
                  <option key={f.usuarioId} value={f.usuarioId}>
                    {f.nome}
                  </option>
                ))}
              </select>
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="arquivo">Informe de rendimentos (PDF) *</Label>
              <Input
                id="arquivo"
                name="arquivo"
                type="file"
                accept="application/pdf"
                required
              />
            </div>
            <div className="grid content-end pb-1">
              <label className="text-muted-foreground flex items-center gap-2 text-sm">
                <Checkbox name="liberado" defaultChecked />
                Liberado para o funcionário (avisa por notificação e email)
              </label>
            </div>
          </div>

          <div className="flex justify-end">
            <Button type="submit" disabled={pendente}>
              {pendente && <Loader2 className="animate-spin" />}
              Adicionar informe
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  )
}

export function AlternarLiberadoBotao({
  id,
  remessaId,
  liberado,
}: {
  id: string
  remessaId: string
  liberado: boolean
}) {
  const [estado, formAction, pendente] = useActionState(
    alternarLiberadoInforme,
    {}
  )

  return (
    <form action={formAction} className="inline-flex items-center">
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="remessa_id" value={remessaId} />
      <input type="hidden" name="liberado" value={liberado ? "false" : "true"} />
      {estado.erro && (
        <span className="text-destructive mr-1 text-xs">{estado.erro}</span>
      )}
      <Button
        type="submit"
        variant="ghost"
        size="sm"
        disabled={pendente}
        className="h-7 px-2"
      >
        {pendente ? (
          <Loader2 className="animate-spin" />
        ) : liberado ? (
          "Bloquear"
        ) : (
          "Liberar"
        )}
      </Button>
    </form>
  )
}

export function ExcluirInformeBotao({
  id,
  remessaId,
}: {
  id: string
  remessaId: string
}) {
  const [estado, formAction, pendente] = useActionState(excluirInforme, {})

  return (
    <form
      action={formAction}
      onSubmit={(e) => {
        if (!confirm("Excluir este informe de rendimentos?")) e.preventDefault()
      }}
      className="inline-flex items-center"
    >
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="remessa_id" value={remessaId} />
      {estado.erro && (
        <span className="text-destructive mr-1 text-xs">{estado.erro}</span>
      )}
      <Button
        type="submit"
        variant="ghost"
        size="sm"
        disabled={pendente}
        className="text-destructive hover:text-destructive h-7 px-2"
      >
        {pendente ? <Loader2 className="animate-spin" /> : <Trash2 />}
      </Button>
    </form>
  )
}
