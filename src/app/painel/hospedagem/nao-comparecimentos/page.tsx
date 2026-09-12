import type { Metadata } from "next"
import Link from "next/link"
import { ArrowLeft } from "lucide-react"

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
import { listarHoteis } from "@/lib/db/hospedagem"
import {
  lerRegraNaoComparecimento,
  listarLiberacoes,
  listarNaoComparecimentos,
} from "@/lib/db/hospedagem-garantida"
import { formatarCnpjCpf, formatarData } from "@/lib/formato"
import {
  dataBR,
  descreverRegraNaoComparecimento,
} from "@/lib/hospedagem-garantida-constantes"

import { AbonarForm, LiberarForm } from "./formularios"

export const metadata: Metadata = { title: "Não comparecimentos — Confluir" }

export default async function NaoComparecimentosPage() {
  await requirePermissao("filiacao_hospedagens_gestao")

  const hoteis = await listarHoteis()
  const [{ instalado, faltas }, liberacoes, regra] = await Promise.all([
    listarNaoComparecimentos(hoteis),
    listarLiberacoes(),
    lerRegraNaoComparecimento(),
  ])
  const descricao = descreverRegraNaoComparecimento(regra)

  return (
    <>
      <div>
        <Button variant="ghost" size="sm" asChild className="-ml-2 mb-3">
          <Link href="/painel/hospedagem">
            <ArrowLeft />
            Hospedagem
          </Link>
        </Button>
        <h1 className="text-2xl font-semibold tracking-tight">Não comparecimentos</h1>
        <p className="text-muted-foreground mt-1 text-xs">
          Reservas de demanda garantida sem entrada registrada no hotel. Falta é
          a reserva não cancelada sem entrada até o fim do dia do check-in.
        </p>
      </div>

      <Alert variant={descricao ? "info" : "default"}>
        <AlertDescription>
          {descricao ? (
            <>
              <strong>Punição em vigor:</strong> {descricao}
            </>
          ) : (
            "Nenhuma punição ligada: as faltas ficam registradas, mas não bloqueiam ninguém."
          )}{" "}
          A regra se configura em{" "}
          <Link href="/painel/filiados/direitos" className="underline">
            Configurações de filiação
          </Link>
          .
        </AlertDescription>
      </Alert>

      {!instalado && (
        <Alert variant="destructive">
          <AlertDescription>
            Rode supabase/hospedagem-demanda-garantida.sql no Supabase.
          </AlertDescription>
        </Alert>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Reservas sem comparecimento</CardTitle>
          <CardDescription>
            Abone a falta com justificativa quando houver motivo: ela deixa de
            contar para a punição.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {faltas.length === 0 ? (
            <p className="text-muted-foreground text-sm">Nenhuma falta registrada.</p>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Filiado</TableHead>
                    <TableHead>Hotel</TableHead>
                    <TableHead>Estadia</TableHead>
                    <TableHead>Abono</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {faltas.map((f) => (
                    <TableRow key={f.cupomId}>
                      <TableCell>
                        <span className="font-medium">{f.nome ?? "—"}</span>
                        <span className="text-muted-foreground block text-xs tabular-nums">
                          {f.cpf ? formatarCnpjCpf(f.cpf) : "—"}
                        </span>
                      </TableCell>
                      <TableCell className="text-muted-foreground">{f.hotelNome ?? "—"}</TableCell>
                      <TableCell className="text-muted-foreground whitespace-nowrap">
                        {dataBR(f.checkIn)} a {dataBR(f.checkOut)}
                      </TableCell>
                      <TableCell>
                        {f.abonadoEm ? (
                          <div className="grid gap-0.5">
                            <Badge variant="secondary" className="w-fit">
                              abonada em {formatarData(f.abonadoEm)}
                            </Badge>
                            {f.abonoMotivo && (
                              <span className="text-muted-foreground text-xs">{f.abonoMotivo}</span>
                            )}
                          </div>
                        ) : (
                          <AbonarForm cupomId={f.cupomId} />
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Liberar punição</CardTitle>
          <CardDescription>
            Para suspensão ou direito desabilitado: a partir da liberação, as
            faltas anteriores da pessoa deixam de contar.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4">
          <LiberarForm />
          {liberacoes.length > 0 && (
            <div className="grid gap-2">
              {liberacoes.map((l) => (
                <div key={l.id} className="rounded-lg border px-3 py-2 text-sm">
                  <span className="font-medium tabular-nums">{formatarCnpjCpf(l.cpf)}</span>
                  <span className="text-muted-foreground"> · {formatarData(l.criadoEm)}</span>
                  {l.motivo && <p className="text-muted-foreground text-xs">{l.motivo}</p>}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </>
  )
}
