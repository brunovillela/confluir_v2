import { getSessaoPainel } from "@/lib/auth"
import { buscarGlobal } from "@/lib/db/busca-global"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/**
 * Busca global do painel (onda 2, U4): `?q=` → grupos de resultados, cada
 * um só para quem tem a permissão da tela de destino (decidido em
 * lib/db/busca-global.ts). Sessão pelos cookies; sem ela, 401.
 */
export async function GET(req: Request): Promise<Response> {
  const sessao = await getSessaoPainel()
  if (!sessao) return Response.json({ erro: "Sem sessão" }, { status: 401 })
  const q = new URL(req.url).searchParams.get("q") ?? ""
  const grupos = await buscarGlobal(sessao, q.slice(0, 80))
  return Response.json({ grupos }, { headers: { "Cache-Control": "no-store" } })
}
