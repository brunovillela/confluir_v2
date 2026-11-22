import type { Metadata } from "next"
import Link from "next/link"
import { notFound } from "next/navigation"
import { FileDown } from "lucide-react"

import { RotuloTrilha } from "@/components/layout/trilha-rotulos"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { requirePermissao } from "@/lib/auth"
import { obterCongresso } from "@/lib/db/congressos"
import { dadosDosCertificados } from "@/lib/db/congressos-encerramento"

import { EmitirCertificados, RevogarCertificado } from "../../encerramento-componentes"

export const metadata: Metadata = { title: "Certificados — Confluir" }

/** Quem tem direito ao certificado (credenciamento e frequência), emissão em lote e revogação. */
export default async function CertificadosPage({ params }: { params: Promise<{ id: string }> }) {
  await requirePermissao("congressos_gestao")
  const { id } = await params
  const c = await obterCongresso(id)
  if (!c) notFound()
  const d = await dadosDosCertificados(c)
  const base = `/painel/representacao/congressos/${id}`
  const comDireito = d.linhas.filter((l) => l.direito.tem)
  const emitidos = d.linhas.filter((l) => l.certificado)

  return (
    <>
      <RotuloTrilha valores={{ congressos: "Congressos", [id]: c.nome, certificados: "Certificados" }} />
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Certificados</h1>
          <p className="text-muted-foreground mt-1 max-w-2xl text-xs">
            {comDireito.length} com direito · {emitidos.length} emitido(s) · frequência mínima {d.minimo}% sobre {d.sessoesRealizadas} sessão(ões) com
            presença registrada. Cada participante também baixa o seu pelo link pessoal depois do encerramento.
          </p>
        </div>
        <div className="flex flex-wrap items-start gap-2">
          {d.regra !== "nao" && <EmitirCertificados congressoId={id} />}
          {emitidos.length > 0 && (
            <Button asChild variant="outline" size="sm">
              <Link href={`${base}/certificados/pdf`} target="_blank">
                <FileDown />
                Todos em PDF
              </Link>
            </Button>
          )}
          <Button asChild variant="outline" size="sm">
            <Link href={`${base}?aba=encerramento`}>Encerramento</Link>
          </Button>
        </div>
      </div>
      {d.regra === "nao" && (
        <Alert>
          <AlertDescription>A configuração deste congresso não emite certificado.</AlertDescription>
        </Alert>
      )}
      <div className="overflow-x-auto rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Nome</TableHead>
              <TableHead>Papel · base</TableHead>
              <TableHead className="text-right">Frequência</TableHead>
              <TableHead>Certificado</TableHead>
              <TableHead />
            </TableRow>
          </TableHeader>
          <TableBody>
            {d.linhas.map((l) => (
              <TableRow key={l.participanteId}>
                <TableCell className="font-medium">{l.nome}</TableCell>
                <TableCell className="text-muted-foreground text-xs">{[l.papel, l.base].filter(Boolean).join(" · ") || "—"}</TableCell>
                <TableCell className="text-right tabular-nums">{l.frequencia === null ? "—" : `${l.frequencia}%`}</TableCell>
                <TableCell>
                  {l.certificado ? (
                    <Link href={`${base}/certificados/pdf?p=${l.participanteId}`} target="_blank" className="font-mono text-xs underline underline-offset-2">
                      {l.certificado.codigo}
                    </Link>
                  ) : l.direito.tem ? (
                    <Badge variant="secondary">Tem direito</Badge>
                  ) : (
                    <span className="text-muted-foreground text-xs">{l.direito.motivo}</span>
                  )}
                </TableCell>
                <TableCell className="text-right">{l.certificado && <RevogarCertificado congressoId={id} id={l.certificado.id} />}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </>
  )
}
