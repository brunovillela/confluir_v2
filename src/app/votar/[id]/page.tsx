import type { Metadata } from "next"

import { AuthShell } from "@/components/auth/auth-shell"

import { VotarForm } from "./votar-form"

export const metadata: Metadata = { title: "Votação — Confluir" }

export default async function VotarPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params

  return (
    <AuthShell
      rodape="O acesso é temporário e expira ao final da votação."
    >
      <VotarForm assembleiaId={id} />
    </AuthShell>
  )
}
