import type { Metadata } from "next"
import Link from "next/link"
import { notFound } from "next/navigation"
import { ArrowLeft, ExternalLink } from "lucide-react"

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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { requirePermissao } from "@/lib/auth"
import { funcionariosParaSelecao, urlArquivoPessoal } from "@/lib/db/pessoal"
import {
  alunosDoTreinamento,
  buscarTreinamento,
} from "@/lib/db/treinamentos"
import { formatarData } from "@/lib/formato"

import { AlunoTreinamentoForm, ExcluirAlunoBotao } from "./aluno-itens"

export const metadata: Metadata = { title: "Treinamento — Confluir" }

export default async function TreinamentoPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ salvo?: string; editar?: string }>
}) {
  await requirePermissao("pessoal_gestao")

  const { id } = await params
  const { salvo, editar } = await searchParams
  const [treinamento, funcionarios] = await Promise.all([
    buscarTreinamento(id),
    funcionariosParaSelecao(),
  ])
  if (!treinamento) notFound()

  const alunos = await alunosDoTreinamento(treinamento)
  const vencidos = alunos.filter((a) => a.vencido).length

  const urls = new Map<string, string | null>()
  for (const a of alunos) {
    urls.set(a.id, await urlArquivoPessoal(a.certificado_url))
  }

  const emEdicao = editar ? (alunos.find((a) => a.id === editar) ?? null) : null
  const jaTem = new Set(alunos.map((a) => a.aluno_id))
  const disponiveis = funcionarios.filter((f) => !jaTem.has(f.usuarioId))

  return (
    <>
      <div>
        <Button variant="ghost" size="sm" asChild className="-ml-2 mb-3">
          <Link href="/painel/pessoal/treinamentos">
            <ArrowLeft />
            Treinamentos
          </Link>
        </Button>
        <h1 className="text-2xl font-semibold tracking-tight">
          {treinamento.treinamento ?? "(sem nome)"}
        </h1>
        <p className="text-muted-foreground mt-1 text-xs">
          {alunos.length} aluno{alunos.length === 1 ? "" : "s"}
          {treinamento.carga_horaria !== null && (
            <>
              {" "}
              · carga horária{" "}
              {treinamento.carga_horaria.toLocaleString("pt-BR", {
                maximumFractionDigits: 1,
              })}
              h
            </>
          )}
          {" · "}
          {treinamento.vencimento_meses
            ? `validade de ${treinamento.vencimento_meses} meses`
            : "não expira"}
          {vencidos > 0 && (
            <> · {vencidos} vencido{vencidos === 1 ? "" : "s"}</>
          )}
        </p>
      </div>

      {salvo === "1" && (
        <Alert className="border-success/40 text-success-fg">
          <AlertDescription>Salvo com sucesso.</AlertDescription>
        </Alert>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Alunos</CardTitle>
          <CardDescription>
            A validade do certificado é calculada a partir do término do
            treinamento.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto rounded-lg border">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/50">
                  <TableHead>Funcionário</TableHead>
                  <TableHead>Período</TableHead>
                  <TableHead>Válido até</TableHead>
                  <TableHead>Certificado</TableHead>
                  <TableHead className="text-right">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {alunos.length === 0 && (
                  <TableRow>
                    <TableCell
                      colSpan={5}
                      className="text-muted-foreground h-20 text-center text-sm"
                    >
                      Nenhum aluno neste treinamento.
                    </TableCell>
                  </TableRow>
                )}
                {alunos.map((a) => (
                  <TableRow key={a.id}>
                    <TableCell className="max-w-56 font-medium">
                      {a.aluno_id ? (
                        <Link
                          href={`/painel/pessoal/${a.aluno_id}`}
                          className="hover:underline"
                        >
                          <span className="block truncate">
                            {a.alunoNome ?? "(sem nome)"}
                          </span>
                        </Link>
                      ) : (
                        "(sem funcionário)"
                      )}
                    </TableCell>
                    <TableCell className="whitespace-nowrap">
                      {formatarData(a.data_inicio)}
                      {a.data_termino && a.data_termino !== a.data_inicio && (
                        <> – {formatarData(a.data_termino)}</>
                      )}
                    </TableCell>
                    <TableCell className="whitespace-nowrap">
                      {a.valido_ate ? (
                        a.vencido ? (
                          <Badge
                            variant="outline"
                            className="border-warning/40 text-warning-fg"
                          >
                            Venceu {formatarData(a.valido_ate)}
                          </Badge>
                        ) : (
                          <span className="text-muted-foreground">
                            {formatarData(a.valido_ate)}
                          </span>
                        )
                      ) : (
                        <span className="text-muted-foreground text-xs">
                          Não expira
                        </span>
                      )}
                    </TableCell>
                    <TableCell>
                      {urls.get(a.id) ? (
                        <a
                          href={urls.get(a.id)!}
                          target="_blank"
                          rel="noreferrer"
                          className="text-foreground inline-flex items-center gap-1 text-xs underline-offset-4 hover:underline"
                        >
                          Abrir <ExternalLink className="size-3" />
                        </a>
                      ) : (
                        <span className="text-muted-foreground text-xs">—</span>
                      )}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center justify-end gap-1">
                        <Button
                          variant="ghost"
                          size="sm"
                          asChild
                          className="h-7 px-2"
                        >
                          <Link
                            href={`/painel/pessoal/treinamentos/${id}?editar=${a.id}`}
                          >
                            Editar
                          </Link>
                        </Button>
                        <ExcluirAlunoBotao treinamentoId={id} id={a.id} />
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {/* key força remontagem ao alternar criar/editar (defaultValue). */}
      <AlunoTreinamentoForm
        key={emEdicao?.id ?? "novo"}
        treinamentoId={id}
        funcionarios={disponiveis}
        aluno={
          emEdicao
            ? {
                id: emEdicao.id,
                aluno_id: emEdicao.aluno_id,
                alunoNome: emEdicao.alunoNome,
                data_inicio: emEdicao.data_inicio,
                data_termino: emEdicao.data_termino,
                temCertificado: Boolean(emEdicao.certificado_url),
              }
            : undefined
        }
      />
    </>
  )
}
