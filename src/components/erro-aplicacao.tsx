"use client"

import { useEffect } from "react"
import Link from "next/link"
import * as Sentry from "@sentry/nextjs"
import { TriangleAlert } from "lucide-react"

import { Button } from "@/components/ui/button"

/**
 * Tela de erro em português, usada pelos error.tsx das áreas e pela raiz.
 * Mostra o identificador do erro (digest) para a pessoa informar ao suporte,
 * nunca a mensagem técnica. Envia o erro ao Sentry quando ele está ligado.
 */
export function ErroAplicacao({
  error,
  reset,
  voltarPara = "/",
  rotuloVoltar = "Ir para o início",
}: {
  error: Error & { digest?: string }
  reset: () => void
  voltarPara?: string
  rotuloVoltar?: string
}) {
  useEffect(() => {
    Sentry.captureException(error)
  }, [error])

  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-4 py-16 text-center">
      <div className="bg-muted flex size-14 items-center justify-center rounded-full">
        <TriangleAlert className="text-muted-foreground size-7" />
      </div>
      <div className="space-y-1">
        <h1 className="text-xl font-semibold tracking-tight">Algo deu errado</h1>
        <p className="text-muted-foreground max-w-md text-sm text-balance">
          Não foi possível concluir esta ação. Tente de novo; se o problema continuar, informe
          o código abaixo à equipe do sistema.
        </p>
        {error.digest && (
          <p className="text-muted-foreground font-mono text-xs">Código: {error.digest}</p>
        )}
      </div>
      <div className="flex flex-wrap justify-center gap-2">
        <Button onClick={reset}>Tentar de novo</Button>
        <Button asChild variant="outline">
          <Link href={voltarPara}>{rotuloVoltar}</Link>
        </Button>
      </div>
    </div>
  )
}
