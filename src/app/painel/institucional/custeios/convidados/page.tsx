import type { Metadata } from "next"
import Link from "next/link"
import { ArrowLeft, Plus, Users } from "lucide-react"

import { Alert, AlertDescription } from "@/components/ui/alert"
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
import { listarConvidados } from "@/lib/db/custeio"
import { podeAcessar } from "@/lib/permissoes"

export const metadata: Metadata = { title: "Convidados — Confluir" }

const FILTRO =
  "border-input bg-background text-foreground h-9 rounded-md border px-3 text-sm shadow-xs outline-none [color-scheme:light] dark:[color-scheme:dark]"

export default async function ConvidadosPage({
  searchParams,
}: {
  searchParams: Promise<{ busca?: string; salvo?: string }>
}) {
  const sessao = await requirePermissao("custeio_institucional", [
    "custeio_institucional_edicao",
  ])
  const podeEditar = podeAcessar(
    sessao.permissoes,
    "custeio_institucional_edicao"
  )
  const brutos = await searchParams
  const busca = (brutos.busca ?? "").trim()
  const convidados = await listarConvidados(busca)

  return (
    <>
      <div>
        <Button variant="ghost" size="sm" asChild className="-ml-2 mb-3">
          <Link href="/painel/institucional/custeios">
            <ArrowLeft />
            Custeio institucional
          </Link>
        </Button>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Convidados</h1>
            <p className="text-muted-foreground mt-1 text-xs">
              Convidados externos de eventos — cadastro leve, reutilizável entre
              custeios
            </p>
          </div>
          {podeEditar && (
            <Button asChild>
              <Link href="/painel/institucional/custeios/convidados/novo">
                <Plus />
                Novo convidado
              </Link>
            </Button>
          )}
        </div>
      </div>

      {brutos.salvo === "1" && (
        <Alert className="border-success/40 text-success-fg">
          <AlertDescription>Convidado salvo.</AlertDescription>
        </Alert>
      )}

      <form
        action="/painel/institucional/custeios/convidados"
        className="flex flex-wrap gap-2"
      >
        <input
          type="search"
          name="busca"
          defaultValue={busca}
          placeholder="Nome ou CPF"
          className={`${FILTRO} w-64 max-w-full`}
        />
        <Button type="submit" variant="outline" size="sm">
          Filtrar
        </Button>
      </form>

      <Card>
        <CardContent>
          {convidados.length === 0 ? (
            <p className="text-muted-foreground py-8 text-center text-sm">
              <Users className="mx-auto mb-2 size-5" />
              Nenhum convidado cadastrado.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Nome</TableHead>
                  <TableHead>CPF</TableHead>
                  <TableHead>Contato</TableHead>
                  {podeEditar && <TableHead />}
                </TableRow>
              </TableHeader>
              <TableBody>
                {convidados.map((c) => (
                  <TableRow key={c.id}>
                    <TableCell className="font-medium">{c.nome}</TableCell>
                    <TableCell className="text-sm">{c.cpf ?? "—"}</TableCell>
                    <TableCell className="text-sm">
                      {c.email ?? c.telefone ?? "—"}
                    </TableCell>
                    {podeEditar && (
                      <TableCell className="text-right">
                        <Button variant="ghost" size="sm" asChild>
                          <Link
                            href={`/painel/institucional/custeios/convidados/${c.id}`}
                          >
                            Editar
                          </Link>
                        </Button>
                      </TableCell>
                    )}
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
