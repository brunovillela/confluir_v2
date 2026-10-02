import type { Metadata } from "next"

import { AuthShell } from "@/components/auth/auth-shell"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"

import { CriarSenhaForm } from "./criar-senha-form"

export const metadata: Metadata = { title: "Criar senha — Confluir" }

/**
 * Destino dos links de convite e de "esqueci minha senha": mostra direto o
 * formulário de senha. A página não confere nem gasta o código — isso só
 * acontece ao salvar (ver actions.ts).
 */
export default async function CriarSenhaPage({
  searchParams,
}: {
  searchParams: Promise<{ token_hash?: string; type?: string; destino?: string }>
}) {
  const { token_hash: tokenHash, type: tipo, destino } = await searchParams

  return (
    <AuthShell>
      {tokenHash && tipo ? (
        <CriarSenhaForm tokenHash={tokenHash} tipo={tipo} destino={destino ?? null} />
      ) : (
        <Card>
          <CardHeader>
            <CardTitle>Link incompleto</CardTitle>
          </CardHeader>
          <CardContent className="text-sm">
            Abra o link completo que você recebeu, ou peça um novo a quem enviou o acesso.
          </CardContent>
        </Card>
      )}
    </AuthShell>
  )
}
