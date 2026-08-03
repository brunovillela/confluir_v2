import type { Metadata } from "next"
import Link from "next/link"
import { notFound } from "next/navigation"
import { ArrowLeft, ExternalLink } from "lucide-react"

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
import { CartaoEditavel } from "@/components/cartao-editavel"
import { GrupoColapsavel } from "@/components/grupo-colapsavel"
import { requirePermissao } from "@/lib/auth"
import { integrantesVigentes, obterInstancia } from "@/lib/db/diretoria"
import { formatarData } from "@/lib/formato"

import {
  AdicionarAssento,
  InstanciaForm,
  RemoverAssento,
} from "../../diretoria-extra-forms"

export const metadata: Metadata = { title: "Instância — Confluir" }

export default async function InstanciaPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  await requirePermissao("diretoria_mandatos", ["configuracoes"])
  const { id } = await params

  const [instancia, integrantes] = await Promise.all([
    obterInstancia(id),
    integrantesVigentes(),
  ])
  if (!instancia) notFound()

  return (
    <>
      <div className="flex items-center gap-2">
        <Button variant="ghost" size="sm" asChild>
          <Link href="/painel/institucional/diretoria/instancias">
            <ArrowLeft />
            Instâncias
          </Link>
        </Button>
      </div>

      <h1 className="text-2xl font-semibold tracking-tight">
        {instancia.nome ?? "(sem nome)"}
      </h1>

      {/* Dados da instância: info + lápis */}
      <CartaoEditavel
        titulo="Dados da instância"
        resumo={
          <dl className="grid gap-2 text-sm">
            <div>
              <dt className="text-muted-foreground text-xs">Nome</dt>
              <dd>{instancia.nome ?? "—"}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground text-xs">Descrição</dt>
              <dd className="whitespace-pre-wrap">{instancia.descricao ?? "—"}</dd>
            </div>
          </dl>
        }
      >
        <InstanciaForm
          edicao
          dados={{
            id: instancia.id,
            nome: instancia.nome,
            descricao: instancia.descricao,
          }}
        />
      </CartaoEditavel>

      {/* Assentos */}
      <div>
        <h2 className="text-lg font-semibold">Assentos</h2>
        <p className="text-muted-foreground mt-0.5 mb-3 text-xs">
          Diretores que representam o sindicato nesta instância, com cargo,
          mandato e documento de posse
        </p>

        <div className="grid gap-4">
          <GrupoColapsavel titulo="Adicionar assento">
            <AdicionarAssento instanciaId={instancia.id} integrantes={integrantes} />
          </GrupoColapsavel>

          <Card>
            <CardContent>
              {instancia.assentos.length === 0 ? (
                <p className="text-muted-foreground py-6 text-center text-sm">
                  Nenhum assento nesta instância ainda.
                </p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Diretor</TableHead>
                      <TableHead>Cargo</TableHead>
                      <TableHead>Mandato</TableHead>
                      <TableHead>Documento</TableHead>
                      <TableHead className="w-10" />
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {instancia.assentos.map((a) => (
                      <TableRow key={a.id}>
                        <TableCell className="font-medium">
                          {a.integranteNome ?? "—"}
                        </TableCell>
                        <TableCell className="text-sm">{a.cargo ?? "—"}</TableCell>
                        <TableCell className="whitespace-nowrap text-sm">
                          {a.mandatoInicio ? formatarData(a.mandatoInicio) : "?"}
                          {" – "}
                          {a.mandatoFim ? formatarData(a.mandatoFim) : "?"}
                        </TableCell>
                        <TableCell>
                          {a.documentoUrl ? (
                            <a
                              href={a.documentoUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-primary inline-flex items-center gap-1 text-sm hover:underline"
                            >
                              <ExternalLink className="size-3.5" />
                              abrir
                            </a>
                          ) : (
                            <span className="text-muted-foreground text-sm">—</span>
                          )}
                        </TableCell>
                        <TableCell className="py-1">
                          <RemoverAssento assentoId={a.id} instanciaId={instancia.id} />
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </>
  )
}
