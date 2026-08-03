import type { Metadata } from "next"
import Link from "next/link"
import { notFound } from "next/navigation"
import { CircleCheck, Pencil, ShieldAlert, TriangleAlert } from "lucide-react"

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
import { formatarCpf } from "@/lib/cpf"
import { buscarAssistido, listarAtendimentos } from "@/lib/db/atendimentos"
import { formatarData } from "@/lib/formato"

import { AssistidoForm } from "../assistido-form"

export const metadata: Metadata = { title: "Assistido — Confluir" }

export default async function AssistidoPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ editar?: string; salvo?: string }>
}) {
  await requirePermissao("saude_atendimento", ["saude_gestao"])

  const { id } = await params
  const { editar, salvo } = await searchParams
  const assistido = await buscarAssistido(id)
  if (!assistido) notFound()

  if (editar === "1") {
    return (
      <>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <h1 className="text-2xl font-semibold tracking-tight">
            Editar assistido
          </h1>
          <Button variant="outline" asChild>
            <Link href={`/painel/saude/assistidos/${id}`}>Cancelar</Link>
          </Button>
        </div>
        <AssistidoForm
          assistido={assistido}
          filiadoInicial={
            assistido.filiado_id
              ? {
                  id: assistido.filiado_id,
                  nome_completo: assistido.filiadoNome,
                  cpf: assistido.filiadoCpf,
                  matricula_sindical: null,
                  filiacao_condicao: assistido.filiadoCondicao,
                }
              : null
          }
        />
      </>
    )
  }

  const { linhas } = await listarAtendimentos({ assistidoId: id })
  const hoje = new Date().toISOString().slice(0, 10)
  const vencida =
    assistido.retencao_ate &&
    assistido.retencao_ate < hoje &&
    !assistido.retencao_regime

  return (
    <>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">
            {assistido.nome ?? "(sem nome)"}
          </h1>
          <p className="text-muted-foreground mt-1 text-xs">
            {assistido.filiadoCpf
              ? formatarCpf(assistido.filiadoCpf)
              : "Sem vínculo com cadastro de filiado"}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" asChild>
            <Link href={`/painel/saude/assistidos/${id}?editar=1`}>
              <Pencil />
              Editar
            </Link>
          </Button>
          <Button variant="outline" asChild>
            <Link href="/painel/saude/assistidos">Voltar à lista</Link>
          </Button>
        </div>
      </div>

      {salvo === "1" && (
        <Alert variant="success">
          <CircleCheck />
          <AlertDescription>Assistido salvo.</AlertDescription>
        </Alert>
      )}

      {assistido.nome_retido_cifrado && (
        <Alert variant="warning">
          <ShieldAlert />
          <AlertDescription>
            O cadastro administrativo desta pessoa foi anonimizado a pedido
            dela. O acervo de saúde permanece retido e identificado por
            obrigação legal — os identificadores ficam cifrados e legíveis
            apenas por profissional habilitado.
          </AlertDescription>
        </Alert>
      )}

      {vencida && (
        <Alert variant="warning">
          <TriangleAlert />
          <AlertDescription>
            Prazo de guarda vencido em {formatarData(assistido.retencao_ate)}.
            Manter identificado a partir daqui passa a ser excesso — leve para
            análise de descarte. <strong>Confirme antes</strong> se não há
            regime especial ou exigência previdenciária pendente.
          </AlertDescription>
        </Alert>
      )}

      <div className="grid gap-4 lg:grid-cols-3">
        <Card>
          <CardContent>
            <p className="text-muted-foreground text-xs">Atendimentos</p>
            <p className="mt-1 text-2xl font-semibold tabular-nums">
              {assistido.atendimentos}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent>
            <p className="text-muted-foreground text-xs">Guarda até</p>
            <p className="mt-1 text-2xl font-semibold tabular-nums">
              {assistido.retencao_ate
                ? formatarData(assistido.retencao_ate)
                : "—"}
            </p>
            {assistido.retencao_regime && (
              <Badge variant="outline" className="mt-1">
                {assistido.retencao_regime}
              </Badge>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardContent>
            <p className="text-muted-foreground text-xs">Exposição declarada</p>
            <div className="mt-2 flex flex-wrap gap-1">
              {assistido.exposicao_cancerigeno_quimico && (
                <Badge variant="warning">Cancerígeno químico</Badge>
              )}
              {assistido.exposicao_radiacao_ionizante && (
                <Badge variant="warning">Radiação ionizante</Badge>
              )}
              {!assistido.exposicao_cancerigeno_quimico &&
                !assistido.exposicao_radiacao_ionizante && (
                  <span className="text-muted-foreground text-sm">
                    nenhuma
                  </span>
                )}
            </div>
          </CardContent>
        </Card>
      </div>

      {assistido.observacoes && (
        <Card>
          <CardContent>
            <p className="mb-1 text-sm font-medium">Observações do cadastro</p>
            <p className="text-sm whitespace-pre-line">
              {assistido.observacoes}
            </p>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardContent>
          <p className="mb-3 text-sm font-medium">Histórico de atendimentos</p>
          {linhas.length === 0 ? (
            <p className="text-muted-foreground text-sm">
              Nenhum atendimento registrado.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Data</TableHead>
                  <TableHead>Tipo</TableHead>
                  <TableHead>Profissional</TableHead>
                  <TableHead>Observação aberta</TableHead>
                  <TableHead className="w-28">Relatório</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {linhas.map((a) => (
                  <TableRow key={a.id}>
                    <TableCell className="whitespace-nowrap">
                      <Link
                        href={`/painel/saude/atendimentos/${a.id}`}
                        className="text-primary hover:underline"
                      >
                        {formatarData(a.data_atendimento)}
                      </Link>
                    </TableCell>
                    <TableCell>{a.tipoNome ?? "—"}</TableCell>
                    <TableCell>{a.profissionalNome ?? "—"}</TableCell>
                    <TableCell className="max-w-md">
                      <span className="line-clamp-1">
                        {a.observacao_aberta ?? "—"}
                      </span>
                    </TableCell>
                    <TableCell>
                      {a.temRelatorio ? (
                        <Badge variant="outline">Há relatório</Badge>
                      ) : (
                        <span className="text-muted-foreground text-xs">—</span>
                      )}
                    </TableCell>
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
