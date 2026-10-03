import * as Sentry from "@sentry/nextjs"
import { NextResponse, type NextRequest } from "next/server"

/**
 * Destino dos relatórios da Content-Security-Policy (modo relatório, ver
 * next.config.ts). O navegador manda aqui cada recurso que a política
 * bloquearia; nada é bloqueado enquanto ela estiver em Report-Only. Os
 * relatórios vão para o log e, quando ligado, para o Sentry como aviso.
 */
export async function POST(request: NextRequest) {
  let corpo: unknown = null
  try {
    corpo = await request.json()
  } catch {
    return new NextResponse(null, { status: 204 })
  }
  const r = (corpo as { "csp-report"?: Record<string, unknown> })?.["csp-report"] ?? corpo
  const resumo = {
    diretiva: (r as Record<string, unknown>)?.["violated-directive"] ?? (r as Record<string, unknown>)?.effectiveDirective,
    bloqueado: (r as Record<string, unknown>)?.["blocked-uri"] ?? (r as Record<string, unknown>)?.blockedURL,
    pagina: (r as Record<string, unknown>)?.["document-uri"] ?? (r as Record<string, unknown>)?.documentURL,
  }
  console.warn("[csp] violação relatada:", JSON.stringify(resumo))
  Sentry.captureMessage(`CSP: ${String(resumo.diretiva)} bloquearia ${String(resumo.bloqueado)}`, {
    level: "warning",
    extra: resumo,
  })
  return new NextResponse(null, { status: 204 })
}
