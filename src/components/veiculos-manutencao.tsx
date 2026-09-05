import Link from "next/link"
import { Wrench } from "lucide-react"

import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import type { SituacaoPlano } from "@/lib/db/veiculos-manutencoes"
import { formatarData } from "@/lib/formato"

/**
 * Alerta de manutenção preventiva na página do veículo.
 *
 * Um alerta por veículo, não por programação: três preventivas vencidas viram
 * uma linha que as nomeia. Alerta empilhado ninguém lê.
 *
 * O texto diz POR QUE está vencendo — data ou quilometragem —, porque a ação é
 * diferente: prazo se resolve agendando, quilometragem depende de quanto o
 * carro ainda vai rodar até lá.
 */
export function AlertaManutencao({
  veiculoId,
  planos,
  podeRegistrar,
}: {
  veiculoId: string
  planos: SituacaoPlano[]
  podeRegistrar: boolean
}) {
  const vencidas = planos.filter((p) => p.vencido)
  const proximas = planos.filter((p) => p.proximo)
  if (vencidas.length === 0 && proximas.length === 0) return null

  const href = `/painel/veiculos/manutencoes/nova?veiculo=${veiculoId}`
  const alvo = vencidas.length > 0 ? vencidas : proximas

  const descrever = (p: SituacaoPlano): string => {
    if (p.motivo === "km" && p.kmRestantes !== null) {
      const km = Math.abs(p.kmRestantes).toLocaleString("pt-BR")
      return p.vencido
        ? `${p.plano.descricao} (${km} km além do previsto)`
        : `${p.plano.descricao} (faltam ${km} km)`
    }
    if (p.motivo === "data" && p.diasRestantes !== null) {
      const d = Math.abs(p.diasRestantes)
      const unidade = d === 1 ? "dia" : "dias"
      return p.vencido
        ? `${p.plano.descricao} (vencida há ${d} ${unidade})`
        : `${p.plano.descricao} (em ${d} ${unidade}${
            p.proximaData ? `, ${formatarData(p.proximaData)}` : ""
          })`
    }
    return p.plano.descricao
  }

  return (
    <Alert variant={vencidas.length > 0 ? "destructive" : "warning"}>
      <AlertDescription className="flex flex-wrap items-center justify-between gap-3">
        <span>
          <strong>
            {vencidas.length > 0
              ? vencidas.length === 1
                ? "Manutenção preventiva vencida"
                : `${vencidas.length} manutenções preventivas vencidas`
              : proximas.length === 1
                ? "Manutenção preventiva se aproximando"
                : `${proximas.length} manutenções preventivas se aproximando`}
          </strong>{" "}
          — {alvo.map(descrever).join("; ")}.
        </span>
        {podeRegistrar && (
          <Button asChild size="sm" variant="outline">
            <Link href={href}>
              <Wrench />
              Registrar
            </Link>
          </Button>
        )}
      </AlertDescription>
    </Alert>
  )
}
