"use client"

import { useActionState } from "react"
import { Check, Loader2, X } from "lucide-react"

import { Alert, AlertDescription } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import type { EmSeparadoLinha } from "@/lib/db/votacao-mesarios"
import { formatarCpf } from "@/lib/cpf"

import { validarEmSeparadoAction } from "./actions"

const ROTULO = {
  pendente: "Pendente",
  deferido: "Deferido",
  indeferido: "Indeferido",
} as const

export function EmSeparadoValidacao({
  assembleiaId,
  registros,
}: {
  assembleiaId: string
  registros: EmSeparadoLinha[]
}) {
  const [estado, formAction, pendente] = useActionState(
    validarEmSeparadoAction,
    {}
  )

  return (
    <div className="grid gap-3">
      {estado.erro && (
        <Alert variant="destructive">
          <AlertDescription>{estado.erro}</AlertDescription>
        </Alert>
      )}
      {registros.map((s) => (
        <div
          key={s.id}
          className="flex flex-wrap items-center justify-between gap-2 rounded-lg border p-2.5 text-sm"
        >
          <div className="min-w-0">
            <p className="font-medium">{s.nome ?? "(sem nome)"}</p>
            <p className="text-muted-foreground text-xs">
              {s.cpf ? formatarCpf(s.cpf) : "sem CPF"}
              {s.dataNascimento ? ` · nasc. ${s.dataNascimento}` : ""}
              {s.urna ? ` · ${s.urna}` : ""}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Badge
              variant="outline"
              className={
                s.status === "deferido"
                  ? "border-success/40 text-success-fg"
                  : s.status === "indeferido"
                    ? "border-destructive/40"
                    : "text-muted-foreground"
              }
            >
              {ROTULO[s.status]}
            </Badge>
            <form action={formAction} className="flex gap-1">
              <input type="hidden" name="assembleia_id" value={assembleiaId} />
              <input type="hidden" name="em_separado_id" value={s.id} />
              <Button
                type="submit"
                name="status"
                value="deferido"
                size="sm"
                variant="outline"
                disabled={pendente || s.status === "deferido"}
                className="border-success/40 text-success-fg"
              >
                {pendente ? <Loader2 className="animate-spin" /> : <Check />}
                Deferir
              </Button>
              <Button
                type="submit"
                name="status"
                value="indeferido"
                size="sm"
                variant="outline"
                disabled={pendente || s.status === "indeferido"}
                className="border-destructive/40"
              >
                <X />
                Indeferir
              </Button>
            </form>
          </div>
        </div>
      ))}
    </div>
  )
}
