import { requirePermissao } from "@/lib/auth"
import { hojeSP } from "@/lib/db/comum"
import { comunicacoesDaEmpresa, csvDesconto, pendenciasDeDesconto } from "@/lib/db/desconto-comunicacoes"
import { unidadeRepasse } from "@/lib/db/repasse"

/**
 * Planilha (CSV) das inclusões e exclusões de desconto de uma empresa:
 * `?itens=vinculo|acao,…` = as pendentes marcadas na tela;
 * `?comunicacao=id` = o que foi enviado numa comunicação registrada.
 */
export async function GET(req: Request, { params }: { params: Promise<{ empresaId: string }> }) {
  await requirePermissao("filiacao_receitas", ["filiacao_gestao"])
  const { empresaId } = await params
  const url = new URL(req.url)
  const comunicacao = url.searchParams.get("comunicacao")
  let linhas: Parameters<typeof csvDesconto>[0] = []
  let nome = `inclusoes-exclusoes-${hojeSP()}.csv`
  if (comunicacao) {
    const unidade = await unidadeRepasse(empresaId)
    const c = (await comunicacoesDaEmpresa(empresaId, unidade?.fontes ?? [empresaId], 200)).find((x) => x.id === comunicacao)
    if (!c) return new Response("Comunicação não encontrada.", { status: 404 })
    linhas = c.itens
    nome = `inclusoes-exclusoes-${c.enviadoEm.slice(0, 10)}.csv`
  } else {
    const escolhidos = new Set((url.searchParams.get("itens") ?? "").split(",").filter(Boolean))
    const { itens } = await pendenciasDeDesconto(empresaId)
    linhas = escolhidos.size ? itens.filter((i) => escolhidos.has(`${i.vinculoId}|${i.acao}`)) : itens
  }
  return new Response(csvDesconto(linhas), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${nome}"`,
      "Cache-Control": "no-store",
    },
  })
}
