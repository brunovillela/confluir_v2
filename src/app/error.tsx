"use client"

import { ErroAplicacao } from "@/components/erro-aplicacao"

/** Erro nas páginas fora das áreas (públicas por token, login, votação). */
export default function ErroRaiz({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  return (
    <main className="bg-muted/40 flex min-h-svh flex-col p-4">
      <ErroAplicacao error={error} reset={reset} />
    </main>
  )
}
