import { getSessaoPainel } from "@/lib/auth"
import { competenciaValida, movimentoEmCsv, obterMovimento } from "@/lib/db/folha-movimento"
import { registrarExportacao } from "@/lib/exportacoes"
import { podeAcessar } from "@/lib/permissoes"

/** Movimento da competência em CSV (;) — Excel ou importação no sistema da contabilidade. */
export async function GET(request: Request, { params }: { params: Promise<{ competencia: string }> }) {
  const sessao = await getSessaoPainel()
  const envia = podeAcessar(sessao?.permissoes ?? null, "pessoal_contabilidade_envio")
  if (!sessao || (!envia && !podeAcessar(sessao.permissoes, "pessoal_contabilidade"))) {
    return new Response("Sem acesso", { status: 403 })
  }
  const { competencia } = await params
  if (!competenciaValida(competencia)) return new Response("Competência inválida", { status: 400 })
  const m = await obterMovimento(competencia)
  // A contabilidade só vê o que foi enviado.
  if (!m.competencia.enviada && !envia) return new Response("Competência ainda não enviada", { status: 404 })
  await registrarExportacao(request, { usuarioId: sessao.usuario.id, recurso: "folha_movimento", formato: "csv", quantidade: m.linhas.length, filtros: { competencia, previa: !m.competencia.enviada } })
  return new Response(movimentoEmCsv(competencia, m.linhas), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="movimento-folha-${competencia}${m.competencia.enviada ? "" : "-previa"}.csv"`,
      "Cache-Control": "no-store",
    },
  })
}
