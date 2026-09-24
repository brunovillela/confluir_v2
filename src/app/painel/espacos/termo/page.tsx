import type { Metadata } from "next"
import Link from "next/link"
import { ArrowLeft } from "lucide-react"

import { Alert, AlertDescription } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { requirePermissao } from "@/lib/auth"
import { listarVersoesTermo } from "@/lib/db/espacos-termo"
import { formatarDataHora } from "@/lib/formato"

import { reativarTermoAction } from "./actions"
import { TermoForm } from "./termo-form"

export const metadata: Metadata = { title: "Termo de cessão — Confluir" }

export default async function TermoPage() {
  await requirePermissao("espacos_gestao")
  const { versoes, esquemaPronto } = await listarVersoesTermo()
  const vigente = versoes.find((v) => v.emVigor)
  const anteriores = versoes.filter((v) => !v.emVigor)

  return (
    <>
      <div className="flex flex-wrap items-center gap-3">
        <Button variant="ghost" size="icon" asChild>
          <Link href="/painel/espacos" aria-label="Voltar para cessão de espaços">
            <ArrowLeft />
          </Link>
        </Button>
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Termo de cessão</h1>
          <p className="text-muted-foreground mt-1 text-xs">
            O modelo padrão da entidade, versionado
          </p>
        </div>
        {vigente?.codigo && (
          <Badge variant="outline" className="border-success/40 text-success-fg">
            versão {vigente.codigo}
          </Badge>
        )}
      </div>

      {!esquemaPronto ? (
        <Alert variant="warning">
          <AlertDescription>
            Termo ainda não configurado — rode{" "}
            <code>supabase/cessao-termo.sql</code> no SQL Editor do Supabase.
          </AlertDescription>
        </Alert>
      ) : (
        <>
          <Alert variant="info">
            <AlertDescription>
              Este texto vale para <strong>todas</strong> as cessões. O que muda
              de uma para outra entra por marcador e é preenchido na hora de
              gerar o termo do pedido. Peça revisão do jurídico antes da
              primeira cessão.
            </AlertDescription>
          </Alert>

          <TermoForm textoInicial={vigente?.texto ?? ""} />

          {anteriores.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Versões anteriores</CardTitle>
              </CardHeader>
              <CardContent className="grid gap-2">
                {anteriores.map((v) => (
                  <div
                    key={v.id}
                    className="flex flex-wrap items-center justify-between gap-2 rounded-md border p-2 text-sm"
                  >
                    <span>
                      <span className="font-mono">{v.codigo ?? "—"}</span>
                      <span className="text-muted-foreground ml-2 text-xs">
                        {formatarDataHora(v.created_at)}
                      </span>
                    </span>
                    <form action={reativarTermoAction}>
                      <input type="hidden" name="id" value={v.id} />
                      <Button type="submit" variant="outline" size="sm">
                        Voltar a usar esta
                      </Button>
                    </form>
                  </div>
                ))}
                <p className="text-muted-foreground text-xs">
                  Versões antigas ficam guardadas porque cessões assinadas
                  apontam para elas.
                </p>
              </CardContent>
            </Card>
          )}
        </>
      )}
    </>
  )
}
