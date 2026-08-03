import { redirect } from "next/navigation"

export default function Home() {
  // O proxy decide: autenticado segue para o painel, senão vai ao /login.
  redirect("/painel")
}
