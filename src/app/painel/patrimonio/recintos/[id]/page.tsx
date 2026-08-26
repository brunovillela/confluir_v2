import type { Metadata } from "next"
import Link from "next/link"
import { notFound } from "next/navigation"
import { ArrowLeft } from "lucide-react"

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
  buscarRecinto,
  listarItensDoRecinto,
  listarResponsaveisRecinto,
  listarUsuariosParaCautela,
} from "@/lib/db/patrimonio"
import { formatarData } from "@/lib/formato"

import { atualizarRecintoAction } from "../../actions"
import { RecintoForm } from "../../recinto-form"
import { DefinirResponsavelForm } from "./responsavel-form"

export const metadata: Metadata = { title: "Recinto — Confluir" }

export default async function RecintoPage({
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

  const recinto = await buscarRecinto(id)
  if (!recinto) notFound()

  const [itens, responsaveis, usuarios] = await Promise.all([
    listarItensDoRecinto(id),
    listarResponsaveisRecinto(id),
    listarUsuariosParaCautela(),
  ])
  const responsavelAtual = responsaveis.find((r) => r.atual) ?? null
  const hoje = hojeSP()

  return (
    <>
      <RotuloTrilha valores={{ [id]: recinto.nome ?? "Recinto" }} />

      <div>
        <Button variant="ghost" size="sm" asChild className="-ml-2 mb-2">
          <Link href="/painel/patrimonio/recintos">
            <ArrowLeft />
            Recintos
          </Link>
        </Button>
        <h1 className="flex flex-wrap items-center gap-3 text-2xl font-semibold tracking-tight">
          {recinto.nome ?? "(sem nome)"}
          {recinto.sede && <Badge variant="outline">{recinto.sede}</Badge>}
        </h1>
        <p className="text-muted-foreground mt-1 text-xs">
          {recinto.codigo ? `Código ${recinto.codigo}` : "sem código"}
          {responsavelAtual?.funcionarioNome
            ? ` · resp. ${responsavelAtual.funcionarioNome}`
            : ""}
        </p>
      </div>

      {salvo && (
        <Alert variant="success">
          <AlertDescription>Alterações salvas.</AlertDescription>
        </Alert>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardContent className="grid gap-2 text-sm">
            <p className="font-medium">Dados do recinto</p>
            <Linha rotulo="Código" valor={recinto.codigo} />
            <Linha rotulo="Sede" valor={recinto.sede} />
            <Linha
              rotulo="Responsável atual"
              valor={responsavelAtual?.funcionarioNome}
            />
            <Linha rotulo="Itens alocados" valor={String(itens.length)} />
          </CardContent>
        </Card>
        <Card>
          <CardContent className="grid gap-2 text-sm">
            <p className="font-medium">Descrição física</p>
            <p className="text-muted-foreground whitespace-pre-line">
              {recinto.descricao_fisica ?? "Sem descrição."}
            </p>
          </CardContent>
        </Card>
      </div>

      {podeEditar && (
        <GrupoColapsavel
          titulo="Editar recinto"
          descricao="Nome, código, sede e descrição física"
        >
          <RecintoForm
            action={atualizarRecintoAction}
            dados={recinto}
            podeEditar={podeEditar}
          />
        </GrupoColapsavel>
      )}

      <GrupoColapsavel
        titulo="Responsáveis"
        descricao="Histórico de responsáveis pelo recinto"
        resumo={
          <span className="text-muted-foreground text-sm tabular-nums">
            {responsaveis.length}
          </span>
        }
        aberto
      >
        {podeEditar && (
          <div className="mb-4 rounded-lg border p-4">
            {usuarios.length === 0 ? (
              <p className="text-muted-foreground text-sm">
                Nenhum usuário disponível para designar.
              </p>
            ) : (
              <DefinirResponsavelForm
                recintoId={recinto.id}
                usuarios={usuarios}
                hoje={hoje}
                podeEditar={podeEditar}
              />
            )}
          </div>
        )}
        {responsaveis.length === 0 ? (
          <p className="text-muted-foreground text-sm">
            Nenhum responsável registrado.
          </p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Responsável</TableHead>
                <TableHead>Início</TableHead>
                <TableHead>Término</TableHead>
                <TableHead>Situação</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {responsaveis.map((r) => (
                <TableRow key={r.id}>
                  <TableCell>{r.funcionarioNome ?? "—"}</TableCell>
                  <TableCell className="whitespace-nowrap">
                    {r.inicio ? formatarData(r.inicio) : "—"}
                  </TableCell>
                  <TableCell className="whitespace-nowrap">
                    {r.termino ? formatarData(r.termino) : "—"}
                  </TableCell>
                  <TableCell>
                    {r.atual ? (
                      <Badge variant="outline">Atual</Badge>
                    ) : (
                      <Badge variant="outline" className="text-muted-foreground">
                        Encerrado
                      </Badge>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </GrupoColapsavel>

      <GrupoColapsavel
        titulo="Itens no recinto"
        descricao="Bens patrimoniais alocados aqui"
        resumo={
          <span className="text-muted-foreground text-sm tabular-nums">
            {itens.length}
          </span>
        }
      >
        {itens.length === 0 ? (
          <p className="text-muted-foreground text-sm">
            Nenhum item alocado neste recinto.
          </p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Item</TableHead>
                <TableHead>Nº patrimônio</TableHead>
                <TableHead>Situação</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {itens.map((i) => (
                <TableRow key={i.id}>
                  <TableCell className="max-w-80">
                    <Link
                      href={`/painel/patrimonio/${i.id}`}
                      className="text-primary hover:underline"
                    >
                      <span className="line-clamp-1">{i.nome ?? "(sem nome)"}</span>
                    </Link>
                  </TableCell>
                  <TableCell className="whitespace-nowrap tabular-nums">
                    {i.numero_patrimonio ?? "—"}
                  </TableCell>
                  <TableCell>
                    {i.ativo ? (
                      <Badge variant="outline">Ativo</Badge>
                    ) : (
                      <Badge variant="outline" className="text-muted-foreground">
                        Inativo
                      </Badge>
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
