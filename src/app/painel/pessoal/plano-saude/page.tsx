import type { Metadata } from "next"
import Link from "next/link"
import { ArrowLeft, CalendarRange, HeartPulse } from "lucide-react"

import { Alert, AlertDescription } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { requirePermissao } from "@/lib/auth"
import { contratosParaVincular, listarContratosSaude, ROTULO_TIPO_CONTRATACAO } from "@/lib/db/plano-saude"

import { ContratoForm } from "./forms"

export const metadata: Metadata = { title: "Plano de saúde — Confluir" }

const MESES = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"]

export default async function PlanoSaudePage({ searchParams }: { searchParams: Promise<{ apagado?: string }> }) {
  await requirePermissao("pessoal_gestao")
  const { apagado } = await searchParams
  const [{ disponivel, contratos }, vinculaveis] = await Promise.all([listarContratosSaude(), contratosParaVincular().catch(() => [])])

  return (
    <>
      <div>
        <Button variant="ghost" size="sm" asChild className="-ml-2 mb-3">
          <Link href="/painel/pessoal">
            <ArrowLeft />
            Pessoal
          </Link>
        </Button>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Plano de saúde</h1>
            <p className="text-muted-foreground mt-1 text-sm">
              Contratos, tabelas por faixa etária, regras de custeio e de dependentes, quem está no plano e a conferência do mês.
            </p>
          </div>
          {disponivel && contratos.length > 0 && (
            <Button asChild>
              <Link href="/painel/pessoal/plano-saude/mes">
                <CalendarRange />
                Conferência do mês
              </Link>
            </Button>
          )}
        </div>
      </div>

      {!disponivel && (
        <Alert>
          <AlertDescription>O plano de saúde ainda não está ligado nesta entidade (falta aplicar a atualização do banco de dados).</AlertDescription>
        </Alert>
      )}
      {apagado && (
        <Alert>
          <AlertDescription>Contrato apagado.</AlertDescription>
        </Alert>
      )}

      {disponivel && (
        <>
          {contratos.length === 0 ? (
            <Card>
              <CardContent className="text-muted-foreground py-6 text-sm">
                Nenhum contrato cadastrado. Comece pelo contrato com a operadora; depois cadastre os produtos, as tabelas de preço, as
                regras e quem está no plano.
              </CardContent>
            </Card>
          ) : (
            <div className="grid gap-3 md:grid-cols-2">
              {contratos.map((c) => (
                <Link key={c.id} href={`/painel/pessoal/plano-saude/${c.id}`} className="group">
                  <Card className="group-hover:border-primary h-full transition-colors">
                    <CardHeader>
                      <CardTitle className="flex items-center gap-2 text-base">
                        <HeartPulse className="text-primary size-4" />
                        {c.nome}
                        {!c.ativo && <Badge variant="outline">Inativo</Badge>}
                      </CardTitle>
                      <CardDescription>
                        {c.operadora} · {ROTULO_TIPO_CONTRATACAO[c.tipoContratacao]}
                        {c.mesAniversario ? ` · reajuste em ${MESES[c.mesAniversario - 1]}` : ""}
                      </CardDescription>
                    </CardHeader>
                    <CardContent className="text-muted-foreground text-sm">
                      {c.produtos} produto{c.produtos === 1 ? "" : "s"} · {c.beneficiarios} beneficiário{c.beneficiarios === 1 ? "" : "s"} no plano
                      {c.coparticipacao ? " · com coparticipação" : ""}
                    </CardContent>
                  </Card>
                </Link>
              ))}
            </div>
          )}

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Novo contrato</CardTitle>
              <CardDescription>Um contrato por operadora (ou por contrato, se houver mais de um com a mesma).</CardDescription>
            </CardHeader>
            <CardContent>
              <ContratoForm vinculaveis={vinculaveis} />
            </CardContent>
          </Card>
        </>
      )}
    </>
  )
}
