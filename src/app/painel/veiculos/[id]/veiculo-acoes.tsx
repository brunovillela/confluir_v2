"use client"

import { useActionState } from "react"
import { Ban, Loader2, Wrench } from "lucide-react"

import { Button } from "@/components/ui/button"

import { alternarInatividadeAction, alternarManutencaoAction } from "../actions"

/**
 * Gestor: envia o veículo para manutenção ou conclui a manutenção. Vive na
 * subpágina de manutenções do veículo (decisão do Bruno, 10/09).
 */
export function ManutencaoVeiculoBotao({
  veiculoId,
  manutencao,
  voltar,
}: {
  veiculoId: string
  manutencao: boolean
  /** Página para onde voltar depois de salvar (padrão: a do veículo). */
  voltar?: string
}) {
  const [estado, formAction, pendente] = useActionState(
    alternarManutencaoAction,
    {}
  )
  return (
    <form action={formAction} className="grid gap-1">
      <input type="hidden" name="veiculo_id" value={veiculoId} />
      <input type="hidden" name="manutencao" value={manutencao ? "0" : "1"} />
      {voltar && <input type="hidden" name="voltar" value={voltar} />}
      <Button type="submit" variant="outline" disabled={pendente}>
        {pendente ? <Loader2 className="animate-spin" /> : <Wrench />}
        {manutencao ? "Concluir manutenção" : "Enviar para manutenção"}
      </Button>
      {estado.erro && <p className="text-destructive text-xs">{estado.erro}</p>}
    </form>
  )
}

/** Gestor: inativa ou reativa o veículo na frota (com confirmação). */
export function InativarVeiculoBotao({
  veiculoId,
  inativo,
}: {
  veiculoId: string
  inativo: boolean
}) {
  const [estado, formAction, pendente] = useActionState(
    alternarInatividadeAction,
    {}
  )
  return (
    <form
      action={formAction}
      onSubmit={(e) => {
        if (
          !confirm(
            inativo
              ? "Reativar este veículo na frota?"
              : "Inativar este veículo? Ele sai da frota ativa e não poderá ser retirado."
          )
        ) {
          e.preventDefault()
        }
      }}
      className="grid gap-1"
    >
      <input type="hidden" name="veiculo_id" value={veiculoId} />
      <input type="hidden" name="inativo" value={inativo ? "0" : "1"} />
      <Button type="submit" variant="outline" size="sm" disabled={pendente}>
        {pendente ? <Loader2 className="animate-spin" /> : <Ban />}
        {inativo ? "Reativar veículo" : "Inativar veículo"}
      </Button>
      {estado.erro && <p className="text-destructive text-xs">{estado.erro}</p>}
    </form>
  )
}
