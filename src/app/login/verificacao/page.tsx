import type { Metadata } from "next"
import { redirect } from "next/navigation"

import { AuthShell } from "@/components/auth/auth-shell"
import { destinoSeguro } from "@/lib/mfa"
import { createClient } from "@/lib/supabase/server"

import { VerificacaoForm } from "./verificacao-form"

export const metadata: Metadata = { title: "Verificação em duas etapas — Confluir" }

/**
 * Segunda etapa do login: quem tem aplicativo autenticador cadastrado digita
 * o código de 6 dígitos. O proxy manda para cá toda sessão `aal1` de uma
 * conta com fator verificado (ver lib/mfa.ts).
 */
export default async function VerificacaoPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>
}) {
  const { next } = await searchParams
  const destino = destinoSeguro(next, "/painel")
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect(`/login?next=${encodeURIComponent(destino)}`)

  const [{ data: fatores }, { data: aal }] = await Promise.all([
    supabase.auth.mfa.listFactors(),
    supabase.auth.mfa.getAuthenticatorAssuranceLevel(),
  ])
  const verificados = (fatores?.totp ?? []).filter((f) => f.status === "verified")
  // Sem fator ou sessão já elevada: nada a verificar.
  if (verificados.length === 0 || aal?.currentLevel === "aal2") redirect(destino)

  return (
    <AuthShell rodape="Perdeu o acesso ao aplicativo? Peça à administração do sistema para redefinir a verificação da sua conta.">
      <VerificacaoForm fatorId={verificados[0].id} next={destino} />
    </AuthShell>
  )
}
