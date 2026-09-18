import { redirect } from "next/navigation"

/** A lista fica na página de Organização (link da trilha). */
export default function Pagina() {
  redirect("/painel/institucional/organizacao")
}
