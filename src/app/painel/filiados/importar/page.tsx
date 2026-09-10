import { redirect } from "next/navigation"

/** A importação em massa vive em Nova filiação → Inclusão em massa (10/09/2026). */
export default function ImportarRedirect() {
  redirect("/painel/filiados/novo?modo=massa")
}
