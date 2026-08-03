import { tenantAtual } from "@/lib/tenant"
import type { Metadata } from "next"
import Link from "next/link"
import { notFound } from "next/navigation"
import { ArrowLeft, NotebookPen, Pencil } from "lucide-react"

import { GrupoColapsavel } from "@/components/grupo-colapsavel"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { requirePermissao } from "@/lib/auth"
import { listarProntuario, tiposDeProntuario } from "@/lib/db/prontuario"
import { formatarData } from "@/lib/formato"
import { podeAcessar } from "@/lib/permissoes"
import { createAdminClient } from "@/lib/supabase/admin"

import { ApontamentoForm, ExcluirApontamento } from "./apontamento-form"

export const metadata: Metadata = { title: "Prontuário — Confluir" }

export default async function ProntuarioPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ salvo?: string; excluido?: string; editar?: string }>
}) {
  const sessao = await requirePermissao("filiacao_filiados", [
    "filiacao_gestao",
    "filiacao_receitas",
  ])
  const podeEditar = podeAcessar(sessao.permissoes, "filiacao_gestao")

  const { id } = await params
  const sp = await searchParams

  const admin = await createAdminClient()
  const [{ data: filiado }, prontuario, tipos] = await Promise.all([
    admin
      .from("filiacoes")
      .select("id, nome_completo")
      .eq("id", id)
      .eq("emp_proprietaria_id", await tenantAtual())
      .maybeSingle(),
    listarProntuario(id),
    tiposDeProntuario().catch(() => [] as string[]),
  ])
  if (!filiado) notFound()

  const editando = sp.editar
    ? prontuario.apontamentos.find((a) => a.id === sp.editar)
    : undefined

  return (
    <>
      <div>
        <Button variant="ghost" size="sm" asChild className="-ml-2 mb-3">
          <Link href={`/painel/filiados/${id}`}>
            <ArrowLeft />
            {filiado.nome_completo ?? "Filiado"}
          </Link>
        </Button>
        <h1 className="text-2xl font-semibold tracking-tight">Prontuário</h1>
        <p className="text-muted-foreground mt-1 text-xs">
          {prontuario.total.toLocaleString("pt-BR")} apontamento
          {prontuario.total === 1 ? "" : "s"} de{" "}
          {filiado.nome_completo ?? "—"}
        </p>
      </div>

      {sp.salvo === "1" && (
        <Alert className="border-success/40 text-success-fg">
          <AlertDescription>Apontamento salvo.</AlertDescription>
        </Alert>
      )}
      {sp.excluido === "1" && (
        <Alert className="border-success/40 text-success-fg">
          <AlertDescription>Apontamento excluído.</AlertDescription>
        </Alert>
      )}

      {!prontuario.disponivel && (
        <Alert variant="destructive">
          <AlertDescription>
            A tabela do prontuário ainda não existe no banco.
          </AlertDescription>
        </Alert>
      )}

      {podeEditar && prontuario.disponivel && (
        <GrupoColapsavel
          titulo={editando ? "Editar apontamento" : "Novo apontamento"}
          descricao={
            editando
              ? `Editando o apontamento de ${formatarData(editando.data)}`
              : "Registra uma ocorrência no prontuário do filiado"
          }
          resumo={<NotebookPen className="text-muted-foreground size-4" />}
          aberto={Boolean(editando)}
        >
          <ApontamentoForm
            key={editando?.id ?? "novo"}
            filiadoId={id}
            tipos={tipos}
            apontamento={
              editando
                ? {
                    id: editando.id,
                    data: editando.data,
                    tipo: editando.tipo,
                    descricao: editando.descricao,
                  }
                : undefined
            }
          />
        </GrupoColapsavel>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Linha do tempo</CardTitle>
        </CardHeader>
        <CardContent>
          {prontuario.apontamentos.length === 0 ? (
            <p className="text-muted-foreground py-6 text-center text-sm">
              Nenhum apontamento registrado.
            </p>
          ) : (
            <ul className="grid gap-3">
              {prontuario.apontamentos.map((a) => (
                <li key={a.id} className="rounded-lg border px-4 py-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="flex flex-wrap items-center gap-2 text-sm">
                      <span className="font-medium tabular-nums">
                        {formatarData(a.data)}
                      </span>
                      {a.tipo && (
                        <Badge variant="outline" className="text-muted-foreground">
                          {a.tipo}
                        </Badge>
                      )}
                      {a.autor && (
                        <span className="text-muted-foreground text-xs">
                          por {a.autor}
                        </span>
                      )}
                    </span>
                    {podeEditar && (
                      <span className="flex items-center gap-1">
                        <Button
                          variant="ghost"
                          size="icon"
                          asChild
                          className="size-7"
                        >
                          <Link
                            href={`/painel/filiados/${id}/prontuario?editar=${a.id}`}
                            aria-label="Editar apontamento"
                          >
                            <Pencil className="size-3.5" />
                          </Link>
                        </Button>
                        <ExcluirApontamento
                          filiadoId={id}
                          apontamentoId={a.id}
                        />
                      </span>
                    )}
                  </div>
                  <p className="mt-1.5 text-sm whitespace-pre-wrap">
                    {a.descricao ?? "—"}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </>
  )
}
