import { NextResponse } from "next/server"

import { eventoParaCalendario } from "@/lib/db/eventos-portal"
import { tenantAtual } from "@/lib/tenant"
import { origemAtual } from "@/lib/tenant-url"
import { getVisualizacaoPortal } from "@/lib/visualizacao-filiado"

import { arquivoIcs, itemDoEvento, nomeArquivoIcs } from "../../calendario"

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/**
 * "Adicionar ao calendário" de um evento (A84): o .ics com data, local,
 * descrição curta e o link de volta ao cartão no portal.
 *
 * Só sai para quem vê o evento no portal (publicado ou adiado, ou com
 * inscrição viva dele). É leitura pura: vale também para a gestão em "Ver
 * como filiado". Os desvios voltam a uma página do portal, nunca a uma frase
 * solta; a origem vem da requisição (origemAtual), para cair no subdomínio
 * da entidade.
 */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
): Promise<Response> {
  const [{ id }, vis, origem] = await Promise.all([params, getVisualizacaoPortal(), origemAtual()])
  if (!vis) return NextResponse.redirect(`${origem}/portal`)
  const achado = UUID.test(id) ? await eventoParaCalendario(id, vis.filiado.cpf, await tenantAtual()) : null
  if (!achado) return NextResponse.redirect(`${origem}/portal/eventos`)

  const ics = arquivoIcs(
    itemDoEvento(achado.evento, achado.periodo, `${origem}/portal/eventos#evento-${achado.evento.id}`)
  )
  if (!ics) return NextResponse.redirect(`${origem}/portal/eventos`)
  return new Response(ics, {
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Content-Disposition": `attachment; filename="${nomeArquivoIcs(achado.evento.titulo)}"`,
      "Cache-Control": "no-store",
    },
  })
}
