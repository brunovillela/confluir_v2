import type { Metadata } from "next"
import Link from "next/link"
import { ArrowLeft } from "lucide-react"

import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { requirePermissao } from "@/lib/auth"
import { regrasRepasse, AVISO_SQL_REPASSE } from "@/lib/db/repasse"
import { regraEfetiva, TIPOS_CONTRIBUICAO, type RegraEfetiva, type TipoContribuicao } from "@/lib/repasse"

import { PrazosForm } from "./prazos-form"

export const metadata: Metadata = { title: "Prazos do controle de envio — Confluir" }

export default async function PrazosPage() {
  await requirePermissao("filiacao_receitas", ["filiacao_gestao"])
  const regras = await regrasRepasse()
  const efetivas = Object.fromEntries(
    TIPOS_CONTRIBUICAO.map((t) => [t, regraEfetiva(t, regras.geral[t])])
  ) as Record<TipoContribuicao, RegraEfetiva>
  const desde = regras.desde ? `${Math.floor(regras.desde / 100)}-${String(regras.desde % 100).padStart(2, "0")}` : ""
  const excecoes = regras.porEmpresa.size

  return (
    <>
      <div>
        <Button variant="ghost" size="sm" asChild className="-ml-2 mb-3">
          <Link href="/painel/filiados/receitas/controle">
            <ArrowLeft />
            Controle de envio
          </Link>
        </Button>
        <h1 className="text-2xl font-semibold tracking-tight">Prazos e tipos</h1>
        <p className="text-muted-foreground mt-1 max-w-2xl text-sm">
          A regra geral da entidade. Uma empresa com prazo diferente, ou que não desconta algum tipo, ganha uma regra
          própria na página dela (Representação → Empregadores → aba Arrecadação).
        </p>
      </div>
      {!regras.disponivel ? (
        <Alert>
          <AlertDescription>{AVISO_SQL_REPASSE}</AlertDescription>
        </Alert>
      ) : (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Regra geral</CardTitle>
            <CardDescription>
              {excecoes > 0 ? `${excecoes} empresa(s) têm regra própria.` : "Nenhuma empresa tem regra própria ainda."}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <PrazosForm desde={desde} regras={efetivas} />
          </CardContent>
        </Card>
      )}
    </>
  )
}
