import { requirePermissao } from "@/lib/auth"
import { obterCongresso } from "@/lib/db/congressos"
import { estadoDaMesa, estadoDaPlenaria } from "@/lib/db/congressos-ao-vivo"
import { tenantAtual } from "@/lib/tenant"

/** Estado da plenária para o telão e a mesa. `?mesa=1` lê sem cache (a mesa vê o próprio ato na hora). */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  await requirePermissao("congressos", ["congressos_gestao", "congressos_relatoria", "congressos_credenciamento"])
  const { id } = await params
  const c = await obterCongresso(id)
  if (!c) return Response.json({ erro: "Congresso não encontrado." }, { status: 404 })
  const tenantId = await tenantAtual()
  const e = new URL(req.url).searchParams.get("mesa") ? await estadoDaMesa(c, tenantId) : await estadoDaPlenaria(c, tenantId)
  return Response.json({ ...e, agora: Date.now() }, { headers: { "cache-control": "private, no-store" } })
}
