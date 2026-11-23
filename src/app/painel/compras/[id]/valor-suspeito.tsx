"use client"

import { useActionState } from "react"
import { Loader2 } from "lucide-react"

import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"

import { usarValorDasOrdensAction } from "./actions"

type Estado = { erro?: string; ok?: string }

const brl = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })

/**
 * Valor da compra fora da escala das ordens (23/11/2026) — no Bubble, a
 * vírgula ia no lugar errado e só a ordem era refeita. Quem ajusta o
 * pagamento passa a compra para o valor das ordens com um clique.
 */
export function ValorSuspeito({
  processoId,
  valorCompra,
  valorOrdens,
  motivo,
  podeCorrigir,
}: {
  processoId: string
  valorCompra: number
  valorOrdens: number
  motivo: string
  podeCorrigir: boolean
}) {
  // Deu certo: a ação volta para a ficha com ?valor_corrigido=1 (e este alerta some).
  const [estado, acao, pendente] = useActionState<Estado, FormData>(usarValorDasOrdensAction, {})

  return (
    <Alert variant="warning" id="valor-suspeito">
      <AlertDescription className="grid gap-2">
        <p>
          O valor da compra ({brl(valorCompra)}) não bate com o das ordens de pagamento ({brl(valorOrdens)}). {motivo}{" "}
          Ele distorce os indicadores de Aquisição.
        </p>
        {podeCorrigir ? (
          <form action={acao} className="flex flex-wrap items-center gap-2">
            <input type="hidden" name="processo_id" value={processoId} />
            <Button type="submit" size="sm" variant="outline" disabled={pendente}>
              {pendente && <Loader2 className="animate-spin" />}
              Usar o valor das ordens ({brl(valorOrdens)})
            </Button>
            {estado.erro && <span className="text-destructive text-xs">{estado.erro}</span>}
          </form>
        ) : (
          <p className="text-xs">Quem opera as compras pode corrigir aqui mesmo.</p>
        )}
      </AlertDescription>
    </Alert>
  )
}
