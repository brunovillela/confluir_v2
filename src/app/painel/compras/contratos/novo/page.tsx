import type { Metadata } from "next"
import Link from "next/link"
import { ArrowLeft } from "lucide-react"

import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { requirePermissao } from "@/lib/auth"
import { buscarContrato, carregarOpcoesContrato } from "@/lib/db/contratos"

import { ContratoForm } from "../contrato-forms"

export const metadata: Metadata = { title: "Novo contrato — Confluir" }

export default async function NovoContratoPage({
  searchParams,
}: {
  searchParams: Promise<{ principal?: string }>
}) {
  const sessao = await requirePermissao("aquisicoes_contratos_edicao")
  const { principal } = await searchParams

  const [opcoes, principalDetalhe] = await Promise.all([
    carregarOpcoesContrato(),
    principal ? buscarContrato(principal) : Promise.resolve(null),
  ])
  const ehAditivo = Boolean(principalDetalhe)

  return (
    <>
      <div>
        <Button variant="ghost" size="sm" asChild className="-ml-2 mb-3">
          <Link
            href={
              principalDetalhe
                ? `/painel/compras/contratos/${principalDetalhe.contrato.id}`
                : "/painel/compras/contratos"
            }
          >
            <ArrowLeft />
            {principalDetalhe ? "Contrato principal" : "Contratos"}
          </Link>
        </Button>
        <h1 className="text-2xl font-semibold tracking-tight">
          {ehAditivo ? "Novo aditivo" : "Novo contrato"}
        </h1>
        <p className="text-muted-foreground mt-1 text-xs">
          {ehAditivo
            ? "Aditivo vinculado ao contrato principal"
            : "Cadastro do contrato — o arquivo e os aditivos entram na página do contrato"}
        </p>
      </div>

      {principalDetalhe && (
        <Alert className="border-info/40 text-info-fg">
          <AlertDescription>
            Aditivo do contrato{" "}
            <span className="tabular-nums">
              {principalDetalhe.contrato.codigo ?? "(sem código)"}
            </span>
            {principalDetalhe.contrato.objeto &&
              ` — ${principalDetalhe.contrato.objeto}`}
            .
          </AlertDescription>
        </Alert>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Dados do contrato</CardTitle>
        </CardHeader>
        <CardContent>
          <ContratoForm
            fornecedores={opcoes.fornecedores}
            departamentos={opcoes.departamentos}
            centrosCusto={opcoes.centrosCusto}
            usuarios={opcoes.usuarios}
            categorias={opcoes.categorias}
            contratoPrincipalId={principalDetalhe?.contrato.id}
            responsavelPadraoId={sessao.usuario.id}
            aoCancelarHref="/painel/compras/contratos"
          />
        </CardContent>
      </Card>
    </>
  )
}
