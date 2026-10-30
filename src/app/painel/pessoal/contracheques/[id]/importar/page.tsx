import type { Metadata } from "next"
import Link from "next/link"
import { notFound } from "next/navigation"
import { ArrowLeft } from "lucide-react"

import { RotuloTrilha } from "@/components/layout/trilha-rotulos"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { requirePermissao } from "@/lib/auth"
import { importacoesDaRemessaCC } from "@/lib/db/contracheque-importacao"
import { obterConfigContracheques } from "@/lib/db/contracheques-ordens"
import { buscarRemessaContracheques } from "@/lib/db/pessoal"
import { formatarData } from "@/lib/formato"

import { ImportarFolhaForm } from "./upload-form"

export const metadata: Metadata = { title: "Importar folha de contracheques — Confluir" }
export const maxDuration = 300

/**
 * Importar a folha em PDF para a remessa: o PDF é separado por funcionário, a
 * IA lê o líquido de cada um; o gestor confere e aplica na página da
 * importação. Contracheque não acumula: não há saldo de um mês para o outro.
 */
export default async function ImportarFolhaPage({ params }: { params: Promise<{ id: string }> }) {
  await requirePermissao("pessoal_gestao", ["pessoal_contracheque"])
  const { id } = await params
  const [remessa, importacoes, config] = await Promise.all([
    buscarRemessaContracheques(id),
    importacoesDaRemessaCC(id),
    obterConfigContracheques(),
  ])
  if (!remessa) notFound()

  return (
    <>
      <RotuloTrilha valores={{ [id]: remessa.nome_remessa ?? "Remessa", importar: "Importar folha" }} />
      <div>
        <Button variant="ghost" size="sm" asChild className="-ml-2 mb-3">
          <Link href={`/painel/pessoal/contracheques/${id}`}>
            <ArrowLeft />
            {remessa.nome_remessa ?? "Remessa"}
          </Link>
        </Button>
        <h1 className="text-2xl font-semibold tracking-tight">Importar folha de contracheques</h1>
        <p className="text-muted-foreground mt-1 text-xs">
          O PDF da folha, com todos os funcionários, alguns ou um só
        </p>
      </div>

      {remessa.finalizada === true ? (
        <Alert>
          <AlertDescription>A remessa está finalizada — reabra em Editar remessa para importar.</AlertDescription>
        </Alert>
      ) : (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Enviar a folha</CardTitle>
            <CardDescription>
              O sistema separa as páginas por funcionário (pelo CPF ou pelo nome do cadastro) e a IA lê o valor
              líquido, os totais de proventos e descontos e a competência de cada um. Nada entra na remessa antes de
              você conferir e aplicar, e nada é enviado ao funcionário: os contracheques entram bloqueados.{" "}
              {config.gerarOrdem
                ? "Como a geração de ordens está ligada, cada contracheque aplicado gera a ordem de pagamento com o líquido."
                : "A geração de ordens está desligada: os contracheques entram sem ordem de pagamento."}{" "}
              PDF com texto, gerado pelo sistema da folha, de até 4 MB, com um funcionário por página.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ImportarFolhaForm remessaId={id} />
          </CardContent>
        </Card>
      )}

      {importacoes.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Importações desta remessa</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="grid gap-1 text-sm">
              {importacoes.map((i) => (
                <li key={i.id}>
                  <Link href={`/painel/pessoal/contracheques/${id}/importar/${i.id}`} className="hover:underline">
                    {i.nomeArquivo ?? "Folha"}
                  </Link>
                  <span className="text-muted-foreground">
                    {" "}
                    · {i.paginas} página(s) · {formatarData(i.criadoEm)}
                  </span>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}
    </>
  )
}
