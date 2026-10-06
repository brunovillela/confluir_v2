import { redirect } from "next/navigation"

/** A área do diretor virou a aba "Diretor" do painel (06/10/2026). */
export default function DiretorPage() {
  redirect("/painel?aba=diretor")
}
