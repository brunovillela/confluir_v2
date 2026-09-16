"use client"

import { useActionState, useRef } from "react"
import { Loader2, ShieldAlert } from "lucide-react"

import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { type EstadoForm } from "@/lib/contas"
import { mascaraCpf } from "@/lib/mascaras"

import { corrigirIdentidadeAction } from "./actions"

/** CPF e matrícula sindical: corrigidos à parte, com conferência e registro no prontuário. */
export function IdentidadeForm({
  id,
  cpf,
  matricula,
  cpfSuspeito,
  proximaMatricula,
}: {
  id: string
  cpf: string
  matricula: string
  /** Próxima matrícula sindical livre, para quem precisa de número novo. */
  proximaMatricula: number
  /** O CPF gravado não é um CPF válido ("0", dígitos errados…). */
  cpfSuspeito: boolean
}) {
  const [estado, formAction, pendente] = useActionState<EstadoForm, FormData>(
    corrigirIdentidadeAction,
    {}
  )
  const campoMatricula = useRef<HTMLInputElement>(null)
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <ShieldAlert className="size-4" />
          CPF e matrícula sindical
        </CardTitle>
        <CardDescription>
          São a identidade do cadastro: o sistema confere se já estão em outro cadastro e registra
          a correção no prontuário.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form action={formAction} className="grid gap-4">
          <input type="hidden" name="id" value={id} />
          {cpfSuspeito && (
            <Alert className="border-warning/40 text-warning-fg">
              <AlertDescription>
                O CPF gravado ({cpf || "em branco"}) não é válido. Informe o CPF correto ou deixe em
                branco até confirmar com o filiado.
              </AlertDescription>
            </Alert>
          )}
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="grid gap-1.5">
              <Label htmlFor="identidade-cpf">CPF</Label>
              <Input
                id="identidade-cpf"
                name="cpf"
                inputMode="numeric"
                placeholder="000.000.000-00"
                defaultValue={cpfSuspeito ? "" : mascaraCpf(cpf)}
                onChange={(e) => {
                  e.target.value = mascaraCpf(e.target.value)
                }}
              />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="identidade-matricula">Matrícula sindical</Label>
              <Input
                ref={campoMatricula}
                id="identidade-matricula"
                name="matricula_sindical"
                inputMode="numeric"
                defaultValue={matricula}
              />
              <button
                type="button"
                className="text-primary justify-self-start text-xs underline-offset-4 hover:underline"
                onClick={() => {
                  if (campoMatricula.current) campoMatricula.current.value = String(proximaMatricula)
                }}
              >
                Usar a próxima livre ({proximaMatricula})
              </button>
            </div>
          </div>
          {estado.erro && <p className="text-destructive text-sm">{estado.erro}</p>}
          {estado.ok && <p className="text-success-fg text-sm">{estado.ok}</p>}
          <div className="flex justify-end">
            <Button type="submit" variant="outline" disabled={pendente}>
              {pendente && <Loader2 className="animate-spin" />}
              Corrigir identidade
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  )
}
