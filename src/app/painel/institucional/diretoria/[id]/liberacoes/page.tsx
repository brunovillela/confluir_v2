import type { Metadata } from "next"
import Link from "next/link"
import { notFound } from "next/navigation"
import { ExternalLink } from "lucide-react"

import { Alert, AlertDescription } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
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
  empregadoresPorIntegrante,
  integrantesDoMandato,
  listarLiberacoes,
  obterMandato,
} from "@/lib/db/diretoria"
import { listarFontesPagadoras } from "@/lib/db/fontes"
import { oficiosEmitidosParaVinculo } from "@/lib/db/oficios"
import { escopoOficios } from "@/lib/db/oficios-acesso"
import { formatarData } from "@/lib/formato"

import { RemoverLiberacao } from "../../diretoria-extra-forms"
import { RegistrarLiberacoes } from "../../liberacoes-forms"
import { CabecalhoMandato } from "../cabecalho-mandato"

export const metadata: Metadata = { title: "Liberações do mandato — Confluir" }

/** Liberações sindicais do mandato: diretores e trabalhadores da base. */
export default async function LiberacoesDoMandatoPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  await requirePermissao("diretoria_mandatos", ["configuracoes"])
  const { id } = await params
  const mandato = await obterMandato(id)
  if (!mandato) notFound()

  const [{ disponivel, lote, liberacoes }, integrantes, empregadores, oficios, fontes] =
    await Promise.all([
      listarLiberacoes(id),
      integrantesDoMandato(id),
      empregadoresPorIntegrante(id),
      escopoOficios().then(oficiosEmitidosParaVinculo),
      listarFontesPagadoras(),
    ])
  const empresas = fontes.map((f) => ({
    id: f.id,
    nome: f.nome_fantasia ?? f.nome_razao ?? "(sem nome)",
    cnpj_cpf: f.cnpj_cpf,
    bloqueado: false,
  }))

  return (
    <>
      <CabecalhoMandato
        mandatoId={mandato.id}
        mandato={mandato.mandato}
        titulo="Liberações sindicais"
        descricao="Empregadores que liberam diretores — e trabalhadores da base — para a atividade sindical, com saída, retorno e o ofício ou documento que oficializou"
      />

      {!disponivel && (
        <Alert variant="warning">
          <AlertDescription>
            As liberações usam tabelas novas — rode{" "}
            <code>supabase/diretoria-liberacoes-instancias.sql</code> no Supabase.
          </AlertDescription>
        </Alert>
      )}

      {disponivel && (
        <div className="grid gap-4">
          <GrupoColapsavel titulo="Registrar liberação">
            <RegistrarLiberacoes
              mandatoId={mandato.id}
              integrantes={integrantes}
              empregadoresPorIntegrante={empregadores}
              oficios={oficios}
              empresas={empresas}
              loteDisponivel={lote}
            />
          </GrupoColapsavel>

          <Card>
            <CardContent>
              {liberacoes.length === 0 ? (
                <p className="text-muted-foreground py-6 text-center text-sm">
                  Nenhuma liberação registrada.
                </p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Pessoa</TableHead>
                      <TableHead>Empregador</TableHead>
                      <TableHead>Tipo</TableHead>
                      <TableHead>Vigência</TableHead>
                      <TableHead>Documento</TableHead>
                      <TableHead className="w-10" />
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {liberacoes.map((l) => (
                      <TableRow key={l.id}>
                        <TableCell className="font-medium">
                          <span className="flex items-center gap-2">
                            {l.pessoaNome ?? "—"}
                            {!l.ehDiretor && (
                              <Badge variant="outline" className="text-muted-foreground">
                                base
                              </Badge>
                            )}
                            {l.vigente && (
                              <Badge variant="outline" className="border-success/40 text-success-fg">
                                vigente
                              </Badge>
                            )}
                          </span>
                        </TableCell>
                        <TableCell className="text-sm">{l.empresaNome ?? "—"}</TableCell>
                        <TableCell className="text-sm capitalize">{l.tipo ?? "—"}</TableCell>
                        <TableCell className="whitespace-nowrap text-sm">
                          {l.inicio ? formatarData(l.inicio) : "?"}
                          {" – "}
                          {l.fim ? formatarData(l.fim) : "permanente"}
                        </TableCell>
                        <TableCell>
                          {l.oficioId ? (
                            <Link
                              href={`/painel/ferramentas/oficios/${l.oficioId}`}
                              className="text-primary line-clamp-1 max-w-56 text-sm hover:underline"
                              title={l.oficioRotulo ?? undefined}
                            >
                              {l.oficioRotulo}
                            </Link>
                          ) : l.documentoUrl ? (
                            <a
                              href={l.documentoUrl}
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
                          <RemoverLiberacao liberacaoId={l.id} mandatoId={mandato.id} />
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </div>
      )}
    </>
  )
}
