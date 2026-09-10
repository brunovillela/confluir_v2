import { redirect } from "next/navigation"

/** "Fichas pendentes" virou "Cadastros pendentes" (10/09/2026). */
export default function FichasPendentesRedirect() {
  redirect("/painel/filiados/cadastros-pendentes?tipo=vinculo")
}
