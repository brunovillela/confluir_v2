import { redirect } from "next/navigation"

/** As faturas se listam por cartão: o "Faturas" do breadcrumb volta aos cartões. */
export default function FaturasPage() {
  redirect("/painel/financeiro/cartoes")
}
