import { getSessaoPainel } from "@/lib/auth"
import { contarNaoLidas } from "@/lib/db/notificacoes"
import { totalPendencias } from "@/lib/db/pendencias"
import { pendenciasCarimbadas, SEM_PENDENCIAS } from "@/lib/db/pendencias-carimbadas"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/**
 * Contadores do painel (sino, caixa de entrada do cabeçalho e da home) para a
 * atualização sem recarregar a página (onda 2, U3). Devolve a LISTA de
 * pendências, não só o total, para a caixa da home acompanhar o cabeçalho
 * (09/10/2026); `em` é o carimbo que decide qual lista é a mais nova no
 * navegador — falha no cálculo vem com `em: 0` e não apaga a caixa. Sessão
 * do painel pelos cookies — sem ela, 401. Nunca cacheada.
 */
export async function GET(): Promise<Response> {
  const sessao = await getSessaoPainel()
  if (!sessao) return Response.json({ erro: "Sem sessão" }, { status: 401 })
  const [naoLidas, { lista, em }] = await Promise.all([
    contarNaoLidas(sessao.usuario.id).catch(() => 0),
    pendenciasCarimbadas(sessao).catch(() => SEM_PENDENCIAS),
  ])
  return Response.json(
    { naoLidas, pendencias: totalPendencias(lista), lista, em },
    { headers: { "Cache-Control": "no-store" } }
  )
}
