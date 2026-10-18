import { NextResponse } from "next/server"

import { eventoParaCalendario } from "@/lib/db/eventos-portal"
import { estadoDaParte } from "@/lib/db/portal-partes"
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
 *
 * Route handler não passa pelo layout da seção: com Eventos desabilitada em
 * Filiados › Área do associado, o arquivo não sai e a volta cai na página
 * "indisponível". Suspensa, sai — é leitura.
 */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
): Promise<Response> {
  const [{ id }, vis, origem, eventos] = await Promise.all([
    params,
    getVisualizacaoPortal(),
    origemAtual(),
    estadoDaParte("eventos").catch(() => "habilitada" as const),
  ])
  if (!vis) return NextResponse.redirect(`${origem}/portal`)
  if (eventos === "desabilitada") return NextResponse.redirect(`${origem}/portal/eventos`)
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
