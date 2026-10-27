"use client"

import { useActionState } from "react"
import { Check, Loader2 } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"

import { baixarCobrancaAction } from "./actions"
import { confirmarEnvio } from "@/components/ui/confirmacao"
import { useEnvioFormulario } from "@/hooks/use-envio-formulario"

/** Baixa da cobrança: observação obrigatória + comprovante opcional. */
export function BaixaCobrancaForm({
  infracaoId,
  valorTexto,
  podeEditar = true,
}: {
  infracaoId: string
  valorTexto: string
  podeEditar?: boolean
}) {
  const [estado, formAction, pendente] = useActionState(
    baixarCobrancaAction,
    {}
  )
  const envio = useEnvioFormulario(formAction, estado, {
    antes: (e) => {
        confirmarEnvio(e, `Dar baixa nesta cobrança de ${valorTexto}? O registro fica no histórico de auditoria.`)
      },
  })
  if (!podeEditar) return null
  return (
    <form
      action={formAction} {...envio}
      className="grid gap-2"
    >
      <input type="hidden" name="infracao_id" value={infracaoId} />
      <div className="flex flex-wrap items-center gap-2">
        <Input
          name="observacao"
          required
          placeholder="Como foi recebido (contracheque 08/2026, depósito…)"
          className="h-8 w-80 max-w-full text-sm"
        />
        <Input
          type="file"
          name="comprovante"
          accept="application/pdf,image/jpeg,image/png"
          compacto
          className="w-64 max-w-full"
        />
        <Button type="submit" size="sm" disabled={pendente}>
          {pendente ? <Loader2 className="animate-spin" /> : <Check />}
          Dar baixa
        </Button>
      </div>
      {estado.erro && <p className="text-destructive text-xs">{estado.erro}</p>}
    </form>
  )
}
