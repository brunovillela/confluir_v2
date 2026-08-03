import type { Metadata } from "next"
import Link from "next/link"
import { redirect } from "next/navigation"

import { AuthShell } from "@/components/auth/auth-shell"
import { getSessaoPortal } from "@/lib/auth"

import { PortalLoginForm } from "./portal-login-form"

export const metadata: Metadata = {
  title: "Portal do Associado — Confluir",
}

export default async function PortalPage() {
  const sessao = await getSessaoPortal()
  if (sessao) redirect("/portal/inicio")

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
      <PortalLoginForm />
    </AuthShell>
  )
}
