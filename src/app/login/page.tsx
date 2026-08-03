import type { Metadata } from "next"
import Link from "next/link"
import { redirect } from "next/navigation"

import { AuthShell } from "@/components/auth/auth-shell"
import { getSessaoPainel } from "@/lib/auth"

import { LoginForm } from "./login-form"

export const metadata: Metadata = { title: "Entrar — Confluir" }

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; erro?: string }>
}) {
  const { next, erro } = await searchParams

  const sessao = await getSessaoPainel()
  if (sessao) redirect("/painel")

  return (
    <AuthShell
      rodape={
        <>
          É filiado?{" "}
          <Link
            href="/portal"
            className="text-foreground font-medium underline-offset-4 hover:underline"
          >
            Acesse o Portal do Associado
          </Link>
        </>
      }
    >
      <LoginForm next={next} erroInicial={erro} />
    </AuthShell>
  )
}
