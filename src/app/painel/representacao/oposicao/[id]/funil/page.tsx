import type { Metadata } from "next"
import Link from "next/link"
import { notFound } from "next/navigation"
import { ArrowLeft } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { obterCampanha } from "@/lib/db/oposicao"
import { funilDaCampanha } from "@/lib/db/oposicao-funil"
import { requireOposicao } from "@/lib/db/oposicao-regras"
import { formatarData } from "@/lib/formato"

export const metadata: Metadata = { title: "Funil — Oposição — Confluir" }

/**
 * Funil da campanha (onda 3 das melhorias, 07/11/2026): de quem leu as
 * instruções até a decisão, e por empresa. Mostra onde as pessoas param
 * enquanto ainda dá para agir (um aviso reforçado, um mutirão de conferência).
 */
export default async function FunilOposicaoPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  await requireOposicao("consultar", id)
  const campanha = await obterCampanha(id)
  if (!campanha) notFound()
  const f = await funilDaCampanha(id)
  const aqui = `/painel/representacao/oposicao/${id}`
  const lista = (s: string) => `${aqui}?situacao=${s}`

  const etapas: { rotulo: string; valor: number; detalhe?: string; href?: string }[] = [
    {
      rotulo: "Leram as instruções",
      valor: f.leram.total,
      detalhe: `${f.leram.filiados} filiado(s), ${f.leram.naoFiliados} não filiado(s)`,
    },
    { rotulo: "Conferiram os dados (filiados)", valor: f.conferiramDados },
    {
      rotulo: "Registraram a oposição",
      valor: f.registradas.total,
      detalhe: `${f.registradas.filiados} filiado(s), ${f.registradas.naoFiliados} não filiado(s)`,
    },
    {
      rotulo: "Aguardando a carta",
      valor: f.aguardandoCarta,
      detalhe: f.cartaDevolvida ? `${f.cartaDevolvida} com nova carta pedida` : undefined,
      href: lista("aguardando_documento"),
    },
    {
      rotulo: "Em análise",
      valor: f.emAnalise,
      detalhe: f.cartaAConferir ? `${f.cartaAConferir} com a assinatura a conferir` : undefined,
      href: lista("nao_avaliada"),
    },
    { rotulo: "Aprovadas", valor: f.aprovadas, href: lista("aprovada") },
    { rotulo: "Reprovadas", valor: f.reprovadas, href: lista("reprovada") },
  ]
  const maior = Math.max(1, ...etapas.map((e) => e.valor))

  return (
    <>
      <div>
        <Button variant="ghost" size="sm" asChild className="-ml-2 mb-3">
          <Link href={aqui}>
            <ArrowLeft />
            Campanha
          </Link>
        </Button>
        <h1 className="text-2xl font-semibold tracking-tight text-balance">Funil da campanha</h1>
        <p className="text-muted-foreground mt-1 text-sm">
          {campanha.nome ?? "Campanha"} · prazo {formatarData(campanha.prazo_inicio)} a{" "}
          {formatarData(campanha.prazo_fim)}
          {f.desistentes ? ` · ${f.desistentes} optaram por não se opor` : ""}.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Do começo à decisão</CardTitle>
          <CardDescription>
            “Leram as instruções” e “Conferiram os dados” contam cada pessoa uma vez, desde 07/11/2026 (quando
            passaram a ser registrados).
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ol className="grid gap-3">
            {etapas.map((e) => (
              <li key={e.rotulo} className="grid gap-1">
                <div className="flex flex-wrap items-baseline justify-between gap-2 text-sm">
                  {e.href ? (
                    <Link href={e.href} className="font-medium underline-offset-4 hover:underline">
                      {e.rotulo}
                    </Link>
                  ) : (
                    <span className="font-medium">{e.rotulo}</span>
                  )}
                  <span className="tabular-nums">{e.valor.toLocaleString("pt-BR")}</span>
                </div>
                <div className="bg-muted h-2 overflow-hidden rounded-full" aria-hidden>
                  <div className="bg-primary h-full rounded-full" style={{ width: `${(e.valor / maior) * 100}%` }} />
                </div>
                {e.detalhe && <p className="text-muted-foreground text-xs">{e.detalhe}</p>}
              </li>
            ))}
          </ol>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Por empresa</CardTitle>
        </CardHeader>
        <CardContent>
          {f.porFonte.length === 0 ? (
            <p className="text-muted-foreground text-sm">Nenhuma oposição registrada ainda.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Empresa</TableHead>
                  <TableHead className="text-right">Registradas</TableHead>
                  <TableHead className="text-right">Aguardando carta</TableHead>
                  <TableHead className="text-right">Em análise</TableHead>
                  <TableHead className="text-right">Aprovadas</TableHead>
                  <TableHead className="text-right">Reprovadas</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {f.porFonte.map((c) => (
                  <TableRow key={c.fonte}>
                    <TableCell className="font-medium">{c.fonte}</TableCell>
                    <TableCell className="text-right tabular-nums">{c.registradas}</TableCell>
                    <TableCell className="text-right tabular-nums">{c.aguardandoCarta}</TableCell>
                    <TableCell className="text-right tabular-nums">{c.emAnalise}</TableCell>
                    <TableCell className="text-right tabular-nums">{c.aprovadas}</TableCell>
                    <TableCell className="text-right tabular-nums">{c.reprovadas}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </>
  )
}
