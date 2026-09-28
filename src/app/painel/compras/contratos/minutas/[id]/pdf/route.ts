import { getSessaoPainel } from "@/lib/auth"
import { renderizarPdfMinuta } from "@/lib/db/minuta-pdf"
import { podeAcessar } from "@/lib/permissoes"
import { tenantAtual } from "@/lib/tenant"

export const runtime = "nodejs"

export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const sessao = await getSessaoPainel()
  if (!sessao || !podeAcessar(sessao.permissoes, "aquisicoes_contratos_edicao")) {
    return new Response("Sem acesso", { status: 403 })
  }
  const { id } = await ctx.params
  const r = await renderizarPdfMinuta(id, await tenantAtual())
  if (!r) return new Response("Minuta não encontrada", { status: 404 })
  const baixar = new URL(req.url).searchParams.get("baixar") === "1"
  return new Response(new Uint8Array(r.pdf), {
    headers: {
      "content-type": "application/pdf",
      "content-disposition": `${baixar ? "attachment" : "inline"}; filename="${r.nome}"`,
      "cache-control": "no-store",
    },
  })
}
