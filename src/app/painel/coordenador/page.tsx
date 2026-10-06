import { redirect } from "next/navigation"

/** A área do coordenador virou a aba "Coordenação" do painel (06/10/2026). */
export default async function CoordenadorPage({
  searchParams,
}: {
  searchParams: Promise<{ depto?: string; salvo?: string }>
}) {
  const { depto, salvo } = await searchParams
  const q = new URLSearchParams({ aba: "coordenacao" })
  if (depto) q.set("depto", depto)
  if (salvo) q.set("salvo", salvo)
  redirect(`/painel?${q.toString()}`)
}
