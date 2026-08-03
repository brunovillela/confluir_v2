import type { Metadata } from "next"
import { redirect } from "next/navigation"

import { Marca } from "@/components/marca"
import { mascararEmail } from "@/lib/contas"
import { obterSolicitacaoPorToken } from "@/lib/db/filiacao-publica"

import { VerificarForm } from "./verificar-form"

export const metadata: Metadata = {
  title: "Confirme seu e-mail — Confluir",
  robots: { index: false },
}

export default async function VerificarPage({
  searchParams,
}: {
  searchParams: Promise<{ s?: string }>
}) {
  const { s: token } = await searchParams
  const solicitacao = token ? await obterSolicitacaoPorToken(token) : null

  if (!token || !solicitacao) {
    return (
      <main className="mx-auto w-full max-w-md px-4 py-12 text-center">
        <Marca variante="completa" />
        <p className="text-muted-foreground mt-8 text-sm">
          Link inválido ou expirado. Reinicie a filiação em{" "}
          <a href="/filiar" className="text-foreground underline underline-offset-4">
            /filiar
          </a>
          .
        </p>
      </main>
    )
  }

  // Já verificado → segue direto para a ficha.
  if (solicitacao.situacao !== "aguardando_verificacao") {
    redirect(`/ficha/${token}`)
  }

  return (
    <main className="mx-auto w-full max-w-md px-4 py-12">
      <div className="mb-8 flex flex-col items-center text-center">
        <Marca variante="completa" />
        <h1 className="mt-6 text-2xl font-semibold tracking-tight">
          Confirme seu e-mail
        </h1>
        <p className="text-muted-foreground mt-1 text-sm">
          Enviamos um código de 6 dígitos para{" "}
          <span className="text-foreground font-medium">
            {solicitacao.email ? mascararEmail(solicitacao.email) : "seu e-mail"}
          </span>
          .
        </p>
      </div>

      <VerificarForm token={token} />
    </main>
  )
}
