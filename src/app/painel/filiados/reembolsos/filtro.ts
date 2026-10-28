import type { FiltroReembolsos } from "@/lib/db/filiacao-reembolsos-edicao"
import { ehTipoReembolso } from "@/lib/reembolsos-tipos"

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const DATA = /^\d{4}-\d{2}-\d{2}$/

/** Os filtros da lista a partir da URL — a tela e a exportação leem igual. */
export function lerFiltroReembolsos(sp: Record<string, string | undefined>): FiltroReembolsos {
  return {
    busca: sp.busca ?? "",
    de: sp.de && DATA.test(sp.de) ? sp.de : undefined,
    ate: sp.ate && DATA.test(sp.ate) ? sp.ate : undefined,
    situacao: sp.situacao === "pagos" || sp.situacao === "pendentes" ? sp.situacao : "todos",
    tipo: ehTipoReembolso(sp.tipo) ? sp.tipo : undefined,
    filiadoId: sp.filiado && UUID.test(sp.filiado) ? sp.filiado : undefined,
    pagina: Math.max(1, Number(sp.pagina) || 1),
  }
}
