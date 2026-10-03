"use client"

import { ErroAplicacao } from "@/components/erro-aplicacao"

/** Erro dentro da área do hotel: mantém o menu da área. */
export default function ErroHotel({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  return <ErroAplicacao error={error} reset={reset} voltarPara="/hotel/inicio" rotuloVoltar="Voltar ao início" />
}
