import { requirePermissao } from "@/lib/auth"
import { registrarExportacao } from "@/lib/exportacoes"
import { hojeSP } from "@/lib/db/comum"
import { linksDosAptosSemLink } from "@/lib/db/votacao-sem-link"
import { formatarCnpjCpf } from "@/lib/formato"

export const runtime = "nodejs"

/**
 * Planilha (CSV) com o link pessoal de cada apto que ainda não votou e está
 * sem link — sem e-mail, falha no envio ou aviso ainda não enviado. Para
 * distribuir por WhatsApp, delegados ou na portaria (plano de 16/10/2026).
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
): Promise<Response> {
  const sessao = await requirePermissao("assembleias")
  const { id } = await params
  const r = await linksDosAptosSemLink(id)
  if (!r.linhas) return new Response(r.erro ?? "Não foi possível gerar a planilha.", { status: 400 })
  await registrarExportacao(request, { usuarioId: sessao.usuario.id, recurso: "links_voto", formato: "csv", quantidade: r.linhas.length, filtros: { rodada: id } })

  const escapar = (v: string) => (/[";\r\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v)
  const csv = [
    ["Nome", "CPF", "Matrícula", "Telefone", "Situação", "Link pessoal de voto"].join(";"),
    ...r.linhas.map((l) =>
      [l.nome ?? "", l.cpf ? formatarCnpjCpf(l.cpf) : "", l.matricula ?? "", l.telefone ?? "", l.situacao, l.link]
        .map(escapar)
        .join(";")
    ),
  ].join("\r\n")

  const hoje = hojeSP()
  return new Response("\uFEFF" + csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="links-de-voto-sem-link-${hoje}.csv"`,
      "Cache-Control": "no-store",
    },
  })
}
