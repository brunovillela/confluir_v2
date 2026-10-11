import { redirect } from "next/navigation"

/**
 * Agenda e eventos viraram uma página só (10/09/2026). A âncora leva direto à
 * seção da agenda, no fim da página, e não ao topo (A85).
 */
export default function PortalAgendaRedirect() {
  redirect("/portal/eventos#agenda")
}
