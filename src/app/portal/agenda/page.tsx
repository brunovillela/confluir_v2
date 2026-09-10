import { redirect } from "next/navigation"

/** Agenda e eventos viraram uma página só (10/09/2026). */
export default function PortalAgendaRedirect() {
  redirect("/portal/eventos")
}
