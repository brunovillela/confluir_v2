import "server-only"

import { coordenaFuncionario } from "@/lib/db/coordenador"
import type { RemessaNova } from "@/lib/db/diarias-remessas"
import { podeAcessar, type Permissoes } from "@/lib/permissoes"

/**
 * Quem avalia a REMESSA de diárias (08/10/2026) — a mesma regra para o
 * painel (diarias/remessas/actions.ts) e o bot do Telegram
 * (lib/telegram-pendencias.ts). A permissão sai do quadro da remessa:
 *   diretor     → diretoria_diarias (ou configuracoes)
 *   funcionário → pessoal_gestao / pessoal_diarias, ou o coordenador do
 *                 departamento do funcionário (nunca a própria remessa).
 */
export function geraDiariasDoQuadro(permissoes: Permissoes | null, remessa: Pick<RemessaNova, "quadro">): boolean {
  return remessa.quadro === "diretor"
    ? podeAcessar(permissoes, "diretoria_diarias", ["configuracoes"])
    : podeAcessar(permissoes, "pessoal_gestao", ["pessoal_diarias"])
}

export async function podeAvaliarRemessa(
  usuarioId: string,
  permissoes: Permissoes | null,
  remessa: Pick<RemessaNova, "quadro" | "beneficiarioId">
): Promise<boolean> {
  if (remessa.beneficiarioId === usuarioId) return false
  if (geraDiariasDoQuadro(permissoes, remessa)) return true
  return remessa.quadro === "funcionario" && (await coordenaFuncionario(usuarioId, remessa.beneficiarioId))
}
