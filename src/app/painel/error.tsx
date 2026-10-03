"use client"

import { ErroAplicacao } from "@/components/erro-aplicacao"

/** Erro dentro do painel: mantém a sidebar e o cabeçalho do layout. */
export default function ErroPainel({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  return <ErroAplicacao error={error} reset={reset} voltarPara="/painel" rotuloVoltar="Voltar ao painel" />
}
