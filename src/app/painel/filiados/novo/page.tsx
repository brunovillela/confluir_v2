import type { Metadata } from "next"
import Link from "next/link"
import { ArrowLeft, FileSpreadsheet, UserPlus } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { requirePermissao } from "@/lib/auth"
import { listarFontesPagadoras } from "@/lib/db/fontes"

import { ImportarFiliados } from "../importar/importar-filiados"
import { NovaFiliacaoForm } from "./nova-filiacao-form"

export const metadata: Metadata = { title: "Nova filiação — Confluir" }

/**
 * Nova filiação com dois modos: inclusão INDIVIDUAL (formulário) ou EM MASSA
 * (planilha, o antigo "Importar filiados").
 */
export default async function NovaFiliacaoPage({
  searchParams,
}: {
  searchParams: Promise<{ modo?: string }>
}) {
  await requirePermissao("filiacao_gestao")
  const { modo } = await searchParams
  const massa = modo === "massa"

  const fontes = (await listarFontesPagadoras())
    .filter((f) => f.inativa !== true)
    .map((f) => ({
      id: f.id,
      nome: f.nome_fantasia ?? f.nome_razao ?? "(sem nome)",
    }))

  const aba = (ativo: boolean) =>
    `inline-flex items-center gap-2 rounded-md px-3 py-1.5 text-sm transition-colors ${
      ativo ? "bg-background shadow-xs font-medium" : "text-muted-foreground hover:text-foreground"
    }`

  return (
    <>
      <div>
        <Button variant="ghost" size="sm" asChild className="-ml-2 mb-3">
          <Link href="/painel/filiados">
            <ArrowLeft />
            Filiados
          </Link>
        </Button>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Nova filiação</h1>
            <p className="text-muted-foreground mt-1 text-xs">
              {massa
                ? "Sobe uma planilha CSV de filiados já vinculados a uma fonte pagadora."
                : "Registra um novo filiado — CPF é a identidade e não pode repetir."}
            </p>
          </div>
          <div className="bg-muted inline-flex rounded-lg p-1" role="tablist">
            <Link href="/painel/filiados/novo" className={aba(!massa)} role="tab" aria-selected={!massa}>
              <UserPlus className="size-4" />
              Inclusão individual
            </Link>
            <Link href="/painel/filiados/novo?modo=massa" className={aba(massa)} role="tab" aria-selected={massa}>
              <FileSpreadsheet className="size-4" />
              Inclusão em massa
            </Link>
          </div>
        </div>
      </div>

      {massa ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Planilha de filiados</CardTitle>
          </CardHeader>
          <CardContent>
            <ImportarFiliados fontes={fontes} />
          </CardContent>
        </Card>
      ) : (
        <NovaFiliacaoForm fontes={fontes} />
      )}
    </>
  )
}
