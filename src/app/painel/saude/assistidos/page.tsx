import type { Metadata } from "next"
import Link from "next/link"
import { Plus, TriangleAlert, Users } from "lucide-react"

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
import { formatarCpf } from "@/lib/cpf"
import { listarAssistidos } from "@/lib/db/atendimentos"
import { formatarData } from "@/lib/formato"
import { lerPaginacao, paginar } from "@/lib/paginacao"

export const metadata: Metadata = { title: "Assistidos — Confluir" }

const CAMPO =
  "border-input bg-background text-foreground h-9 rounded-md border px-3 text-sm shadow-xs outline-none"

export default async function AssistidosPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>
}) {
  await requirePermissao("saude_atendimento", ["saude_gestao"])

  const p = await searchParams
  const busca = (p.busca ?? "").trim()
  const { linhas, disponivel } = await listarAssistidos(busca)
  const pag = lerPaginacao(p, 30)
  const { linhas: pagina, ...info } = paginar(linhas, pag)

  const hoje = new Date().toISOString().slice(0, 10)

  return (
    <>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Assistidos</h1>
          <p className="text-muted-foreground mt-1 text-xs">
            Pessoas acompanhadas pelo serviço de saúde
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button asChild>
            <Link href="/painel/saude/assistidos/novo">
              <Plus />
              Novo assistido
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

      <form className="flex flex-wrap items-center gap-2" action="/painel/saude/assistidos">
        <input
          type="search"
          name="busca"
          defaultValue={busca}
          placeholder="Nome ou CPF"
          className={`${CAMPO} w-72 max-w-full`}
        />
        <Button type="submit" variant="outline" size="sm">
          Buscar
        </Button>
        {busca && (
          <Button variant="ghost" size="sm" asChild>
            <Link href="/painel/saude/assistidos">Limpar</Link>
          </Button>
        )}
      </form>

      <Card>
        <CardContent>
          {pagina.length === 0 ? (
            <p className="text-muted-foreground py-8 text-center text-sm">
              <Users className="mx-auto mb-2 size-5" />
              {busca
                ? "Nenhum assistido encontrado com esta busca."
                : "Nenhum assistido cadastrado."}
            </p>
          ) : (
            <>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Nome</TableHead>
                    <TableHead>CPF</TableHead>
                    <TableHead>Vínculo</TableHead>
                    <TableHead className="w-28">Atendimentos</TableHead>
                    <TableHead>Guarda até</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {pagina.map((a) => (
                    <TableRow key={a.id}>
                      <TableCell>
                        <Link
                          href={`/painel/saude/assistidos/${a.id}`}
                          className="text-primary font-medium hover:underline"
                        >
                          {a.nome ?? "(sem nome)"}
                        </Link>
                      </TableCell>
                      <TableCell className="font-mono text-xs">
                        {a.filiadoCpf ? formatarCpf(a.filiadoCpf) : "—"}
                      </TableCell>
                      <TableCell>
                        {a.filiado_id ? (
                          <Badge variant="outline">Filiado</Badge>
                        ) : (
                          <span className="text-muted-foreground text-xs">
                            sem vínculo
                          </span>
                        )}
                        {a.nome_retido_cifrado && (
                          <Badge variant="warning" className="ml-1">
                            Cadastro anonimizado
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell className="tabular-nums">
                        {a.atendimentos}
                      </TableCell>
                      <TableCell className="whitespace-nowrap">
                        {a.retencao_ate ? (
                          <span
                            className={
                              a.retencao_ate < hoje && !a.retencao_regime
                                ? "text-warning-fg"
                                : undefined
                            }
                          >
                            {formatarData(a.retencao_ate)}
                            {a.retencao_regime && (
                              <Badge variant="outline" className="ml-1">
                                regime especial
                              </Badge>
                            )}
                          </span>
                        ) : (
                          <span className="text-muted-foreground">—</span>
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
