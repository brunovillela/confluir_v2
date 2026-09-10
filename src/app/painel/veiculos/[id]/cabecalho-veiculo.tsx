import Link from "next/link"
import { ArrowLeft } from "lucide-react"

import { Button } from "@/components/ui/button"
import type { VeiculoDetalhe } from "@/lib/db/veiculos"

/** Cabeçalho das subpáginas do veículo: volta para a visão geral dele. */
export function CabecalhoVeiculo({
  veiculo,
  titulo,
  descricao,
  acoes,
}: {
  veiculo: VeiculoDetalhe
  titulo: string
  descricao?: string
  acoes?: React.ReactNode
}) {
  return (
    <div>
      <Button variant="ghost" size="sm" asChild className="-ml-2 mb-2">
        <Link href={`/painel/veiculos/${veiculo.id}`}>
          <ArrowLeft />
          {veiculo.placa ?? "Veículo"}
          {veiculo.marca_modelo ? ` · ${veiculo.marca_modelo}` : ""}
        </Link>
      </Button>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{titulo}</h1>
          {descricao && (
            <p className="text-muted-foreground mt-1 text-xs">{descricao}</p>
          )}
        </div>
        {acoes && <div className="flex flex-wrap gap-2">{acoes}</div>}
      </div>
    </div>
  )
}
