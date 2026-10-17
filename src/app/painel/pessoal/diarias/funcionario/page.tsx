import { redirect } from "next/navigation"

/** `/funcionario` sozinho não é página (a trilha linka para cá): vai à lista de funcionários. */
export default function FuncionarioSemIdPage() {
  redirect("/painel/pessoal/diarias")
}
