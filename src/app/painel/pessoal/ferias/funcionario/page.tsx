import { redirect } from "next/navigation"

/** `/funcionario` sozinho não é página (a trilha linka para cá): vai à lista. */
export default function FuncionarioSemIdPage() {
  redirect("/painel/pessoal/ferias")
}
