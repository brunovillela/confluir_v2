import { Badge } from "@/components/ui/badge"
import { contarPendenciasContas } from "@/lib/db/contas-saude"

/**
 * Selo do card "Contas bancárias" no Financeiro: quantos casos pedem atenção.
 * Vem por streaming (Suspense no hub) porque varre todas as contas.
 */
export async function SeloContasBancarias() {
  const n = await contarPendenciasContas().catch(() => 0)
  if (n === 0) return null
  return <Badge variant="warning">{n} pede{n > 1 ? "m" : ""} atenção</Badge>
}
