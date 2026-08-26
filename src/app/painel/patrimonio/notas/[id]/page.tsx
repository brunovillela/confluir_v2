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
import { listarFornecedores } from "@/lib/db/compras"
import {
  buscarNota,
  listarItensDaNota,
  urlArquivoPatrimonio,
} from "@/lib/db/patrimonio"
import { formatarData } from "@/lib/formato"

import { atualizarNotaAction } from "../../actions"
import { NotaForm } from "../nota-form"

export const metadata: Metadata = { title: "Nota fiscal — Confluir" }

export default async function NotaPage({
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

  const nota = await buscarNota(id)
  if (!nota) notFound()

  const [itens, fornecedores, arquivoUrl] = await Promise.all([
    listarItensDaNota(id),
    listarFornecedores(),
    urlArquivoPatrimonio(nota.arquivo_nota),
  ])

  return (
    <>
      <RotuloTrilha
        valores={{ [id]: nota.numero_nota ?? "Nota fiscal" }}
      />

      <div>
        <Button variant="ghost" size="sm" asChild className="-ml-2 mb-2">
          <Link href="/painel/patrimonio/notas">
            <ArrowLeft />
            Notas fiscais
          </Link>
        </Button>
        <h1 className="flex flex-wrap items-center gap-3 text-2xl font-semibold tracking-tight">
          <span className="tabular-nums">
            {nota.numero_nota ?? "(sem número)"}
          </span>
          {nota.entrada === false ? (
            <Badge variant="outline" className="text-muted-foreground">
              Saída
            </Badge>
          ) : (
            <Badge variant="outline">Entrada</Badge>
          )}
        </h1>
        <p className="text-muted-foreground mt-1 text-xs">
          {nota.fornecedorNome ?? "sem fornecedor"}
          {nota.data_emissao ? ` · ${formatarData(nota.data_emissao)}` : ""}
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
            <p className="font-medium">Dados da nota</p>
            <Linha rotulo="Número" valor={nota.numero_nota} />
            <Linha
              rotulo="Tipo"
              valor={nota.entrada === false ? "Saída" : "Entrada"}
            />
            <Linha
              rotulo="Emissão"
              valor={nota.data_emissao ? formatarData(nota.data_emissao) : null}
            />
            <Linha rotulo="Fornecedor" valor={nota.fornecedorNome} />
          </CardContent>
        </Card>
        <Card>
          <CardContent className="grid gap-2 text-sm">
            <p className="font-medium">Arquivo</p>
            {arquivoUrl ? (
              <a
                href={arquivoUrl}
                target="_blank"
                rel="noreferrer"
                className="text-primary flex items-center gap-1.5 hover:underline"
              >
                <ExternalLink className="size-3.5" />
                Abrir PDF da nota
              </a>
            ) : (
              <p className="text-muted-foreground">Nenhum arquivo anexado.</p>
            )}
          </CardContent>
        </Card>
      </div>

      {podeEditar && (
        <GrupoColapsavel
          titulo="Editar nota"
          descricao="Número, tipo, emissão, fornecedor e arquivo"
        >
          <NotaForm
            action={atualizarNotaAction}
            dados={nota}
            temArquivo={Boolean(arquivoUrl)}
            fornecedores={fornecedores.map((f) => ({
              id: f.id,
              nome: f.nome,
              cnpj_cpf: f.cnpj_cpf,
              bloqueado: false,
            }))}
            podeEditar={podeEditar}
          />
        </GrupoColapsavel>
      )}

      <GrupoColapsavel
        titulo="Itens da nota"
        descricao="Bens vinculados a esta nota (entrada ou saída)"
        resumo={
          <span className="text-muted-foreground text-sm tabular-nums">
            {itens.length}
          </span>
        }
        aberto
      >
        {itens.length === 0 ? (
          <p className="text-muted-foreground text-sm">
            Nenhum item vinculado a esta nota.
          </p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Item</TableHead>
                <TableHead>Nº patrimônio</TableHead>
                <TableHead>Vínculo</TableHead>
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
                      <span className="line-clamp-1">
                        {i.nome ?? "(sem nome)"}
                      </span>
                    </Link>
                  </TableCell>
                  <TableCell className="whitespace-nowrap tabular-nums">
                    {i.numero_patrimonio ?? "—"}
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline" className="capitalize">
                      {i.tipo}
                    </Badge>
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
