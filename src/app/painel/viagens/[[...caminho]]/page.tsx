import { redirect } from "next/navigation"

/**
 * Viagens mudou para dentro de Institucional (25/09). Links antigos — os
 * e-mails de "viagem reservada" levavam para /painel/viagens/<id> — seguem
 * funcionando.
 */
export default async function ViagensAntigo({
  params,
}: {
  params: Promise<{ caminho?: string[] }>
}) {
  const { caminho } = await params
  redirect(`/painel/institucional/viagens${caminho?.length ? `/${caminho.join("/")}` : ""}`)
}
