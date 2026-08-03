import type { Metadata } from "next"
import Link from "next/link"
import { ClipboardList, Lock, Plus, TriangleAlert } from "lucide-react"

import { Alert, AlertDescription } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Paginacao } from "@/components/paginacao"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { requirePermissao } from "@/lib/auth"
import { listarAtendimentos, listarTiposAtendimento } from "@/lib/db/atendimentos"
import { formatarData } from "@/lib/formato"
import { lerPaginacao, paginar } from "@/lib/paginacao"

export const metadata: Metadata = { title: "Atendimentos — Confluir" }

const CAMPO =
  "border-input bg-background text-foreground h-9 rounded-md border px-3 text-sm shadow-xs outline-none"

export default async function AtendimentosPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>
}) {
  await requirePermissao("saude_atendimento", ["saude_gestao"])

  const p = await searchParams
  const busca = (p.busca ?? "").trim()
  const tipoId = p.tipo ?? ""

  const [{ linhas, disponivel }, { tipos }] = await Promise.all([
    listarAtendimentos({ busca, tipoId: tipoId || undefined }),
    listarTiposAtendimento(),
  ])

  const pag = lerPaginacao(p, 30)
  const { linhas: pagina, ...info } = paginar(linhas, pag)

  return (
    <>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">
            Atendimentos
          </h1>
          <p className="text-muted-foreground mt-1 text-xs">
            Registro de atendimentos do serviço de saúde
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button asChild>
            <Link href="/painel/saude/atendimentos/novo">
              <Plus />
              Novo atendimento
            </Link>
          </Button>
          <Button variant="outline" asChild>
            <Link href="/painel/saude">Voltar ao módulo</Link>
          </Button>
        </div>
      </div>

      {!disponivel && (
        <Alert variant="warning">
          <TriangleAlert />
          <AlertDescription>
            Atendimentos ainda não configurados — rode{" "}
            <code>supabase/saude-atendimentos.sql</code>.
          </AlertDescription>
        </Alert>
      )}

      <Alert>
        <Lock />
        <AlertDescription>
          Esta lista mostra apenas metadados. A busca cobre assistido, tipo,
          profissional e observação aberta — <strong>nunca o relatório
          clínico</strong>, que fica fora da pesquisa para não revelar conteúdo
          por dedução.
        </AlertDescription>
      </Alert>

      <form
        className="flex flex-wrap items-center gap-2"
        action="/painel/saude/atendimentos"
      >
        <input
          type="search"
          name="busca"
          defaultValue={busca}
          placeholder="Assistido, profissional ou observação"
          className={`${CAMPO} w-72 max-w-full`}
        />
        <select name="tipo" defaultValue={tipoId} className={CAMPO}>
          <option value="">Todos os tipos</option>
          {tipos.map((t) => (
            <option key={t.id} value={t.id}>
              {t.nome}
            </option>
          ))}
        </select>
        <Button type="submit" variant="outline" size="sm">
          Filtrar
        </Button>
        {(busca || tipoId) && (
          <Button variant="ghost" size="sm" asChild>
            <Link href="/painel/saude/atendimentos">Limpar</Link>
          </Button>
        )}
      </form>

      <Card>
        <CardContent>
          {pagina.length === 0 ? (
            <p className="text-muted-foreground py-8 text-center text-sm">
              <ClipboardList className="mx-auto mb-2 size-5" />
              Nenhum atendimento encontrado.
            </p>
          ) : (
            <>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Data</TableHead>
                    <TableHead>Assistido</TableHead>
                    <TableHead>Tipo</TableHead>
                    <TableHead>Profissional</TableHead>
                    <TableHead>Observação aberta</TableHead>
                    <TableHead className="w-28">Relatório</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {pagina.map((a) => (
                    <TableRow key={a.id}>
                      <TableCell className="whitespace-nowrap">
                        <Link
                          href={`/painel/saude/atendimentos/${a.id}`}
                          className="text-primary hover:underline"
                        >
                          {formatarData(a.data_atendimento)}
                        </Link>
                      </TableCell>
                      <TableCell className="font-medium">
                        {a.assistidoNome ?? "—"}
                        {!a.assistidoFiliadoId && (
                          <span className="text-muted-foreground ml-1 text-xs">
                            (não filiado)
                          </span>
                        )}
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
                          <Badge variant="outline">
                            <Lock className="size-3" />
                            Há relatório
                          </Badge>
                        ) : (
                          <span className="text-muted-foreground text-xs">
                            —
                          </span>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              <Paginacao {...info} porPagina={pag.porPagina} padrao={30} />
            </>
          )}
        </CardContent>
      </Card>
    </>
  )
}
