import type { Metadata } from "next"
import Link from "next/link"
import { ArrowLeft } from "lucide-react"

import { RotuloTrilha } from "@/components/layout/trilha-rotulos"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { requirePermissao } from "@/lib/auth"
import { hojeSP } from "@/lib/db/comum"
import { configAcerto, listarAcertos, previaAcerto } from "@/lib/db/ponto-acertos"
import { faixasHoraExtra } from "@/lib/db/ponto-config"

import { NovoAcertoForm } from "../forms"

export const metadata: Metadata = { title: "Novo acerto do banco de horas — Confluir" }

/**
 * NOVO ACERTO DO BANCO DE HORAS (27/11/2026): escolhe o mês, vê o saldo de
 * cada pessoa no fechamento dele (a prévia) e marca quem é zerado — uma
 * pessoa, um departamento, algumas ou todas.
 */
export default async function NovoAcertoPage({ searchParams }: { searchParams: Promise<{ competencia?: string }> }) {
  await requirePermissao("pessoal_gestao")
  const sp = await searchParams
  const competencia = sp.competencia && /^\d{4}-(0[1-9]|1[0-2])$/.test(sp.competencia) ? sp.competencia : null
  const [{ disponivel }, config, faixas] = await Promise.all([listarAcertos(), configAcerto(), faixasHoraExtra()])
  const pessoas = competencia && disponivel ? await previaAcerto(competencia) : []
  const rotulos = { f1: faixas["70"], f2: faixas["100"] }

  return (
    <>
      <RotuloTrilha valores={{ acertos: "Acertos do banco", novo: "Novo acerto" }} />
      <div>
        <Button variant="ghost" size="sm" asChild className="-ml-2 mb-3">
          <Link href="/painel/pessoal/ponto?aba=acertos">
            <ArrowLeft />
            Acertos do banco de horas
          </Link>
        </Button>
        <h1 className="text-2xl font-semibold tracking-tight">Novo acerto do banco de horas</h1>
        <p className="text-muted-foreground mt-1 text-sm">
          O saldo de cada pessoa no fechamento do mês é zerado: a remessa seguinte começa do zero. O quanto foi zerado fica registrado.
          Horas a favor do funcionário seguem o motivo (pagas, compensadas, vencidas…); horas negativas são descontadas em folha.
        </p>
      </div>

      {!disponivel && (
        <Alert>
          <AlertDescription>Os acertos ainda não estão ligados nesta entidade (falta aplicar a atualização do banco de dados).</AlertDescription>
        </Alert>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Mês do acerto</CardTitle>
          <CardDescription>O saldo zerado é o do fechamento deste mês (o da remessa dele ou, sem ela, o da última antes).</CardDescription>
        </CardHeader>
        <CardContent>
          <form className="flex flex-wrap items-end gap-2" action="/painel/pessoal/ponto/acertos/novo">
            <div className="grid gap-1.5">
              <Label htmlFor="acerto-mes">Mês</Label>
              <Input id="acerto-mes" type="month" name="competencia" defaultValue={competencia ?? hojeSP().slice(0, 7)} required className="w-44" />
            </div>
            <Button type="submit" variant="outline">
              Ver os saldos
            </Button>
          </form>
        </CardContent>
      </Card>

      {competencia && disponivel && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">
              Quem é zerado em {competencia.slice(5, 7)}/{competencia.slice(0, 4)}
            </CardTitle>
            <CardDescription>
              Já vêm marcados os ativos com saldo. Use os atalhos para todos, só ativos ou um departamento, ou marque um a um.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {pessoas.length === 0 ? (
              <p className="text-muted-foreground text-sm">Ninguém com registro de ponto até este mês.</p>
            ) : (
              <NovoAcertoForm competencia={competencia} pessoas={pessoas} faixas={config.faixas} motivo={config.motivo} rotulos={rotulos} />
            )}
          </CardContent>
        </Card>
      )}
    </>
  )
}
