"use client"

import { ErroAplicacao } from "@/components/erro-aplicacao"

/** Erro dentro do portal do associado: mantém o menu do portal. */
export default function ErroPortal({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  return <ErroAplicacao error={error} reset={reset} voltarPara="/portal/inicio" rotuloVoltar="Voltar ao início" />
}
