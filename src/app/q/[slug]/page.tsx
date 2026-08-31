import type { Metadata } from "next"
import { redirect } from "next/navigation"
import { QrCode as QrCodeIcon } from "lucide-react"

import { qrPorSlug, registrarLeitura } from "@/lib/db/comunicacao-qrcodes"
import { obterOrganizacao } from "@/lib/db/organizacao"

export const metadata: Metadata = { title: "Link — Confluir" }

/**
 * Redirecionamento público dos QR Codes dinâmicos (Comunicação › QR Codes).
 * SEM login — o tenant vem do host (proxy). QR ativo → conta a leitura e
 * redireciona ao destino; inativo ou inexistente → página de aviso.
 */
export default async function QrRedirectPage({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  const { slug } = await params
  const qr = await qrPorSlug(slug)

  if (qr?.ativo && qr.destino_url) {
    await registrarLeitura(qr.id)
    redirect(qr.destino_url)
  }

  const organizacao = await obterOrganizacao().catch(() => null)
  const nome =
    organizacao?.nomeFantasia ?? organizacao?.nomeRazao ?? "a organização"

  return (
    <main className="bg-background flex min-h-svh items-center justify-center p-6">
      <div className="w-full max-w-md rounded-xl border p-8 text-center">
        <QrCodeIcon className="text-muted-foreground mx-auto mb-4 size-10" />
        <h1 className="text-lg font-semibold">
          {qr ? "Este QR Code foi desativado" : "QR Code não encontrado"}
        </h1>
        <p className="text-muted-foreground mt-2 text-sm">
          {qr
            ? `O conteúdo deste QR Code não está mais disponível. Em caso de dúvida, procure ${nome}.`
            : `Este link não existe ou foi removido. Confira se o endereço está correto ou procure ${nome}.`}
        </p>
      </div>
    </main>
  )
}
