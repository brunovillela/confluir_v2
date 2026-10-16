import type { Metadata } from "next"
import Link from "next/link"
import { ArrowRight, FileSpreadsheet } from "lucide-react"

import { Alert, AlertDescription } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { requirePermissao } from "@/lib/auth"
import {
  DIA_CORTE,
  competenciaAtual,
  deslocarCompetencia,
  listarCompetencias,
  rotuloCompetencia,
} from "@/lib/db/folha-movimento"
import { formatarDataHora } from "@/lib/formato"

export const metadata: Metadata = { title: "Movimento da folha — Confluir" }

/**
 * Competências do movimento da folha (16/10/2026). Quem envia vê a aberta e
 * as enviadas; a contabilidade, só as enviadas.
 */
export default async function MovimentoFolhaPage() {
  const sessao = await requirePermissao("pessoal_contabilidade_envio", ["pessoal_contabilidade"])
  const envia = sessao.permissoes["pessoal_contabilidade_envio"] === true
  const { disponivel, competencias } = await listarCompetencias()

  // Abertas: a atual e, se a anterior não foi enviada, ela também. Enviada a
  // atual, a seguinte já aparece — é nela que caem os retroativos.
  const atual = competenciaAtual()
  const enviadas = new Set(competencias.map((c) => c.competencia))
  const proxima = deslocarCompetencia(atual, 1)
  const abertas = envia
    ? [deslocarCompetencia(atual, -1), atual, proxima].filter(
        (c) =>
          !enviadas.has(c) &&
          (c === proxima ? enviadas.has(atual) : c === atual || competencias.length === 0 || competencias[0].competencia < c)
      )
    : []

  return (
    <>
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Movimento da folha</h1>
        <p className="text-muted-foreground mt-1 text-xs">
          O que mudou para os funcionários em cada competência — admissões, desligamentos, alterações de contrato e
          de cadastro, férias, afastamentos, faltas e variáveis — para a contabilidade fechar a folha e transmitir o
          eSocial. Corte no dia {DIA_CORTE}; o que entrar depois do envio vai para a competência seguinte como
          retroativo.
        </p>
      </div>

      {!disponivel && (
        <Alert>
          <AlertDescription>
            Rode <code>supabase/folha-movimento-contabilidade.sql</code> no SQL Editor para ativar o envio.
          </AlertDescription>
        </Alert>
      )}

      {abertas.length > 0 && (
        <section className="grid gap-3 sm:grid-cols-2">
          {abertas.map((c) => (
            <Link key={c} href={`/painel/pessoal/contabilidade/${c}`} className="group">
              <Card className="group-hover:border-primary h-full transition-colors">
                <CardHeader>
                  <div className="flex items-center justify-between gap-2">
                    <CardTitle className="text-base">{rotuloCompetencia(c)}</CardTitle>
                    <Badge variant="warning">Aberta</Badge>
                  </div>
                  <CardDescription>
                    {c < atual
                      ? "Competência anterior ainda não enviada. Confira e envie à contabilidade."
                      : c > atual
                        ? "Próxima competência — o que for lançado agora, inclusive os retroativos, já aparece aqui."
                        : "Competência em curso. Confira e envie à contabilidade."}
                  </CardDescription>
                </CardHeader>
                <CardContent className="text-primary flex items-center gap-1 text-sm">
                  Conferir <ArrowRight className="size-4" />
                </CardContent>
              </Card>
            </Link>
          ))}
        </section>
      )}

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="text-base">Competências enviadas</CardTitle>
            <FileSpreadsheet className="text-muted-foreground size-4" />
          </div>
          <CardDescription>
            {competencias.length === 0
              ? "Nenhuma competência enviada ainda."
              : `${competencias.length} competência(s)`}
          </CardDescription>
        </CardHeader>
        {competencias.length > 0 && (
          <CardContent className="grid gap-2">
            {competencias.map((c) => (
              <Link
                key={c.competencia}
                href={`/painel/pessoal/contabilidade/${c.competencia}`}
                className="hover:bg-muted flex flex-wrap items-center justify-between gap-2 rounded-md border px-3 py-2 text-sm"
              >
                <span className="font-medium">{rotuloCompetencia(c.competencia)}</span>
                <span className="text-muted-foreground text-xs">
                  {c.totalItens} item(ns) · enviada {c.enviadaEm ? formatarDataHora(c.enviadaEm) : ""}
                  {c.enviadaPor ? ` por ${c.enviadaPor}` : ""}
                </span>
                {c.recebidaEm ? (
                  <Badge variant="success">Recebida</Badge>
                ) : (
                  <Badge variant="info">Aguardando a contabilidade</Badge>
                )}
              </Link>
            ))}
          </CardContent>
        )}
      </Card>
    </>
  )
}
