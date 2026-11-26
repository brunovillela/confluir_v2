"use client"

import { useActionState, useState } from "react"
import { CircleCheckBig, Loader2 } from "lucide-react"

import { Button } from "@/components/ui/button"
import { confirmarEnvio } from "@/components/ui/confirmacao"
import { useEnvioFormulario } from "@/hooks/use-envio-formulario"
import { DIAS_FINALIZACAO_LOTE } from "@/lib/contratos-constantes"

import { finalizarContratosEmLoteAction } from "./actions"

const SELECT =
  "border-input bg-background text-foreground h-8 rounded-md border px-2 text-sm shadow-xs outline-none [color-scheme:light] dark:[color-scheme:dark]"

/**
 * Finalizar em lote (26/11/2026) os vencidos que só acabaram: há mais de N
 * dias, sem pagamento em aberto e sem aditivo em vigor. A contagem por opção
 * vem do servidor, que recalcula a lista ao finalizar.
 */
export function FinalizarLote({
  porDias,
  exemplos,
}: {
  /** Quantos seriam finalizados em cada opção de dias. */
  porDias: Record<number, number>
  /** Alguns dos mais antigos, para quem confirma saber do que se trata. */
  exemplos: { dias: number; rotulo: string }[]
}) {
  const [dias, setDias] = useState<number>(365)
  const [estado, acao, pendente] = useActionState(finalizarContratosEmLoteAction, {})
  const n = porDias[dias] ?? 0
  const envio = useEnvioFormulario(acao, estado, {
    antes: (e) =>
      confirmarEnvio(e, {
        titulo: `Finalizar ${n} contrato${n === 1 ? "" : "s"}?`,
        descricao: `Vencidos há mais de ${dias} dias, sem pagamento em aberto e sem aditivo em vigor. Cada um fica Finalizado na data do fim da vigência, com o motivo "finalizado em lote", e pode ser reaberto na página dele. Por exemplo: ${exemplos
          .filter((x) => x.dias > dias)
          .slice(0, 3)
          .map((x) => x.rotulo)
          .join("; ")}.`,
        confirmar: "Finalizar",
      }),
  })
  return (
    <form action={acao} {...envio} className="flex flex-wrap items-center gap-2 text-sm">
      <span>Finalizar os vencidos há mais de</span>
      <select name="dias" value={dias} onChange={(e) => setDias(Number(e.target.value))} className={SELECT}>
        {DIAS_FINALIZACAO_LOTE.map((d) => (
          <option key={d} value={d}>
            {d === 365 ? "1 ano" : `${d} dias`} ({porDias[d] ?? 0})
          </option>
        ))}
      </select>
      <span className="text-muted-foreground">sem pagamento em aberto</span>
      <Button type="submit" size="sm" variant="outline" disabled={pendente || n === 0}>
        {pendente ? <Loader2 className="animate-spin" /> : <CircleCheckBig />}
        Finalizar {n}
      </Button>
      {estado.erro && <span className="text-destructive text-xs">{estado.erro}</span>}
    </form>
  )
}
