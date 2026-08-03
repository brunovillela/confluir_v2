import type { Metadata } from "next"

import { AuthShell } from "@/components/auth/auth-shell"
import { FormEmail } from "@/components/auth/form-email"

import { solicitarRedefinicaoSenha } from "../actions"

export const metadata: Metadata = { title: "Recuperar senha — Confluir" }

export default function RecuperarSenhaPage() {
  return (
    <AuthShell>
      <FormEmail
        titulo="Recuperar senha"
        descricao="Informe seu email e enviaremos um link para redefinir a senha."
        rotuloBotao="Enviar link"
        action={solicitarRedefinicaoSenha}
      />
    </AuthShell>
  )
}
