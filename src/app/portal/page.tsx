import type { Metadata } from "next"
import Link from "next/link"
import { redirect } from "next/navigation"

import { AuthShell } from "@/components/auth/auth-shell"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { getSessaoPortal } from "@/lib/auth"
import { mensagemLinkRecusado } from "@/lib/auth-email-constantes"

import { PortalLoginForm } from "./portal-login-form"

export const metadata: Metadata = {
  title: "Portal do Associado — Confluir",
}

export default async function PortalPage({
  searchParams,
}: {
  searchParams: Promise<{ erro?: string }>
}) {
  const sessao = await getSessaoPortal()
  if (sessao) redirect("/portal/inicio")

  // Link de acesso recusado em /auth/confirm (vencido, já usado…).
  const { erro } = await searchParams
  const mensagemErro = mensagemLinkRecusado(erro, "portal")

  return (
    <AuthShell
      rodape={
        <>
          É funcionário do sindicato?{" "}
          <Link
            href="/login"
            className="text-foreground font-medium underline-offset-4 hover:underline"
          >
            Entre pelo painel
          </Link>
        </>
      }
    >
      <div className="grid gap-4">
        {mensagemErro && (
          <Alert variant="destructive">
            <AlertDescription>{mensagemErro}</AlertDescription>
          </Alert>
        )}
        <PortalLoginForm />
      </div>
    </AuthShell>
  )
}
