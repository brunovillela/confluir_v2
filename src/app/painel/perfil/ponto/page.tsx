import type { Metadata } from "next"
import { Clock4 } from "lucide-react"

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

export const metadata: Metadata = { title: "Meu controle de ponto — Confluir" }

/** Autosserviço: espelhos de ponto liberados para o próprio funcionário. */
export default async function MeuPontoPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>
}) {
  const sessao = await requireSessaoPainel()
  const { pontos } = await meusDocumentosPessoal(sessao.usuario.id)
  const params = await searchParams
  const paginacao = lerPaginacao(params, 10)

  return (
    <>
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">
          Meu controle de ponto
        </h1>
        <p className="text-muted-foreground mt-1 text-xs">
          Espelhos de ponto liberados pelo departamento de pessoal.
        </p>
      </div>

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="text-base">Espelhos de ponto</CardTitle>
            <Clock4 className="text-muted-foreground size-4" />
          </div>
          <CardDescription>
            {pontos.length} liberado{pontos.length === 1 ? "" : "s"}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <TabelaDocumentosPessoal
            documentos={pontos}
            vazio="Nenhum espelho de ponto liberado para você ainda."
            paginacao={paginacao}
            prefixo=""
          />
        </CardContent>
      </Card>
    </>
  )
}
