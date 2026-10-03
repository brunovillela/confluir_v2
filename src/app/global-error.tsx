"use client"

import { useEffect } from "react"
import * as Sentry from "@sentry/nextjs"

/**
 * Último recurso: erro no próprio layout raiz. Precisa definir html/body
 * porque substitui o layout inteiro — por isso não usa os componentes do app.
 */
export default function ErroGlobal({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    Sentry.captureException(error)
  }, [error])

  return (
    <html lang="pt-BR">
      <body
        style={{
          margin: 0,
          minHeight: "100vh",
          display: "grid",
          placeItems: "center",
          fontFamily: "system-ui, sans-serif",
          background: "#f6f7f9",
          color: "#091747",
        }}
      >
        <title>Algo deu errado — Confluir</title>
        <main style={{ maxWidth: 420, padding: 32, textAlign: "center" }}>
          <h1 style={{ fontSize: 20, margin: "0 0 8px" }}>Algo deu errado</h1>
          <p style={{ fontSize: 14, color: "#4b5563", margin: "0 0 4px" }}>
            Não foi possível carregar o Confluir. Tente de novo; se continuar, informe o código
            abaixo à equipe do sistema.
          </p>
          {error.digest && (
            <p style={{ fontSize: 12, fontFamily: "monospace", color: "#6b7280" }}>
              Código: {error.digest}
            </p>
          )}
          <button
            onClick={reset}
            style={{
              marginTop: 16,
              padding: "8px 16px",
              borderRadius: 8,
              border: 0,
              background: "#FF5722",
              color: "#fff",
              fontWeight: 600,
              cursor: "pointer",
            }}
          >
            Tentar de novo
          </button>
        </main>
      </body>
    </html>
  )
}
