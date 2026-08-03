import type { Metadata } from "next"
import { ReceiptText } from "lucide-react"

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { TabelaDocumentosPessoal } from "@/components/tabela-documentos-pessoal"
import { requireSessaoPainel } from "@/lib/auth"
import { meusDocumentosPessoal } from "@/lib/db/pessoal"
import { lerPaginacao } from "@/lib/paginacao"

export const metadata: Metadata = { title: "Meus contracheques — Confluir" }

/** Autosserviço: cada funcionário vê SOMENTE os próprios contracheques LIBERADOS. */
export default async function MeusContrachequesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>
}) {
  const sessao = await requireSessaoPainel()
  const { contracheques } = await meusDocumentosPessoal(sessao.usuario.id)

  const params = await searchParams
  const pagContracheques = lerPaginacao(params, 10, "c")

  return (
    <>
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">
          Meus contracheques
        </h1>
        <p className="text-muted-foreground mt-1 text-xs">
          Contracheques liberados pelo departamento de pessoal.
        </p>
      </div>

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="text-base">Contracheques</CardTitle>
            <ReceiptText className="text-muted-foreground size-4" />
          </div>
          <CardDescription>
            {contracheques.length} liberado
            {contracheques.length === 1 ? "" : "s"}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <TabelaDocumentosPessoal
            documentos={contracheques}
            vazio="Nenhum contracheque liberado para você ainda."
            paginacao={pagContracheques}
            prefixo="c"
          />
        </CardContent>
      </Card>
    </>
  )
}
