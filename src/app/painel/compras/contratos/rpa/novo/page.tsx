import type { Metadata } from "next"
import Link from "next/link"
import { ArrowLeft } from "lucide-react"

import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { requirePermissao } from "@/lib/auth"
import { listarFornecedores } from "@/lib/db/compras"
import { obterConfigRpa } from "@/lib/db/compras-rpa"

import { RpaNovoForm } from "../rpa-forms"

export const metadata: Metadata = { title: "Novo RPA — Confluir" }

export default async function NovoRpaPage() {
  await requirePermissao("aquisicoes_contratos_edicao")
  const [fornecedores, config] = await Promise.all([
    listarFornecedores(),
    obterConfigRpa(),
  ])

  return (
    <>
      <div>
        <Button asChild variant="ghost" size="sm" className="-ml-2 mb-3">
          <Link href="/painel/compras/contratos/rpa">
            <ArrowLeft />
            RPAs
          </Link>
        </Button>
        <h1 className="text-2xl font-semibold tracking-tight">Novo RPA</h1>
        <p className="text-muted-foreground mt-1 text-xs">
          Informe o valor bruto (o sistema calcula as retenções e o líquido) ou
          o líquido combinado (a conta inversa acha o bruto). A prévia atualiza
          enquanto você digita.
        </p>
      </div>

      <Card className="max-w-3xl">
        <CardHeader>
          <CardTitle className="text-base">Dados do recibo</CardTitle>
          <CardDescription>
            As retenções usam as tabelas configuradas na área de RPA — confira
            se estão atualizadas para o ano corrente.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <RpaNovoForm
            fornecedores={fornecedores
              .filter((f) => !f.bloqueado)
              .map((f) => ({
                id: f.id,
                nome: f.nome,
                pessoa_juridica: f.pessoa_juridica,
              }))}
            config={config}
          />
        </CardContent>
      </Card>
    </>
  )
}
