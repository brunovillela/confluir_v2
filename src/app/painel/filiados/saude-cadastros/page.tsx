import { redirect } from "next/navigation"

/** Segmento do breadcrumb da configuração: a saúde em detalhe é a lista de pendentes. */
export default function SaudeCadastrosPage() {
  redirect("/painel/filiados/cadastros-pendentes")
}
