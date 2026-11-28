import type { Metadata } from "next"
import Link from "next/link"
import { notFound } from "next/navigation"
import { ArrowLeft } from "lucide-react"

import { RotuloTrilha } from "@/components/layout/trilha-rotulos"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { requirePermissao } from "@/lib/auth"
import { obterAcerto } from "@/lib/db/ponto-acertos"
import { faixasHoraExtra } from "@/lib/db/ponto-config"
import { hhmm } from "@/lib/horas"
import { destinoDoZerado, motivoAcerto, ROTULO_ALCANCE, ROTULO_FAIXAS_ACERTO, rotuloMesAcerto } from "@/lib/ponto-acertos"

import { DesfazerAcertoBotao } from "../forms"

export const metadata: Metadata = { title: "Acerto do banco de horas — Confluir" }

const DESTINO = { pagar: "Pagar em folha", descontar: "Descontar em folha", nenhum: "—" } as const

export default async function AcertoPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ criado?: string; avisos?: string }>
}) {
  await requirePermissao("pessoal_gestao")
  const { id } = await params
  const sp = await searchParams
  const [det, faixas] = await Promise.all([obterAcerto(id), faixasHoraExtra()])
  if (!det) notFound()
  const { acerto: a, itens } = det
  const destino = (v: number | null) => (v === null ? "nenhum" : destinoDoZerado(v, a.motivo))

  return (
    <>
      <RotuloTrilha valores={{ acertos: "Acertos do banco", [id]: `Acerto de ${rotuloMesAcerto(a.competencia)}` }} />
      <div>
        <Button variant="ghost" size="sm" asChild className="-ml-2 mb-3">
          <Link href="/painel/pessoal/ponto?aba=acertos">
            <ArrowLeft />
            Acertos do banco de horas
          </Link>
        </Button>
        <h1 className="text-2xl font-semibold tracking-tight">Acerto do banco de {rotuloMesAcerto(a.competencia)}</h1>
        <p className="text-muted-foreground mt-1 text-sm">
          {ROTULO_ALCANCE[a.alcance]} · {a.pessoas} pessoa(s) · zera {ROTULO_FAIXAS_ACERTO[a.faixas]} · {motivoAcerto(a.motivo)?.rotulo}
          {a.criadoPor ? ` · lançado por ${a.criadoPor}` : ""}
        </p>
      </div>

      {sp.criado === "1" && (
        <Alert variant="success">
          <AlertDescription>Acerto lançado. As remessas seguintes de cada pessoa foram recalculadas.</AlertDescription>
        </Alert>
      )}
      {sp.avisos && (
        <Alert variant="warning">
          <AlertDescription>{sp.avisos}</AlertDescription>
        </Alert>
      )}
      {a.observacao && (
        <Alert>
          <AlertDescription>{a.observacao}</AlertDescription>
        </Alert>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">O que foi zerado</CardTitle>
          <CardDescription>
            {hhmm(a.positivo)} a favor dos funcionários ({motivoAcerto(a.motivo)?.descricao}){a.negativo < 0 ? ` · ${hhmm(-a.negativo)} a descontar em folha` : ""}.
            O que vai à folha aparece no movimento da folha do mês.
          </CardDescription>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-muted-foreground text-left text-xs">
              <tr>
                <th className="py-1.5 pr-3 font-medium">Funcionário</th>
                <th className="py-1.5 pr-3 text-right font-medium">Zerado {faixas["70"]}</th>
                <th className="py-1.5 pr-3 font-medium">Na folha</th>
                <th className="py-1.5 pr-3 text-right font-medium">Zerado {faixas["100"]}</th>
                <th className="py-1.5 font-medium">Na folha</th>
              </tr>
            </thead>
            <tbody>
              {itens.map((i) => (
                <tr key={i.funcionarioId} className="border-t">
                  <td className="py-1.5 pr-3">
                    <Link href={`/painel/pessoal/ponto/funcionario/${i.funcionarioId}`} className="hover:underline">
                      {i.nome}
                    </Link>
                  </td>
                  <td className={`py-1.5 pr-3 text-right tabular-nums ${(i.saldo70 ?? 0) < 0 ? "text-destructive" : ""}`}>{hhmm(i.saldo70)}</td>
                  <td className="py-1.5 pr-3">
                    {destino(i.saldo70) !== "nenhum" && <Badge variant="outline">{DESTINO[destino(i.saldo70)]}</Badge>}
                  </td>
                  <td className={`py-1.5 pr-3 text-right tabular-nums ${(i.saldo100 ?? 0) < 0 ? "text-destructive" : ""}`}>{hhmm(i.saldo100)}</td>
                  <td className="py-1.5">
                    {destino(i.saldo100) !== "nenhum" && <Badge variant="outline">{DESTINO[destino(i.saldo100)]}</Badge>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Desfazer</CardTitle>
          <CardDescription>Lançado errado? Desfazer apaga o acerto e refaz os saldos das remessas seguintes de cada pessoa.</CardDescription>
        </CardHeader>
        <CardContent>
          <DesfazerAcertoBotao id={a.id} />
        </CardContent>
      </Card>
    </>
  )
}
