import type { Metadata } from "next"
import Link from "next/link"
import { Download, FileSpreadsheet, Info, Sparkles } from "lucide-react"

import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { requirePermissao } from "@/lib/auth"

import { CatForm, ImportarCatsForm } from "../cat-forms"

export const metadata: Metadata = { title: "Incluir CAT — Confluir" }

export default async function NovaCatPage() {
  await requirePermissao("saude_cat", ["saude_gestao"])

  return (
    <>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Incluir CAT</h1>
          <p className="text-muted-foreground mt-1 text-xs">
            Importação de planilha ou cadastro individual
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button asChild>
            <Link href="/painel/saude/cat/nova/pdf">
              <Sparkles />
              Ler de PDF com IA
            </Link>
          </Button>
          <Button variant="outline" asChild>
            <Link href="/painel/saude/cat">Voltar à lista</Link>
          </Button>
        </div>
      </div>

      {/* Importação em massa */}
      <Card>
        <CardContent className="grid gap-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="flex items-center gap-2 font-medium">
                <FileSpreadsheet className="text-muted-foreground size-4" />
                Importar planilha
              </p>
              <p className="text-muted-foreground mt-1 text-xs">
                Salve a planilha do Excel como <strong>CSV</strong> e envie
                aqui.
              </p>
            </div>
            <Button variant="outline" size="sm" asChild>
              <Link href="/painel/saude/cat/nova/modelo">
                <Download />
                Baixar modelo
              </Link>
            </Button>
          </div>

          <Alert>
            <Info />
            <AlertDescription>
              <p className="mb-1">
                As colunas são reconhecidas pela <strong>numeração do
                formulário da CAT</strong> — um cabeçalho como{" "}
                <code>19 - Data do acidente</code> ou{" "}
                <code>19 - ACIDENTE Data do acidente</code> casa igual. Colunas
                sem correspondência são ignoradas, e a ordem não importa.
              </p>
              <p className="mb-1">
                Obrigatórios: <strong>11</strong> (nome do acidentado) e{" "}
                <strong>19</strong> (data do acidente, em DD/MM/AAAA).
              </p>
              <p>
                A importação é <strong>tudo ou nada</strong>: se qualquer linha
                tiver problema, ou se algum número de CAT já existir na base,
                nada é gravado e o motivo é informado.
              </p>
            </AlertDescription>
          </Alert>

          <ImportarCatsForm />
        </CardContent>
      </Card>

      {/* Cadastro individual */}
      <div>
        <h2 className="mb-1 text-lg font-semibold tracking-tight">
          Cadastro individual
        </h2>
        <p className="text-muted-foreground mb-3 text-sm">
          Os 50 campos do formulário oficial. Só o nome do acidentado e a data
          do acidente são obrigatórios — o resto pode ficar em branco.
        </p>
        <CatForm />
      </div>
    </>
  )
}
