import type { Metadata } from "next"
import Link from "next/link"
import { ArrowLeft, GitCompareArrows } from "lucide-react"

import { RotuloTrilha } from "@/components/layout/trilha-rotulos"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { requirePermissao } from "@/lib/auth"
import { AVISO_SQL_COMPARACOES, listarComparacoes } from "@/lib/db/acordos-comparacoes"
import { formatarDataHora } from "@/lib/formato"
import { createAdminClient } from "@/lib/supabase/admin"
import { podeAcessar, type Permissoes } from "@/lib/permissoes"
import { tenantAtual } from "@/lib/tenant"

import { NovaComparacaoForm } from "./nova-comparacao-form"

export const metadata: Metadata = { title: "Comparar acordos — Confluir" }
// A comparação (pareamento + análise pela IA) roda na server action desta página.
export const maxDuration = 300

/**
 * Acordos com a quantidade de cláusulas (só compara quem tem cláusulas). Pauta
 * e propostas de negociação só entram para quem tem a permissão de negociar.
 */
async function acordosParaComparar(permissoes: Permissoes | null) {
  const admin = await createAdminClient()
  const empId = await tenantAtual()
  let q = admin
    .from("acordo_coletivo")
    .select("id, titulo, tipo, vigencia_inicio, negociacao_id")
    .eq("emp_proprietaria_id", empId)
  if (!podeAcessar(permissoes, "negociacoes")) q = q.is("negociacao_id", null)
  const { data: acordos } = await q.order("vigencia_inicio", { ascending: false, nullsFirst: false })
  const lista = []
  for (const a of acordos ?? []) {
    const { count } = await admin
      .from("acordo_clausulas")
      .select("id", { count: "exact", head: true })
      .eq("acordo_id", a.id)
      .eq("emp_proprietaria_id", empId)
    const titulo = String(a.titulo ?? "(sem título)")
    lista.push({ id: String(a.id), rotulo: a.negociacao_id ? `[negociação] ${titulo}` : titulo, clausulas: count ?? 0 })
  }
  return lista
}

export default async function ComparacoesPage({
  searchParams,
}: {
  searchParams: Promise<{ a?: string; b?: string; excluida?: string }>
}) {
  const sessao = await requirePermissao("acordos_coletivos", ["negociacoes"])
  const sp = await searchParams
  const [{ disponivel, lista }, acordos] = await Promise.all([
    listarComparacoes(sessao.permissoes),
    acordosParaComparar(sessao.permissoes),
  ])

  return (
    <>
      <RotuloTrilha valores={{ comparacoes: "Comparações" }} />
      <div>
        <Button variant="ghost" size="sm" asChild className="-ml-2 mb-3">
          <Link href="/painel/representacao/acordos">
            <ArrowLeft />
            Acordos coletivos
          </Link>
        </Button>
        <h1 className="text-2xl font-semibold tracking-tight">Comparar acordos</h1>
        <p className="text-muted-foreground mt-1 text-xs">
          Cláusula a cláusula: o que ficou igual, o que mudou, o que entrou e o que saiu — e se a mudança é
          boa ou ruim para o trabalhador
        </p>
      </div>

      {sp.excluida === "1" && (
        <Alert className="border-success/40 text-success-fg">
          <AlertDescription>Comparação excluída.</AlertDescription>
        </Alert>
      )}
      {!disponivel && (
        <Alert variant="warning">
          <AlertDescription>{AVISO_SQL_COMPARACOES}</AlertDescription>
        </Alert>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Nova comparação</CardTitle>
          <CardDescription>
            Versões do mesmo acordo, vigente × proposta, ou acordos de empresas diferentes.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <NovaComparacaoForm acordos={acordos} inicialA={sp.a} inicialB={sp.b} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Comparações feitas</CardTitle>
        </CardHeader>
        <CardContent>
          {lista.length === 0 ? (
            <p className="text-muted-foreground text-sm">Nenhuma comparação ainda.</p>
          ) : (
            <ul className="grid gap-2">
              {lista.map((c) => (
                <li key={c.id} className="flex flex-wrap items-center justify-between gap-2 rounded-md border p-3">
                  <Link
                    href={`/painel/representacao/acordos/comparacoes/${c.id}`}
                    className="flex items-center gap-2 text-sm font-medium hover:underline"
                  >
                    <GitCompareArrows className="text-muted-foreground size-4" />
                    {c.titulo}
                  </Link>
                  <span className="text-muted-foreground text-xs">{formatarDataHora(c.createdAt)}</span>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </>
  )
}
