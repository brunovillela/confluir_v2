"use client"

import { useActionState } from "react"
import { Loader2, Send } from "lucide-react"

import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { confirmarEnvio } from "@/components/ui/confirmacao"

type Estado = { erro?: string }

/**
 * Envia a remessa de diárias para pagamento. A action vem da porta (Pessoal
 * ou Diretoria), cada uma com a sua permissão.
 */
export function EnviarRemessaForm({
  remessaId,
  acao,
  total,
  aprovadas,
  aguardando,
}: {
  remessaId: string
  acao: (prev: Estado, formData: FormData) => Promise<Estado>
  total: string
  aprovadas: number
  aguardando: number
}) {
  const [estado, formAction, pendente] = useActionState(acao, {})
  return (
    <form
      action={formAction}
      onSubmit={(e) =>
        confirmarEnvio(e, {
          titulo: `Enviar a remessa para pagamento (${total})?`,
          descricao: `Nasce uma ordem de pagamento com as ${aprovadas} diária(s) aprovada(s) e as despesas delas, que segue para autorização no Financeiro.${
            aguardando ? ` As ${aguardando} diária(s) ainda aguardando avaliação passam para a próxima remessa.` : ""
          } Depois de enviada, a remessa não recebe mais diárias.`,
          confirmar: "Enviar",
        })
      }
      className="grid gap-2"
    >
      <input type="hidden" name="remessa_id" value={remessaId} />
      {estado.erro && (
        <Alert variant="destructive">
          <AlertDescription>{estado.erro}</AlertDescription>
        </Alert>
      )}
      <Button type="submit" disabled={pendente || aprovadas === 0} className="justify-self-start">
        {pendente ? <Loader2 className="animate-spin" /> : <Send />}
        Enviar para pagamento
      </Button>
      {aprovadas === 0 && (
        <p className="text-muted-foreground text-xs">
          Só sai ordem com diária aprovada — avalie as diárias da remessa antes de enviar.
        </p>
      )}
    </form>
  )
}
