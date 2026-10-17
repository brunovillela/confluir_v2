import { redirect } from "next/navigation"

/** `/funcionario` sozinho não é página (a trilha linka para cá). */
export default function FuncionarioSemIdPage() {
  redirect("/painel/pessoal/carreira")
}
