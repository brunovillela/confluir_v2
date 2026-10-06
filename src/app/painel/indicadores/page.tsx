import { redirect } from "next/navigation"

/** Os indicadores viraram a aba "Indicadores" do painel (06/10/2026). */
export default async function IndicadoresPage({
  searchParams,
}: {
  searchParams: Promise<{ atualizado?: string; erro?: string }>
}) {
  const { atualizado, erro } = await searchParams
  const q = new URLSearchParams({ aba: "gestao" })
  if (atualizado) q.set("atualizado", atualizado)
  if (erro) q.set("erro", erro)
  redirect(`/painel?${q.toString()}`)
}
