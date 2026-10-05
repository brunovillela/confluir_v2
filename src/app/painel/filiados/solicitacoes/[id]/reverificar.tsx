"use client"

import { useActionState } from "react"
import { Loader2, ShieldCheck } from "lucide-react"

import { Button } from "@/components/ui/button"
import { type EstadoForm } from "@/lib/contas"

import { reverificarAssinaturaAction } from "./reverificar-action"

/** Roda a validação de novo no PDF guardado (fichas enviadas antes da validação existir, ou após atualizar as raízes). */
export function ReverificarAssinaturaBotao({ solicitacaoId }: { solicitacaoId: string }) {
  const [estado, action, pendente] = useActionState<EstadoForm, FormData>(reverificarAssinaturaAction, {})
  return (
    <form action={action} className="flex items-center gap-2">
      <input type="hidden" name="solicitacao_id" value={solicitacaoId} />
      <Button type="submit" variant="ghost" size="sm" disabled={pendente}>
        {pendente ? <Loader2 className="animate-spin" /> : <ShieldCheck />}
        Verificar assinatura agora
      </Button>
      {estado.erro && <span className="text-destructive text-xs">{estado.erro}</span>}
      {estado.ok && <span className="text-success-fg text-xs">{estado.ok}</span>}
    </form>
  )
}
