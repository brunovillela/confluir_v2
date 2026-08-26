import type { Metadata } from "next"
import Link from "next/link"
import { notFound } from "next/navigation"
import { ArrowLeft, ExternalLink } from "lucide-react"

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
import { GrupoColapsavel } from "@/components/grupo-colapsavel"
import { RotuloTrilha } from "@/components/layout/trilha-rotulos"
import { requirePermissao } from "@/lib/auth"
import { podeAcessar } from "@/lib/permissoes"
import { hojeSP } from "@/lib/db/comum"
import {
  buscarItem,
  listarCautelas,
  listarRecintosOpcoes,
  listarUsuariosParaCautela,
} from "@/lib/db/patrimonio"
import { formatarData } from "@/lib/formato"

import { atualizarItemAction } from "../actions"
import { ItemForm } from "../item-form"
import {
  EncerrarCautelaForm,
  RegistrarCautelaForm,
} from "./cautela-controles"
import { ItemAcoes } from "./item-acoes"

export const metadata: Metadata = { title: "Item — Confluir" }

export default async function ItemPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ salvo?: string }>
}) {
  const sessao = await requirePermissao("patrimonio_geral", [
    "patrimonio_leitura",
  ])
  const podeEditar = podeAcessar(sessao.permissoes, "patrimonio_geral")
  const { id } = await params
  const { salvo } = await searchParams

  const item = await buscarItem(id)
  if (!item) notFound()

  const [cautelas, recintos, usuarios] = await Promise.all([
    listarCautelas(id),
    listarRecintosOpcoes(),
    listarUsuariosParaCautela(),
  ])
  const cautelaAberta = cautelas.find((c) => c.aberta) ?? null
  const hoje = hojeSP()

  return (
    <>
      <RotuloTrilha valores={{ [id]: item.nome ?? "Item" }} />

      <div>
        <Button variant="ghost" size="sm" asChild className="-ml-2 mb-2">
          <Link href="/painel/patrimonio/itens">
            <ArrowLeft />
            Itens
          </Link>
        </Button>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="flex flex-wrap items-center gap-3 text-2xl font-semibold tracking-tight">
              {item.nome ?? "(sem nome)"}
              {item.ativo ? (
                <Badge variant="outline">Ativo</Badge>
              ) : (
                <Badge variant="outline" className="text-muted-foreground">
                  Inativo
                </Badge>
              )}
              {item.emCautela && (
                <Badge
                  variant="outline"
                  className="border-warning/40 text-warning-fg"
                >
                  Em cautela
                </Badge>
              )}
            </h1>
            <p className="text-muted-foreground mt-1 text-xs">
              {item.numero_patrimonio
                ? `Nº ${item.numero_patrimonio}`
                : "sem número de patrimônio"}
              {item.recintoNome ? ` · ${item.recintoNome}` : ""}
            </p>
          </div>
          <ItemAcoes
            itemId={item.id}
            ativo={item.ativo}
            podeEditar={podeEditar}
          />
        </div>
      </div>

      {salvo && (
        <Alert variant="success">
          <AlertDescription>Alterações salvas.</AlertDescription>
        </Alert>
      )}
      {item.emCautela && item.responsavelNome && (
        <Alert variant="info">
          <AlertDescription>
            Item sob cautela de {item.responsavelNome}.
          </AlertDescription>
        </Alert>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardContent className="grid gap-2 text-sm">
            <p className="font-medium">Identificação</p>
            <Linha rotulo="Nº de patrimônio" valor={item.numero_patrimonio} />
            <Linha
              rotulo="Nº de patrimônio antigo"
              valor={item.numero_patrimonio_antigo}
            />
            <Linha rotulo="Número único" valor={item.numero_unico} />
            <Linha rotulo="Recinto" valor={item.recintoNome} />
          </CardContent>
        </Card>

        <Card>
          <CardContent className="grid gap-2 text-sm">
            <p className="font-medium">Descrição</p>
            <p className="text-muted-foreground whitespace-pre-line">
              {item.descricao ?? "Sem descrição."}
            </p>
          </CardContent>
        </Card>
      </div>

      {podeEditar && (
        <GrupoColapsavel
          titulo="Editar cadastro"
          descricao="Nome, números de patrimônio, recinto e descrição"
        >
          <ItemForm
            action={atualizarItemAction}
            dados={item}
            recintos={recintos}
            podeEditar={podeEditar}
          />
        </GrupoColapsavel>
      )}

      <GrupoColapsavel
        titulo="Cautelas"
        descricao="Histórico de guarda temporária deste item"
        resumo={
          <span className="text-muted-foreground text-sm tabular-nums">
            {cautelas.length}
          </span>
        }
        aberto
      >
        {podeEditar && (
          <div className="mb-4 rounded-lg border p-4">
            {cautelaAberta ? (
              <div className="grid gap-3">
                <p className="text-sm">
                  Sob cautela de{" "}
                  <span className="font-medium">
                    {cautelaAberta.responsavelNome ?? "responsável"}
                  </span>
                  {cautelaAberta.inicio
                    ? ` desde ${formatarData(cautelaAberta.inicio)}`
                    : ""}
                  .
                </p>
                <EncerrarCautelaForm
                  itemId={item.id}
                  cautelaId={cautelaAberta.id}
                  hoje={hoje}
                  podeEditar={podeEditar}
                />
              </div>
            ) : usuarios.length === 0 ? (
              <p className="text-muted-foreground text-sm">
                Nenhum usuário disponível para receber a cautela.
              </p>
            ) : (
              <RegistrarCautelaForm
                itemId={item.id}
                usuarios={usuarios}
                hoje={hoje}
                podeEditar={podeEditar}
              />
            )}
          </div>
        )}

        {cautelas.length === 0 ? (
          <p className="text-muted-foreground text-sm">
            Nenhuma cautela registrada para este item.
          </p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Responsável</TableHead>
                <TableHead>Início</TableHead>
                <TableHead>Término</TableHead>
                <TableHead>Situação</TableHead>
                <TableHead>Termo</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {cautelas.map((c) => (
                <TableRow key={c.id}>
                  <TableCell>{c.responsavelNome ?? "—"}</TableCell>
                  <TableCell className="whitespace-nowrap">
                    {c.inicio ? formatarData(c.inicio) : "—"}
                  </TableCell>
                  <TableCell className="whitespace-nowrap">
                    {c.termino ? formatarData(c.termino) : "—"}
                  </TableCell>
                  <TableCell>
                    {c.aberta ? (
                      <Badge
                        variant="outline"
                        className="border-warning/40 text-warning-fg"
                      >
                        Em aberto
                      </Badge>
                    ) : (
                      <Badge variant="outline">Encerrada</Badge>
                    )}
                  </TableCell>
                  <TableCell>
                    {c.arquivoUrl ? (
                      <a
                        href={c.arquivoUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="text-primary inline-flex items-center gap-1 hover:underline"
                      >
                        <ExternalLink className="size-3.5" />
                        PDF
                      </a>
                    ) : (
                      "—"
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </GrupoColapsavel>
    </>
  )
}

function Linha({
  rotulo,
  valor,
}: {
  rotulo: string
  valor: string | null | undefined
}) {
  return (
    <p className="flex items-baseline justify-between gap-3">
      <span className="text-muted-foreground">{rotulo}</span>
      <span className="text-right">{valor ?? "—"}</span>
    </p>
  )
}
