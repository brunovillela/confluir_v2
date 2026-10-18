import type { EstadoParte } from "@/lib/portal-partes-constantes"

/**
 * Textos do resumo da Área do associado — um só lugar para o cartão do hub
 * de Filiados e a linha de situação da página não dizerem coisas diferentes.
 */

/** "2 suspensas · 1 desabilitada" (vazio quando tudo está habilitado). */
export function contagemDasPartes(r: { suspensas: number; desabilitadas: number }): string {
  const partes: string[] = []
  if (r.suspensas > 0) partes.push(`${r.suspensas} ${r.suspensas === 1 ? "suspensa" : "suspensas"}`)
  if (r.desabilitadas > 0) {
    partes.push(`${r.desabilitadas} ${r.desabilitadas === 1 ? "desabilitada" : "desabilitadas"}`)
  }
  return partes.join(" · ")
}

/** Indicador do cartão no hub: o portal inteiro manda; senão, a contagem. */
export function indicadorDoPortal(r: { portal: EstadoParte; suspensas: number; desabilitadas: number }): string {
  if (r.portal === "desabilitada") return "Portal fora do ar"
  if (r.portal === "suspensa") return "Portal em modo de consulta"
  return contagemDasPartes(r) || "Tudo habilitado"
}
