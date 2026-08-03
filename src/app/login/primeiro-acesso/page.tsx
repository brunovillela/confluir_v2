import type { Metadata } from "next"

import { AuthShell } from "@/components/auth/auth-shell"
import { FormEmail } from "@/components/auth/form-email"

import { solicitarPrimeiroAcesso } from "../actions"

export const metadata: Metadata = { title: "Primeiro acesso — Confluir" }

export default function PrimeiroAcessoPage() {
  return (
    <AuthShell>
      <FormEmail
        titulo="Primeiro acesso"
        descricao="Informe o email do seu cadastro de funcionário. Enviaremos um convite para você definir sua senha."
        rotuloBotao="Enviar convite"
        action={solicitarPrimeiroAcesso}
      />
    </AuthShell>
  )
}
