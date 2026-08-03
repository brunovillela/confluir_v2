import type { Metadata } from "next"
import Link from "next/link"
import { notFound } from "next/navigation"
import {
  CircleCheck,
  Eye,
  Lock,
  Pencil,
  ShieldAlert,
  TriangleAlert,
} from "lucide-react"

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
  acessosDoAtendimento,
  buscarAtendimento,
  lerRelatorio,
  listarAssistidos,
  listarProfissionais,
  listarTiposAtendimento,
  perfilClinico,
} from "@/lib/db/atendimentos"
import { formatarData, formatarDataHora } from "@/lib/formato"

import { AtendimentoForm, RelatorioForm } from "../atendimento-forms"

export const metadata: Metadata = { title: "Atendimento — Confluir" }

const MOTIVOS: Record<string, string> = {
  autor: "autor",
  profissional_mesmo_tipo: "profissional do mesmo tipo",
  coordenacao: "coordenação clínica",
}

export default async function AtendimentoPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ editar?: string; salvo?: string; relatorio?: string }>
}) {
  const sessao = await requirePermissao("saude_atendimento", ["saude_gestao"])

  const { id } = await params
  const { editar, salvo, relatorio } = await searchParams
  const atendimento = await buscarAtendimento(id)
  if (!atendimento) notFound()

  if (editar === "1") {
    const [{ linhas: assistidos }, { tipos }, { linhas: profissionais }] =
      await Promise.all([
        listarAssistidos(),
        listarTiposAtendimento(),
        listarProfissionais(),
      ])
    return (
      <>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <h1 className="text-2xl font-semibold tracking-tight">
            Editar atendimento
          </h1>
          <Button variant="outline" asChild>
            <Link href={`/painel/saude/atendimentos/${id}`}>Cancelar</Link>
          </Button>
        </div>
        <AtendimentoForm
          atendimento={atendimento}
          assistidos={assistidos.map((a) => ({
            id: a.id,
            nome: a.nome ?? "(sem nome)",
          }))}
          tipos={tipos}
          profissionais={profissionais}
        />
      </>
    )
  }

  // Único caminho para o conteúdo clínico. Decide o acesso e registra.
  const perfil = await perfilClinico(sessao.usuario.id)
  const resultado = await lerRelatorio(id, perfil, {
    tipoId: atendimento.tipo_id,
    profissionalId: atendimento.profissional_id,
    atendenteId: atendimento.atendente_id,
  })
  const podeVerRelatorio =
    resultado.situacao === "ok" || resultado.situacao === "sem_relatorio"

  // A trilha só faz sentido para quem já tem acesso ao conteúdo: a lista de
  // quem consultou um prontuário é, ela própria, informação sensível.
  const acessos = podeVerRelatorio ? await acessosDoAtendimento(id) : []

  return (
    <>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">
            {atendimento.assistidoNome ?? "Atendimento"}
          </h1>
          <p className="text-muted-foreground mt-1 text-xs">
            {formatarData(atendimento.data_atendimento)}
            {atendimento.tipoNome && ` · ${atendimento.tipoNome}`}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" asChild>
            <Link href={`/painel/saude/atendimentos/${id}?editar=1`}>
              <Pencil />
              Editar
            </Link>
          </Button>
          <Button variant="outline" asChild>
            <Link href="/painel/saude/atendimentos">Voltar à lista</Link>
          </Button>
        </div>
      </div>

      {(salvo === "1" || relatorio === "1") && (
        <Alert variant="success">
          <CircleCheck />
          <AlertDescription>
            {relatorio === "1" ? "Relatório salvo." : "Atendimento salvo."}
          </AlertDescription>
        </Alert>
      )}

      <div className="grid gap-4 lg:grid-cols-4">
        <Card>
          <CardContent>
            <p className="text-muted-foreground text-xs">Assistido</p>
            <p className="mt-1 text-sm font-medium">
              {atendimento.assistido_id ? (
                <Link
                  href={`/painel/saude/assistidos/${atendimento.assistido_id}`}
                  className="text-primary hover:underline"
                >
                  {atendimento.assistidoNome ?? "—"}
                </Link>
              ) : (
                "—"
              )}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent>
            <p className="text-muted-foreground text-xs">Tipo</p>
            <p className="mt-1 text-sm font-medium">
              {atendimento.tipoNome ?? "—"}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent>
            <p className="text-muted-foreground text-xs">Profissional</p>
            <p className="mt-1 text-sm font-medium">
              {atendimento.profissionalNome ?? "—"}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent>
            <p className="text-muted-foreground text-xs">Vínculo</p>
            <p className="mt-1 text-sm font-medium">
              {atendimento.assistidoFiliadoId ? (
                <Badge variant="outline">Filiado</Badge>
              ) : (
                <span className="text-muted-foreground">Não filiado</span>
              )}
            </p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardContent>
          <p className="mb-2 text-sm font-medium">Observação aberta</p>
          {atendimento.observacao_aberta ? (
            <p className="text-sm whitespace-pre-line">
              {atendimento.observacao_aberta}
            </p>
          ) : (
            <p className="text-muted-foreground text-sm">
              Nenhuma observação registrada.
            </p>
          )}
        </CardContent>
      </Card>

      {/* Relatório clínico */}
      <Card>
        <CardContent className="grid gap-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="flex items-center gap-2 text-sm font-medium">
              <Lock className="text-muted-foreground size-4" />
              Relatório clínico
            </p>
            {resultado.situacao === "ok" && (
              <Badge variant="outline">
                acesso como {MOTIVOS[resultado.motivo] ?? resultado.motivo}
              </Badge>
            )}
          </div>

          {resultado.situacao === "negado" && (
            <Alert>
              <ShieldAlert />
              <AlertDescription>
                Você não tem acesso ao relatório deste atendimento. Ele é
                legível por profissional cadastrado
                {atendimento.tipoNome
                  ? ` no tipo “${atendimento.tipoNome}”`
                  : " do mesmo tipo"}
                , pelo autor e pela coordenação clínica. Permissão
                administrativa não abre conteúdo clínico. A tentativa foi
                registrada.
              </AlertDescription>
            </Alert>
          )}

          {resultado.situacao === "sem_chave" && (
            <Alert variant="warning">
              <TriangleAlert />
              <AlertDescription>
                <code>SAUDE_RELATORIO_CHAVE</code> não está configurada — sem
                ela o relatório não pode ser lido nem gravado.
              </AlertDescription>
            </Alert>
          )}

          {resultado.situacao === "ilegivel" && (
            <Alert variant="warning">
              <TriangleAlert />
              <AlertDescription>
                O relatório existe mas não pôde ser decifrado. Isso acontece se
                a chave foi trocada ou se o conteúdo foi alterado por fora da
                aplicação. <strong>Não sobrescreva</strong> antes de investigar
                — gravar por cima destrói o original.
              </AlertDescription>
            </Alert>
          )}

          {podeVerRelatorio && (
            <RelatorioForm
              atendimentoId={id}
              texto={resultado.situacao === "ok" ? resultado.texto : ""}
            />
          )}
        </CardContent>
      </Card>

      {/* Trilha de auditoria */}
      {podeVerRelatorio && acessos.length > 0 && (
        <Card>
          <CardContent>
            <p className="mb-3 flex items-center gap-2 text-sm font-medium">
              <Eye className="text-muted-foreground size-4" />
              Quem acessou este relatório
            </p>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Quando</TableHead>
                  <TableHead>Quem</TableHead>
                  <TableHead>Ação</TableHead>
                  <TableHead>Motivo</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {acessos.map((a) => (
                  <TableRow key={a.id}>
                    <TableCell className="whitespace-nowrap">
                      {formatarDataHora(a.criado_em)}
                    </TableCell>
                    <TableCell>{a.usuarioNome ?? "—"}</TableCell>
                    <TableCell>
                      {a.acao === "negado" ? (
                        <Badge variant="warning">negado</Badge>
                      ) : (
                        <Badge variant="outline">{a.acao}</Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {a.motivo ? (MOTIVOS[a.motivo] ?? a.motivo) : "—"}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
    </>
  )
}
