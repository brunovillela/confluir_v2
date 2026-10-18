import type { Metadata } from "next"
import { redirect } from "next/navigation"

import { CabecalhoPagina } from "@/components/portal/cabecalho-pagina"
import { ParteIndisponivel } from "@/components/portal/guarda-parte"
import { eventosDoAplicativo } from "@/lib/db/filiado-portal"
import { configDaParte, estadoDaParte } from "@/lib/db/portal-partes"
import { mensagemDaSituacao } from "@/lib/portal-partes-constantes"
import { requireVisualizacaoPortal } from "@/lib/visualizacao-filiado"

import { AgendaDeAtividades } from "./agenda-de-atividades"

export const metadata: Metadata = { title: "Agenda de atividades" }

/**
 * Agenda e eventos viraram uma página só (10/09/2026). A âncora leva direto à
 * seção da agenda, no fim da página, e não ao topo (A85).
 *
 * Com Eventos desabilitada em Filiados › Área do associado e a Agenda não, a
 * agenda ganha casa aqui, sozinha — senão sumiria junto com a página de
 * Eventos. A Agenda desabilitada fica no "indisponível": a guarda do layout
 * não impede a página de rodar, e o redirecionamento passaria por cima dela.
 */
export default async function PortalAgendaPage() {
  const { preview } = await requireVisualizacaoPortal()
  const [agenda, eventos] = await Promise.all([
    configDaParte("agenda").catch(() => null),
    estadoDaParte("eventos").catch(() => "habilitada" as const),
  ])
  if (agenda?.estado === "desabilitada") {
    return <ParteIndisponivel parte="agenda" mensagem={mensagemDaSituacao("agenda", agenda)} preview={preview} />
  }
  if (eventos !== "desabilitada") redirect("/portal/eventos#agenda")

  const itens = await eventosDoAplicativo(50)
  return (
    <>
      <CabecalhoPagina
        secao="/portal/eventos"
        titulo="Agenda de atividades"
        subtitulo="Atividades do sindicato de hoje em diante."
      />
      {/* Sem "Calendário": o arquivo mora sob /portal/eventos, que está fora. */}
      <AgendaDeAtividades agenda={itens} comCalendario={false} />
    </>
  )
}
