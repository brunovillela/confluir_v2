import type { Metadata } from "next"
import Link from "next/link"
import { ArrowLeft, ArrowRight, Gavel, Plus } from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { requirePermissao } from "@/lib/auth"
import { listarCampanhas } from "@/lib/db/oposicao"
import { formatarData } from "@/lib/formato"

export const metadata: Metadata = {
  title: "Oposição à contribuição — Confluir",
}

const ROTULO_CAMPANHA: Record<string, string> = {
  rascunho: "Rascunho",
  aberta: "Aberta",
  encerrada: "Encerrada",
}

export default async function OposicaoPage() {
  await requirePermissao("oposicao")
  const campanhas = await listarCampanhas()

  return (
    <>
      <div>
        <Button variant="ghost" size="sm" asChild className="-ml-2 mb-3">
          <Link href="/painel/representacao">
            <ArrowLeft />
            Representação
          </Link>
        </Button>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h1 className="text-2xl font-semibold tracking-tight">
            Oposição à contribuição assistencial
          </h1>
          <Button asChild>
            <Link href="/painel/representacao/oposicao/nova">
              <Plus />
              Nova campanha
            </Link>
          </Button>
        </div>
        <p className="text-muted-foreground mt-1 text-xs">
          Campanhas de oposição vinculadas às fontes pagadoras e a fila de
          avaliação da Filiação.
        </p>
      </div>

      {campanhas.length === 0 ? (
        <Card>
          <CardContent>
            <p className="text-muted-foreground py-8 text-center text-sm">
              <Gavel className="mx-auto mb-2 size-5" />
              Nenhuma campanha de oposição cadastrada.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          {campanhas.map((c) => (
            <Link
              key={c.id}
              href={`/painel/representacao/oposicao/${c.id}`}
              className="group"
            >
              <Card className="group-hover:border-primary/40 h-full transition-colors">
                <CardHeader>
                  <div className="flex items-start justify-between gap-2">
                    <CardTitle className="text-base text-balance">
                      {c.nome ?? c.codigo ?? "(sem nome)"}
                    </CardTitle>
                    <Badge variant="secondary" className="whitespace-nowrap">
                      {ROTULO_CAMPANHA[c.situacao] ?? c.situacao}
                    </Badge>
                  </div>
                  <CardDescription>
                    Prazo {formatarData(c.prazo_inicio)} –{" "}
                    {formatarData(c.prazo_fim)}
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="flex items-center justify-between">
                    <span className="text-2xl font-semibold tabular-nums">
                      {c.totalOpositores.toLocaleString("pt-BR")}
                    </span>
                    <span className="text-primary flex items-center gap-1 text-sm group-hover:underline">
                      Ver opositores
                      <ArrowRight className="size-3.5" />
                    </span>
                  </div>
                  <p className="text-muted-foreground mt-0.5 text-xs">
                    opositores registrados
                  </p>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </>
  )
}
