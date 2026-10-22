import type { Metadata } from "next"
import Link from "next/link"
import { ArrowLeft } from "lucide-react"

import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { requirePermissao } from "@/lib/auth"
import { buscarContrato, carregarOpcoesAjuda } from "@/lib/db/contratos"

import { ContratoForm } from "../../../compras/contratos/contrato-forms"
import { atualizarAjudaAction, criarAjudaAction } from "../actions"

export const metadata: Metadata = { title: "Nova ajuda institucional — Confluir" }

export default async function NovaAjudaPage({
  searchParams,
}: {
  searchParams: Promise<{ principal?: string }>
}) {
  const sessao = await requirePermissao("apoio_institucional_edicao")
  const { principal } = await searchParams

  const [opcoes, principalDetalhe] = await Promise.all([
    carregarOpcoesAjuda(),
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
                ? `/painel/institucional/ajudas/${principalDetalhe.contrato.id}`
                : "/painel/institucional/ajudas"
            }
          >
            <ArrowLeft />
            {principalDetalhe ? "Ajuda principal" : "Ajudas institucionais"}
          </Link>
        </Button>
        <h1 className="text-2xl font-semibold tracking-tight">
          {ehAditivo ? "Novo aditivo de ajuda" : "Nova ajuda institucional"}
        </h1>
        <p className="text-muted-foreground mt-1 text-xs">
          {ehAditivo
            ? "Aditivo vinculado à ajuda principal"
            : "Apoio da entidade a uma organização apoiada — o arquivo e os aditivos entram na página da ajuda"}
        </p>
      </div>

      {principalDetalhe && (
        <Alert className="border-info/40 text-info-fg">
          <AlertDescription>
            Aditivo da ajuda{" "}
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
          <CardTitle className="text-base">Dados da ajuda</CardTitle>
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
            aoCancelarHref="/painel/institucional/ajudas"
            acaoCriar={criarAjudaAction}
            acaoAtualizar={atualizarAjudaAction}
            beneficiarioRotulo="Entidade apoiada"
            mostrarCategoria={false}
            rotuloSubmit="Cadastrar ajuda"
          />
        </CardContent>
      </Card>
    </>
  )
}
