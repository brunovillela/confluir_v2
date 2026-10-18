import { NextResponse } from "next/server"

import { itemDaAgendaParaCalendario } from "@/lib/db/eventos-portal"
import { estadoDaParte } from "@/lib/db/portal-partes"
import { tenantAtual } from "@/lib/tenant"
import { origemAtual } from "@/lib/tenant-url"
import { getVisualizacaoPortal } from "@/lib/visualizacao-filiado"

import { arquivoIcs, itemDaAgenda, nomeArquivoIcs } from "../../../calendario"

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/**
 * "Adicionar ao calendário" de um compromisso da agenda do portal (A84) — só
 * os que a entidade marcou para o aplicativo, os mesmos que a página lista.
 * Dia todo vira data inteira no calendário. Leitura pura, como a do evento
 * (ver ../../../[id]/calendario/route.ts).
 *
 * É da parte Agenda, mas mora sob /portal/eventos: não sai com nenhuma das
 * duas desabilitada em Filiados › Área do associado. A volta é /portal/agenda,
 * que mostra "indisponível" (Agenda fora) ou a agenda sozinha (Eventos fora).
 */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
): Promise<Response> {
  const [{ id }, vis, origem, agenda, eventos] = await Promise.all([
    params,
    getVisualizacaoPortal(),
    origemAtual(),
    estadoDaParte("agenda").catch(() => "habilitada" as const),
    estadoDaParte("eventos").catch(() => "habilitada" as const),
  ])
  if (!vis) return NextResponse.redirect(`${origem}/portal`)
  if (agenda === "desabilitada" || eventos === "desabilitada") {
    return NextResponse.redirect(`${origem}/portal/agenda`)
  }
  const item = UUID.test(id) ? await itemDaAgendaParaCalendario(id, await tenantAtual()) : null
  if (!item) return NextResponse.redirect(`${origem}/portal/eventos#agenda`)

  const ics = arquivoIcs(itemDaAgenda(item, `${origem}/portal/eventos#agenda`))
  if (!ics) return NextResponse.redirect(`${origem}/portal/eventos#agenda`)
  return new Response(ics, {
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Content-Disposition": `attachment; filename="${nomeArquivoIcs(item.atividade)}"`,
      "Cache-Control": "no-store",
    },
  })
}
