import type { Metadata } from "next"
import { redirect } from "next/navigation"

import { AuthShell } from "@/components/auth/auth-shell"
import { createClient } from "@/lib/supabase/server"

import { DefinirSenhaForm } from "./definir-senha-form"

export const metadata: Metadata = { title: "Definir senha — Confluir" }

/**
 * Destino pedido por quem chamou (?destino=). Só caminhos do portal: é o caso
 * do associado cuja conta nasceu em outro fluxo (votação, oposição) — pelo
 * tipo da conta, o "Continuar" o levaria ao painel. Nunca URL externa.
 */
function destinoPedido(valor: string | undefined): string | null {
  return valor && /^\/portal\/(?![/\\])/.test(valor) ? valor : null
}

export default async function DefinirSenhaPage({
  searchParams,
}: {
  searchParams: Promise<{ destino?: string }>
}) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect("/login")

  const tipo = user.user_metadata?.tipo
  const destino =
    destinoPedido((await searchParams).destino) ??
    (tipo === "filiado"
      ? "/portal/inicio"
      : tipo === "hotel"
        ? "/hotel/inicio"
        : "/painel")

  return (
    <AuthShell>
      <DefinirSenhaForm destino={destino} />
    </AuthShell>
  )
}
