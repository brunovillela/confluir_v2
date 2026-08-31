import type { Metadata } from "next"
import Link from "next/link"
import { ArrowLeft, QrCode } from "lucide-react"

import { Alert, AlertDescription } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { requirePermissao } from "@/lib/auth"
import { listarQrCodes } from "@/lib/db/comunicacao-qrcodes"
import { formatarData, formatarDataHora } from "@/lib/formato"

import { QrNovoForm } from "./qr-forms"

export const metadata: Metadata = { title: "QR Codes — Confluir" }

export default async function QrCodesPage({
  searchParams,
}: {
  searchParams: Promise<{ excluido?: string; destino?: string }>
}) {
  await requirePermissao("noticias")
  const { excluido, destino } = await searchParams
  const { ativo, linhas } = await listarQrCodes()

  return (
    <>
      <div>
        <Button asChild variant="ghost" size="sm" className="-ml-2 mb-3">
          <Link href="/painel/comunicacao">
            <ArrowLeft />
            Comunicação
          </Link>
        </Button>
        <h1 className="text-2xl font-semibold tracking-tight">QR Codes</h1>
        <p className="text-muted-foreground mt-1 text-xs">
          QR Codes dinâmicos para peças digitais e impressas — a imagem aponta
          para um link curto do sistema, então dá para trocar o destino ou
          desativar sem reimprimir nada.
        </p>
      </div>

      {!ativo && (
        <Alert variant="destructive">
          <AlertDescription>
            O schema desta área ainda não foi criado — rode{" "}
            <code>supabase/comunicacao-qrcodes.sql</code> no SQL Editor do
            Supabase para ativar.
          </AlertDescription>
        </Alert>
      )}

      {excluido === "1" && (
        <Alert className="border-success/40 text-success-fg">
          <AlertDescription>QR Code excluído.</AlertDescription>
        </Alert>
      )}

      <div className="overflow-x-auto rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/50">
              <TableHead>QR Code</TableHead>
              <TableHead className="hidden md:table-cell">Finalidade</TableHead>
              <TableHead>Situação</TableHead>
              <TableHead className="text-right">Leituras</TableHead>
              <TableHead className="hidden lg:table-cell">
                Última leitura
              </TableHead>
              <TableHead className="hidden sm:table-cell">Criado por</TableHead>
              <TableHead className="hidden sm:table-cell">Criado em</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {linhas.length === 0 && (
              <TableRow>
                <TableCell colSpan={7} className="h-32">
                  <div className="text-muted-foreground flex flex-col items-center justify-center gap-2 text-center">
                    <QrCode className="size-6" />
                    <p className="text-sm">
                      Nenhum QR Code emitido ainda — gere o primeiro abaixo.
                    </p>
                  </div>
                </TableCell>
              </TableRow>
            )}
            {linhas.map((q) => (
              <TableRow key={q.id}>
                <TableCell className="max-w-56 font-medium">
                  <Link
                    href={`/painel/comunicacao/qrcodes/${q.id}`}
                    className="hover:underline"
                  >
                    <span className="block truncate">
                      {q.titulo ?? q.slug}
                    </span>
                  </Link>
                  <span className="text-muted-foreground block truncate text-xs">
                    /q/{q.slug} → {q.destino_url ?? "—"}
                  </span>
                </TableCell>
                <TableCell className="text-muted-foreground hidden max-w-48 truncate md:table-cell">
                  {q.finalidade ?? "—"}
                </TableCell>
                <TableCell>
                  {q.ativo ? (
                    <Badge
                      variant="outline"
                      className="border-success/40 text-success-fg"
                    >
                      Ativo
                    </Badge>
                  ) : (
                    <Badge variant="outline" className="text-muted-foreground">
                      Inativo
                    </Badge>
                  )}
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {q.leituras}
                </TableCell>
                <TableCell className="text-muted-foreground hidden whitespace-nowrap lg:table-cell">
                  {q.ultima_leitura ? formatarDataHora(q.ultima_leitura) : "—"}
                </TableCell>
                <TableCell className="text-muted-foreground hidden max-w-36 truncate sm:table-cell">
                  {q.criadoPorNome ?? "—"}
                </TableCell>
                <TableCell className="text-muted-foreground hidden whitespace-nowrap sm:table-cell">
                  {formatarData(q.created_at)}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <Card className="max-w-2xl">
        <CardHeader>
          <CardTitle className="text-base">Novo QR Code</CardTitle>
          <CardDescription>
            Depois de gerar, abra o QR para baixar a imagem nos tamanhos para
            peças digitais ou impressas (PNG e vetor SVG).
          </CardDescription>
        </CardHeader>
        <CardContent>
          <QrNovoForm defaultDestino={destino} />
        </CardContent>
      </Card>
    </>
  )
}
