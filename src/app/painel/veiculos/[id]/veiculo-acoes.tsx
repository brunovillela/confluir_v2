"use client"

import { useActionState } from "react"
import { Ban, Loader2, Wrench } from "lucide-react"

import { Button } from "@/components/ui/button"

import { alternarInatividadeAction, alternarManutencaoAction } from "../actions"

/** Botões do gestor: manutenção e inativação (com confirmação). */
export function VeiculoAcoes({
  veiculoId,
  manutencao,
  inativo,
}: {
  veiculoId: string
  manutencao: boolean
  inativo: boolean
}) {
  const [estadoManutencao, acaoManutencao, pendenteManutencao] = useActionState(
    alternarManutencaoAction,
    {}
  )
  const [estadoInativo, acaoInativo, pendenteInativo] = useActionState(
    alternarInatividadeAction,
    {}
  )

  return (
    <div className="grid gap-2">
      <div className="flex flex-wrap gap-2">
        <form action={acaoManutencao}>
          <input type="hidden" name="veiculo_id" value={veiculoId} />
          <input type="hidden" name="manutencao" value={manutencao ? "0" : "1"} />
          <Button
            type="submit"
            variant="outline"
            size="sm"
            disabled={pendenteManutencao}
          >
            {pendenteManutencao ? (
              <Loader2 className="animate-spin" />
            ) : (
              <Wrench />
            )}
            {manutencao ? "Concluir manutenção" : "Enviar para manutenção"}
          </Button>
        </form>
        <form
          action={acaoInativo}
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
        >
          <input type="hidden" name="veiculo_id" value={veiculoId} />
          <input type="hidden" name="inativo" value={inativo ? "0" : "1"} />
          <Button
            type="submit"
            variant="outline"
            size="sm"
            disabled={pendenteInativo}
          >
            {pendenteInativo ? <Loader2 className="animate-spin" /> : <Ban />}
            {inativo ? "Reativar veículo" : "Inativar veículo"}
          </Button>
        </form>
      </div>
      {(estadoManutencao.erro || estadoInativo.erro) && (
        <p className="text-destructive text-xs">
          {estadoManutencao.erro ?? estadoInativo.erro}
        </p>
      )}
    </div>
  )
}
