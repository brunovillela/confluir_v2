import type { Metadata } from "next"
import Link from "next/link"
import { notFound } from "next/navigation"
import { ArrowLeft } from "lucide-react"

import { Alert, AlertDescription } from "@/components/ui/alert"
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
import { obterChecklist, SITUACOES } from "@/lib/db/veiculos-checklist"
import { formatarDataHora } from "@/lib/formato"

export const metadata: Metadata = { title: "Checklist — Confluir" }

const ROTULO = new Map(SITUACOES.map((s) => [s.valor, s.rotulo]))

export default async function ChecklistPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  await requirePermissao("veiculos", ["veiculos_gestao"])
  const { id } = await params
  const achado = await obterChecklist(id)
  if (!achado) notFound()

  const { checklist: c, respostas } = achado
  const naoConformes = respostas.filter((r) => r.situacao === "nao_conforme")

  return (
    <>
      <div>
        <Button asChild variant="ghost" size="sm" className="-ml-2 mb-3">
          <Link href="/painel/veiculos/checklists">
            <ArrowLeft />
            Checklist da frota
          </Link>
        </Button>
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="text-2xl font-semibold tracking-tight">
            {c.veiculoRotulo ?? "Checklist"}
          </h1>
          {c.pendencias > 0 ? (
            <Badge variant="destructive">
              {c.pendencias} {c.pendencias === 1 ? "pendência" : "pendências"}
            </Badge>
          ) : (
            <Badge variant="success">tudo conforme</Badge>
          )}
        </div>
        <p className="text-muted-foreground mt-1 text-xs">
          {formatarDataHora(c.realizado_em)}
          {c.inspetorNome ? ` · por ${c.inspetorNome}` : ""}
          {c.hodometro !== null
            ? ` · ${c.hodometro.toLocaleString("pt-BR")} km`
            : ""}
        </p>
      </div>

      {naoConformes.length > 0 && (
        <Alert variant="destructive">
          <AlertDescription>
            <strong>Itens fora de conformidade:</strong>{" "}
            {naoConformes.map((r) => r.categoria).join("; ")}.
          </AlertDescription>
        </Alert>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Verificação item a item</CardTitle>
          <CardDescription>
            O que foi conferido e o resultado de cada sistema.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3">
          {respostas.map((r) => (
            <div
              key={r.id}
              className={`grid gap-1 rounded-md border p-3 ${
                r.situacao === "nao_conforme" ? "border-destructive/40" : ""
              }`}
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="font-medium">{r.categoria ?? "—"}</span>
                {r.situacao === "nao_conforme" ? (
                  <Badge variant="destructive">
                    {ROTULO.get(r.situacao) ?? r.situacao}
                  </Badge>
                ) : r.situacao === "nao_aplica" ? (
                  <Badge variant="secondary">
                    {ROTULO.get(r.situacao) ?? r.situacao}
                  </Badge>
                ) : (
                  <Badge variant="success">
                    {(r.situacao && ROTULO.get(r.situacao)) ?? "—"}
                  </Badge>
                )}
              </div>
              {r.observacao && (
                <span className="text-sm whitespace-pre-wrap">
                  {r.observacao}
                </span>
              )}
            </div>
          ))}
        </CardContent>
      </Card>

      {c.observacoes && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Observações gerais</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm whitespace-pre-wrap">{c.observacoes}</p>
          </CardContent>
        </Card>
      )}
    </>
  )
}
