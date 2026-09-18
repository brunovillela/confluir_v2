import type { Metadata } from "next"
import Link from "next/link"
import { notFound } from "next/navigation"
import { Building, ExternalLink } from "lucide-react"

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
import { GrupoColapsavel } from "@/components/grupo-colapsavel"
import { requirePermissao } from "@/lib/auth"
import {
  assentosDoMandato,
  integrantesDoMandato,
  listarInstancias,
  obterMandato,
} from "@/lib/db/diretoria"
import { formatarData } from "@/lib/formato"

import { AdicionarAssento, RemoverAssento } from "../../diretoria-extra-forms"
import { CabecalhoMandato } from "../cabecalho-mandato"

export const metadata: Metadata = { title: "Instâncias do mandato — Confluir" }

/** Vínculos dos diretores deste mandato às instâncias (cadastradas fora do mandato). */
export default async function InstanciasDoMandatoPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  await requirePermissao("diretoria_mandatos", ["configuracoes"])
  const { id } = await params
  const mandato = await obterMandato(id)
  if (!mandato) notFound()

  const [assentos, { disponivel, instancias }, integrantes] = await Promise.all([
    assentosDoMandato(id),
    listarInstancias(),
    integrantesDoMandato(id),
  ])

  return (
    <>
      <CabecalhoMandato
        mandatoId={mandato.id}
        mandato={mandato.mandato}
        titulo="Instâncias"
        descricao="Em que instâncias cada diretor deste mandato representa a entidade"
        acoes={
          <Button variant="outline" size="sm" asChild>
            <Link href="/painel/institucional/diretoria/instancias">
              <Building />
              Cadastro de instâncias
            </Link>
          </Button>
        }
      />

      {disponivel ? (
        <div className="grid gap-4">
          <GrupoColapsavel titulo="Vincular diretor a uma instância">
            <AdicionarAssento mandatoId={mandato.id} instancias={instancias} integrantes={integrantes} />
          </GrupoColapsavel>
          <Card>
            <CardContent>
              {assentos.length === 0 ? (
                <p className="text-muted-foreground py-6 text-center text-sm">
                  Nenhum diretor deste mandato vinculado a instâncias.
                </p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Instância</TableHead>
                      <TableHead>Diretor</TableHead>
                      <TableHead>Cargo</TableHead>
                      <TableHead>Período</TableHead>
                      <TableHead>Documento</TableHead>
                      <TableHead className="w-10" />
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {assentos.map((a) => (
                      <TableRow key={a.id}>
                        <TableCell>
                          <Link
                            href={`/painel/institucional/diretoria/instancias/${a.instanciaId}`}
                            className="text-primary font-medium hover:underline"
                          >
                            {a.instanciaNome ?? "—"}
                          </Link>
                        </TableCell>
                        <TableCell className="text-sm">{a.integranteNome ?? "—"}</TableCell>
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
                          <RemoverAssento assentoId={a.id} instanciaId={a.instanciaId} mandatoId={mandato.id} />
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </div>
      ) : (
        <Alert variant="warning">
          <AlertDescription>
            As instâncias usam tabelas novas — rode <code>supabase/diretoria-liberacoes-instancias.sql</code> no Supabase.
          </AlertDescription>
        </Alert>
      )}
    </>
  )
}
