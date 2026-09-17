import Link from "next/link"
import { Wrench } from "lucide-react"

import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import type { SituacaoPlano } from "@/lib/db/veiculos-manutencoes"
import { formatarData } from "@/lib/formato"

/**
 * Aviso de manutenção preventiva na página do veículo — a página mais aberta
 * da frota, então é aqui que a revisão precisa estar à vista.
 *
 * Um aviso por veículo, não por programação: três preventivas vencidas viram
 * uma linha que as nomeia. Alerta empilhado ninguém lê. Vencidas e próximas
 * saem juntas (a vencida não esconde a que vence semana que vem).
 *
 * Fora da janela de alerta, uma linha discreta diz qual é a próxima revisão —
 * quem pega o carro vê o que vem pela frente antes de virar urgência.
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
  const href = `/painel/veiculos/manutencoes/nova?veiculo=${veiculoId}`

  if (planos.length === 0) {
    if (!podeRegistrar) return null
    return (
      <Alert variant="info">
        <AlertDescription className="flex flex-wrap items-center justify-between gap-3">
          <span>Sem manutenção preventiva programada para este veículo — cadastre o plano para receber os avisos.</span>
          <Link href="/painel/veiculos/manutencoes/planos" className="text-primary text-sm hover:underline">
            Programar preventiva
          </Link>
        </AlertDescription>
      </Alert>
    )
  }

  if (vencidas.length === 0 && proximas.length === 0) {
    const seguinte = maisProxima(planos)
    if (!seguinte) return null
    return (
      <Alert variant="info">
        <AlertDescription>
          <span>
            <strong>Próxima preventiva:</strong> {seguinte.plano.descricao} — {quando(seguinte)}.
          </span>
        </AlertDescription>
      </Alert>
    )
  }

  const botao = podeRegistrar && (
    <Button asChild size="sm" variant="outline">
      <Link href={href}>
        <Wrench />
        Registrar
      </Link>
    </Button>
  )

  return (
    <Alert variant={vencidas.length > 0 ? "destructive" : "warning"}>
      <AlertDescription className="flex flex-wrap items-center justify-between gap-3">
        <span className="grid gap-1">
          {vencidas.length > 0 && (
            <span>
              <strong>
                {vencidas.length === 1
                  ? "Manutenção preventiva vencida"
                  : `${vencidas.length} manutenções preventivas vencidas`}
              </strong>{" "}
              — {vencidas.map(descrever).join("; ")}.
            </span>
          )}
          {proximas.length > 0 && (
            <span>
              <strong>
                {proximas.length === 1
                  ? "Manutenção preventiva se aproximando"
                  : `${proximas.length} manutenções preventivas se aproximando`}
              </strong>{" "}
              — {proximas.map(descrever).join("; ")}.
            </span>
          )}
        </span>
        {botao}
      </AlertDescription>
    </Alert>
  )
}

function descrever(p: SituacaoPlano): string {
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
      : `${p.plano.descricao} (em ${d} ${unidade}${p.proximaData ? `, ${formatarData(p.proximaData)}` : ""})`
  }
  return p.plano.descricao
}

/** "em 20/10/2026 (34 dias) ou aos 60.000 km (faltam 4.200 km)". */
function quando(p: SituacaoPlano): string {
  const partes: string[] = []
  if (p.proximaData) {
    partes.push(
      `em ${formatarData(p.proximaData)}${p.diasRestantes !== null ? ` (${p.diasRestantes} ${p.diasRestantes === 1 ? "dia" : "dias"})` : ""}`
    )
  }
  if (p.proximoHodometro !== null) {
    partes.push(
      `aos ${p.proximoHodometro.toLocaleString("pt-BR")} km${p.kmRestantes !== null ? ` (faltam ${p.kmRestantes.toLocaleString("pt-BR")} km)` : ""}`
    )
  }
  return partes.length ? partes.join(" ou ") : "sem data nem km de referência"
}

/**
 * A preventiva que vence antes. Sem saber quantos km por dia o carro roda, o
 * critério de km não vira data: compara-se a fração do intervalo que falta.
 */
function maisProxima(planos: SituacaoPlano[]): SituacaoPlano | null {
  const fracao = (p: SituacaoPlano) => {
    const porData = p.diasRestantes !== null && p.plano.intervalo_dias ? p.diasRestantes / p.plano.intervalo_dias : Infinity
    const porKm = p.kmRestantes !== null && p.plano.intervalo_km ? p.kmRestantes / p.plano.intervalo_km : Infinity
    return Math.min(porData, porKm)
  }
  const ordenados = [...planos].sort((a, b) => fracao(a) - fracao(b))
  return ordenados[0] ?? null
}
