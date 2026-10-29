import type { Metadata } from "next"
import Link from "next/link"
import { notFound } from "next/navigation"
import { ArrowLeft, Settings2 } from "lucide-react"

import { RotuloTrilha } from "@/components/layout/trilha-rotulos"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { requirePermissao } from "@/lib/auth"
import { buscarRemessaPonto } from "@/lib/db/pessoal"
import { regrasApuracaoPonto } from "@/lib/db/ponto-config"
import { importacoesDaRemessa } from "@/lib/db/ponto-importacao"
import { formatarData } from "@/lib/formato"

import { ResumoRegras } from "./resumo-regras"
import { ImportarRelatorioForm } from "./upload-form"

export const metadata: Metadata = { title: "Importar relatório de ponto — Confluir" }
export const maxDuration = 300

/**
 * Importar o relatório do relógio para a remessa: o PDF é separado por
 * funcionário, lido pela IA e apurado pelas batidas; o gestor confere e
 * aplica na página da importação.
 */
export default async function ImportarRelatorioPage({ params }: { params: Promise<{ id: string }> }) {
  await requirePermissao("pessoal_gestao")
  const { id } = await params
  const [remessa, importacoes, regras] = await Promise.all([
    buscarRemessaPonto(id),
    importacoesDaRemessa(id),
    regrasApuracaoPonto(),
  ])
  if (!remessa) notFound()

  return (
    <>
      <RotuloTrilha valores={{ [id]: remessa.nome_remessa ?? "(sem nome)", importar: "Importar relatório" }} />
      <div>
        <Button variant="ghost" size="sm" asChild className="-ml-2 mb-3">
          <Link href={`/painel/pessoal/ponto/${id}`}>
            <ArrowLeft />
            {remessa.nome_remessa ?? "Remessa"}
          </Link>
        </Button>
        <h1 className="text-2xl font-semibold tracking-tight">Importar relatório de ponto</h1>
        <p className="text-muted-foreground mt-1 text-xs">
          O cartão ponto do relógio, com todos os funcionários, alguns ou um só
        </p>
      </div>

      {remessa.finalizada === true ? (
        <Alert>
          <AlertDescription>A remessa está finalizada — reabra em Editar remessa para importar.</AlertDescription>
        </Alert>
      ) : (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Enviar o relatório</CardTitle>
            <CardDescription>
              O sistema separa as páginas por funcionário (pelo CPF ou pelo nome do cadastro), a IA lê as batidas
              de cada um e as horas do mês são apuradas pelas batidas, com as regras da entidade. Nada entra na
              remessa antes de você conferir e aplicar. PDF com texto, gerado pelo relógio, de até 4 MB.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ImportarRelatorioForm remessaId={id} />
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-3">
          <div>
            <CardTitle className="text-base">Regras de apuração da entidade</CardTitle>
            <CardDescription>Valem para toda importação; mudá-las não altera registros já aplicados.</CardDescription>
          </div>
          <Button variant="outline" size="sm" asChild>
            <Link href="/painel/pessoal/ponto?regras=1#regras-hora-extra">
              <Settings2 />
              Alterar regras
            </Link>
          </Button>
        </CardHeader>
        <CardContent>
          <ResumoRegras regras={regras} />
        </CardContent>
      </Card>

      {importacoes.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Importações desta remessa</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="grid gap-1 text-sm">
              {importacoes.map((i) => (
                <li key={i.id}>
                  <Link href={`/painel/pessoal/ponto/${id}/importar/${i.id}`} className="hover:underline">
                    {i.nomeArquivo ?? "Relatório"}
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
