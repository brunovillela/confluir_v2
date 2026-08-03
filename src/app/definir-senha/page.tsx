import type { Metadata } from "next"
import { redirect } from "next/navigation"

import { AuthShell } from "@/components/auth/auth-shell"
import { createClient } from "@/lib/supabase/server"

import { DefinirSenhaForm } from "./definir-senha-form"

export const metadata: Metadata = { title: "Definir senha — Confluir" }

export default async function DefinirSenhaPage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect("/login")

  const tipo = user.user_metadata?.tipo
  const destino =
    tipo === "filiado"
      ? "/portal/inicio"
      : tipo === "hotel"
        ? "/hotel/inicio"
        : "/painel"

  return (
    <AuthShell>
      <DefinirSenhaForm destino={destino} />
    </AuthShell>
  )
}
