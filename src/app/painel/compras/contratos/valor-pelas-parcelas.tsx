"use client"

import { useActionState } from "react"
import { Loader2, Wand2 } from "lucide-react"

import { Button } from "@/components/ui/button"
import { confirmarEnvio } from "@/components/ui/confirmacao"
import { useEnvioFormulario } from "@/hooks/use-envio-formulario"

import { preencherValorPelasParcelasAction } from "./actions"

/**
 * Preencher o valor do contrato com o que as parcelas repetem (26/11/2026):
 * um contrato (com `contratoId`) ou todos os sugeridos (Saúde dos contratos).
 */
export function PreencherValorPelasParcelas({
  contratoId,
  rotulo,
  confirmacao,
}: {
  contratoId?: string
  rotulo: string
  confirmacao: string
}) {
  const [estado, acao, pendente] = useActionState(preencherValorPelasParcelasAction, {})
  const envio = useEnvioFormulario(acao, estado, {
    antes: (e) => confirmarEnvio(e, { titulo: rotulo, descricao: confirmacao, confirmar: "Preencher" }),
  })
  return (
    <form action={acao} {...envio} className="inline-grid gap-1">
      {contratoId && <input type="hidden" name="contrato_id" value={contratoId} />}
      <Button type="submit" size="sm" variant="outline" disabled={pendente}>
        {pendente ? <Loader2 className="animate-spin" /> : <Wand2 />}
        {rotulo}
      </Button>
      {estado.erro && <span className="text-destructive text-xs">{estado.erro}</span>}
    </form>
  )
}
