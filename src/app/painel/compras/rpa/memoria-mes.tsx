import { formatarMoeda } from "@/lib/formato"
import type { MemoriaMes } from "@/lib/rpa-calculo"

/**
 * Memória do IRRF apurado com os outros RPAs do prestador no mês do
 * pagamento (onda 5 do plano do RPA) — na prévia da emissão e na página do
 * recibo.
 */
export function MemoriaIrrfMes({ memoria, irrf, className = "" }: { memoria: MemoriaMes; irrf: number; className?: string }) {
  const mes = `${memoria.mes.slice(5, 7)}/${memoria.mes.slice(0, 4)}`
  const anteriores = memoria.anteriores.map((a) => `nº ${a.numero ?? "—"} ${a.pago ? "pago" : "previsto"}`).join(", ")
  return (
    <p className={`text-muted-foreground text-xs ${className}`}>
      IRRF e teto do INSS apurados pelo total de <strong className="text-foreground">{mes}</strong>, com{" "}
      {memoria.anteriores.length === 1 ? "o RPA" : "os RPAs"} {anteriores}: bruto do mês{" "}
      <span className="tabular-nums">{formatarMoeda(memoria.brutoMes)}</span>, base do IRRF{" "}
      <span className="tabular-nums">{formatarMoeda(memoria.baseIrrfMes)}</span>, IRRF do mês{" "}
      <span className="tabular-nums">{formatarMoeda(memoria.irrfMes)}</span>, já retido{" "}
      <span className="tabular-nums">{formatarMoeda(memoria.irrfAnteriores)}</span> — este recibo retém{" "}
      <strong className="text-foreground tabular-nums">{formatarMoeda(irrf)}</strong>.
    </p>
  )
}
