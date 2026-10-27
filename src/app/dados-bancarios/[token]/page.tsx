import type { Metadata } from "next"
import { Landmark } from "lucide-react"

import { Marca } from "@/components/marca"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { pedidoPublico } from "@/lib/db/pedidos-dados-bancarios"
import { formatarData } from "@/lib/formato"

import { RespostaForm } from "./resposta-form"

export const metadata: Metadata = {
  title: "Dados bancários — Confluir",
  robots: { index: false },
}

const FIM: Record<"respondido" | "expirado" | "cancelado", string> = {
  respondido: "Este link já foi usado: seus dados bancários foram recebidos.",
  expirado: "Este link expirou. Peça um novo à entidade.",
  cancelado: "Este link foi substituído ou cancelado. Use o link mais recente que a entidade mandou.",
}

/**
 * Página do favorecido, aberta pelo link do pedido (sem login): ele informa a
 * chave Pix ou a conta, no próprio CPF/CNPJ (lib/db/pedidos-dados-bancarios).
 */
export default async function DadosBancariosPedidoPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  const pedido = await pedidoPublico(token)

  return (
    <main className="mx-auto w-full max-w-2xl px-4 py-10">
      <div className="mb-6 flex justify-center">
        <Marca variante="completa" />
      </div>
      {!pedido ? (
        <Alert variant="destructive">
          <AlertDescription>Link inválido. Confira se abriu o endereço completo que a entidade mandou.</AlertDescription>
        </Alert>
      ) : (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Landmark className="size-5" />
              Seus dados bancários
            </CardTitle>
            <CardDescription>
              {pedido.entidade} pede a chave Pix ou a conta bancária de <strong>{pedido.nome}</strong> para fazer os
              pagamentos.
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4">
            {pedido.situacao !== "aberto" ? (
              <Alert>
                <AlertDescription>{FIM[pedido.situacao]}</AlertDescription>
              </Alert>
            ) : (
              <>
                <p className="text-muted-foreground text-sm">
                  Informe a chave Pix, a conta, ou as duas. A conta precisa estar no seu CPF/CNPJ
                  {pedido.documentoMascarado ? ` (${pedido.documentoMascarado})` : ""}. O link vale até{" "}
                  {formatarData(pedido.expiraEm)} e serve uma vez.
                </p>
                <RespostaForm token={token} />
              </>
            )}
          </CardContent>
        </Card>
      )}
    </main>
  )
}
