"use client"

import { useActionState } from "react"
import { Loader2, Trash2 } from "lucide-react"

import { Button } from "@/components/ui/button"

import { excluirPeriodoAction } from "./actions"

/**
 * Exclui um período de férias SEM gozos (o servidor confere de novo). Quem
 * chama só mostra o botão quando o período não tem gozo registrado.
 */
export function ExcluirPeriodoBotao({
  periodoId,
  voltarPara,
  compacto = false,
}: {
  periodoId: string
  /** Para onde ir depois de excluir (padrão: lista de férias). */
  voltarPara?: string
  compacto?: boolean
}) {
  const [estado, formAction, pendente] = useActionState(excluirPeriodoAction, {})

  return (
    <form
      action={formAction}
      onSubmit={(e) => {
        if (!confirm("Excluir este período de férias? Ele não tem gozos registrados.")) {
          e.preventDefault()
        }
      }}
      className="inline-flex items-center"
    >
      <input type="hidden" name="id" value={periodoId} />
      {voltarPara && <input type="hidden" name="voltar" value={voltarPara} />}
      {estado.erro && <span className="text-destructive mr-1 text-xs">{estado.erro}</span>}
      <Button
        type="submit"
        variant={compacto ? "ghost" : "outline"}
        size="sm"
        disabled={pendente}
        className={
          compacto
            ? "text-destructive hover:text-destructive h-7 px-2"
            : "text-destructive hover:text-destructive"
        }
        aria-label="Excluir período"
        title="Excluir período (sem gozos)"
      >
        {pendente ? <Loader2 className="animate-spin" /> : <Trash2 />}
        {!compacto && "Excluir período"}
      </Button>
    </form>
  )
}
