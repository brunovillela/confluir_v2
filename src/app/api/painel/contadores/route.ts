import { getSessaoPainel } from "@/lib/auth"
import { contarNaoLidas } from "@/lib/db/notificacoes"
import { pendenciasDoUsuario, totalPendencias } from "@/lib/db/pendencias"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/**
 * Contadores do cabeçalho (sino e caixa de entrada) para a atualização sem
 * recarregar a página (onda 2, U3). Sessão do painel pelos cookies — sem ela,
 * 401. Resposta pequena, nunca cacheada.
 */
export async function GET(): Promise<Response> {
  const sessao = await getSessaoPainel()
  if (!sessao) return Response.json({ erro: "Sem sessão" }, { status: 401 })
  const [naoLidas, pendencias] = await Promise.all([
    contarNaoLidas(sessao.usuario.id).catch(() => 0),
    pendenciasDoUsuario(sessao).catch(() => []),
  ])
  return Response.json(
    { naoLidas, pendencias: totalPendencias(pendencias) },
    { headers: { "Cache-Control": "no-store" } }
  )
}
