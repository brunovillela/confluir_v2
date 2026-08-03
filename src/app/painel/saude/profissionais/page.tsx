import type { Metadata } from "next"
import Link from "next/link"
import { CircleCheck, Info, Stethoscope, Tags, TriangleAlert } from "lucide-react"

import { Alert, AlertDescription } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { requirePermissao } from "@/lib/auth"
import {
  buscarProfissional,
  listarProfissionais,
  listarTiposAtendimento,
  usuariosParaProfissional,
} from "@/lib/db/atendimentos"

import {
  ExcluirTipoForm,
  ProfissionalForm,
  TipoForm,
} from "./profissionais-forms"

export const metadata: Metadata = {
  title: "Profissionais e tipos — Confluir",
}

export default async function ProfissionaisPage({
  searchParams,
}: {
  searchParams: Promise<{
    editar?: string
    editarTipo?: string
    salvo?: string
    excluido?: string
  }>
}) {
  await requirePermissao("saude_gestao")

  const { editar, editarTipo, salvo, excluido } = await searchParams
  const [{ tipos, disponivel }, { linhas: profissionais }, usuarios] =
    await Promise.all([
      listarTiposAtendimento(true),
      listarProfissionais(),
      usuariosParaProfissional(),
    ])

  const emEdicao = editar ? await buscarProfissional(editar) : undefined
  const tipoEmEdicao = tipos.find((t) => t.id === editarTipo)

  return (
    <>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">
            Profissionais e tipos
          </h1>
          <p className="text-muted-foreground mt-1 text-xs">
            Quem atende, de qual especialidade, e quem lê cada relatório
          </p>
        </div>
        <Button variant="outline" asChild>
          <Link href="/painel/saude">Voltar ao módulo</Link>
        </Button>
      </div>

      {!disponivel && (
        <Alert variant="warning">
          <TriangleAlert />
          <AlertDescription>
            Atendimentos ainda não configurados — rode{" "}
            <code>supabase/saude-atendimentos.sql</code> no SQL Editor do
            Supabase.
          </AlertDescription>
        </Alert>
      )}

      {(salvo || excluido) && (
        <Alert variant="success">
          <CircleCheck />
          <AlertDescription>
            {salvo === "tipo" && "Tipo de atendimento salvo."}
            {salvo === "profissional" && "Profissional salvo."}
            {excluido === "tipo" && "Tipo de atendimento excluído."}
          </AlertDescription>
        </Alert>
      )}

      <Alert>
        <Info />
        <AlertDescription>
          O <strong>tipo</strong> é o que decide o acesso ao relatório clínico:
          lê quem é profissional daquele mesmo tipo, mais o autor. Permissão
          administrativa não abre relatório — quem administra vê que houve
          atendimento, quando e com quem, nunca o conteúdo.
        </AlertDescription>
      </Alert>

      {/* Tipos de atendimento */}
      <Card>
        <CardContent className="grid gap-4">
          <p className="flex items-center gap-2 font-medium">
            <Tags className="text-muted-foreground size-4" />
            Tipos de atendimento
          </p>

          {tipos.length === 0 ? (
            <p className="text-muted-foreground text-sm">
              Nenhum tipo cadastrado. Sem tipos não há como registrar
              atendimento nem habilitar profissional — comece por aqui.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Tipo</TableHead>
                  <TableHead className="w-32">Profissionais</TableHead>
                  <TableHead className="w-32">Atendimentos</TableHead>
                  <TableHead className="w-24"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {tipos.map((t) => (
                  <TableRow key={t.id}>
                    <TableCell className="font-medium">
                      {tipoEmEdicao?.id === t.id ? (
                        <TipoForm tipo={t} />
                      ) : (
                        (t.nome ?? "—")
                      )}
                    </TableCell>
                    <TableCell className="tabular-nums">
                      {t.profissionais ?? 0}
                    </TableCell>
                    <TableCell className="tabular-nums">
                      {t.atendimentos ?? 0}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1">
                        <Button variant="ghost" size="sm" asChild>
                          <Link
                            href={
                              tipoEmEdicao?.id === t.id
                                ? "/painel/saude/profissionais"
                                : `/painel/saude/profissionais?editarTipo=${t.id}`
                            }
                          >
                            {tipoEmEdicao?.id === t.id ? "Cancelar" : "Editar"}
                          </Link>
                        </Button>
                        {(t.profissionais ?? 0) === 0 &&
                          (t.atendimentos ?? 0) === 0 && (
                            <ExcluirTipoForm id={t.id} />
                          )}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}

          {!tipoEmEdicao && <TipoForm />}
        </CardContent>
      </Card>

      {/* Profissionais */}
      <Card>
        <CardContent className="grid gap-4">
          <p className="flex items-center gap-2 font-medium">
            <Stethoscope className="text-muted-foreground size-4" />
            Profissionais
          </p>

          {profissionais.length === 0 ? (
            <p className="text-muted-foreground text-sm">
              Nenhum profissional cadastrado.{" "}
              <strong>Enquanto não houver, ninguém lê relatório algum</strong> —
              inclusive quem administra o sistema.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Pessoa</TableHead>
                  <TableHead>Profissão</TableHead>
                  <TableHead>Conselho</TableHead>
                  <TableHead>Lê relatórios de</TableHead>
                  <TableHead className="w-24"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {profissionais.map((p) => (
                  <TableRow key={p.id}>
                    <TableCell className="font-medium">
                      {p.usuarioNome ?? "—"}
                      {p.inativo && (
                        <Badge
                          variant="outline"
                          className="text-muted-foreground ml-2"
                        >
                          Inativo
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell>{p.profissao ?? "—"}</TableCell>
                    <TableCell className="whitespace-nowrap">
                      {p.conselho_classe
                        ? `${p.conselho_classe} ${p.registro_conselho ?? ""}`.trim()
                        : "—"}
                    </TableCell>
                    <TableCell>
                      {p.inativo ? (
                        <span className="text-muted-foreground">nada</span>
                      ) : p.acesso_todos_tipos ? (
                        <Badge variant="warning">Todos os tipos</Badge>
                      ) : p.tipoNome ? (
                        <Badge variant="outline">{p.tipoNome}</Badge>
                      ) : (
                        <span className="text-muted-foreground">nada</span>
                      )}
                    </TableCell>
                    <TableCell>
                      <Button variant="ghost" size="sm" asChild>
                        <Link
                          href={`/painel/saude/profissionais?editar=${p.id}`}
                        >
                          Editar
                        </Link>
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}

          <div className="border-t pt-4">
            <p className="mb-3 text-sm font-medium">
              {emEdicao
                ? `Editando ${emEdicao.usuarioNome ?? "profissional"}`
                : "Novo profissional"}
            </p>
            <ProfissionalForm
              profissional={emEdicao ?? undefined}
              tipos={tipos}
              usuarios={usuarios}
            />
            {emEdicao && (
              <Button variant="ghost" size="sm" className="mt-2" asChild>
                <Link href="/painel/saude/profissionais">
                  Cancelar edição
                </Link>
              </Button>
            )}
          </div>
        </CardContent>
      </Card>
    </>
  )
}
