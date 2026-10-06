import { redirect } from "next/navigation"

/** Churn e retenção virou uma vista da aba "Indicadores" do painel (06/10/2026). */
export default function ChurnPage() {
  redirect("/painel?aba=gestao&ver=churn")
}
