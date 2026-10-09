import type { Metadata } from "next"
import Link from "next/link"
import { ArrowLeft, Building2, ChevronRight, Plus } from "lucide-react"

import { Alert, AlertDescription } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { requirePermissao } from "@/lib/auth"
import { AVISO_SQL_GRUPOS, listarGrupos } from "@/lib/db/grupos-empresariais"

export const metadata: Metadata = { title: "Grupos empresariais — Confluir" }

export default async function GruposPage({
  searchParams,
}: {
  searchParams: Promise<{ excluido?: string }>
}) {
  await requirePermissao("empregadores")
  const { excluido } = await searchParams
  const { grupos, esquemaPronto } = await listarGrupos()

  return (
    <>
      <div>
        <Button variant="ghost" size="sm" asChild className="-ml-2 mb-3">
          <Link href="/painel/representacao/empregadores">
            <ArrowLeft />
            Empregadores
          </Link>
        </Button>
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Grupos empresariais</h1>
            <p className="text-muted-foreground mt-1 text-xs">
              Conjuntos de empresas de um mesmo grupo — com trabalhadores representados em parte delas
              ou em todas
            </p>
          </div>
          {esquemaPronto && (
            <Button asChild>
              <Link href="/painel/representacao/empregadores/grupos/novo">
                <Plus />
                Novo grupo
              </Link>
            </Button>
          )}
        </div>
      </div>

      {!esquemaPronto && (
        <Alert variant="warning">
          <AlertDescription>{AVISO_SQL_GRUPOS}</AlertDescription>
        </Alert>
      )}
      {excluido === "1" && (
        <Alert variant="success">
          <AlertDescription>Grupo excluído. As empresas continuam em Empregadores.</AlertDescription>
        </Alert>
      )}

      {esquemaPronto && grupos.length === 0 && (
        <Card>
          <CardContent className="text-muted-foreground flex flex-col items-center gap-2 py-10 text-center text-sm">
            <Building2 className="size-6" />
            Nenhum grupo empresarial cadastrado.
          </CardContent>
        </Card>
      )}

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {grupos.map((g) => (
          <Link
            key={g.id}
            href={`/painel/representacao/empregadores/grupos/${g.id}`}
            className="hover:bg-muted/40 grid gap-2 rounded-xl border p-4 transition-colors"
          >
            <div className="flex items-start justify-between gap-2">
              <p className="font-medium">{g.nome}</p>
              <ChevronRight className="text-muted-foreground size-4 shrink-0" />
            </div>
            <div className="flex flex-wrap gap-1.5">
              <Badge variant="outline">
                {g.representadas} de {g.membros.length} empresa{g.membros.length === 1 ? "" : "s"}{" "}
                representada{g.representadas === 1 ? "" : "s"}
              </Badge>
              {g.contribuicaoCentralizada && <Badge variant="info">Contribuição centralizada</Badge>}
            </div>
            <p className="text-muted-foreground text-xs">
              <span className="text-foreground text-base font-semibold tabular-nums">
                {g.filiadosAtivos.toLocaleString("pt-BR")}
              </span>{" "}
              filiado{g.filiadosAtivos === 1 ? "" : "s"} ativo{g.filiadosAtivos === 1 ? "" : "s"}
              {g.descricao ? ` · ${g.descricao}` : ""}
            </p>
          </Link>
        ))}
      </div>
    </>
  )
}
